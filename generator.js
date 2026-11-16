import { MODES, MARKETS, CORNER_LINES, cornerType, isCornerType, typeLabel, DEFAULT_TYPES, generateTicket, swapSelection, judgeSelection, judgeTicket, ticketOdds } from './scripts/generator-lib.mjs';

const $ = s => document.querySelector(s);
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hhmm = iso => new Date(iso).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2200); };

const MODE_INFO = { '5x': 'Cel mai sigur', '10x': 'Risc mic', '25x': 'Risc mediu', '50x': 'Risc mare' };
let DATA = { matches: [] }, SCORES = {}, mode = LS.get('gen_mode', '5x'), types = new Set(LS.get('gen_types', DEFAULT_TYPES)), ticket = null;
let minO = LS.get('gen_minO', ''), maxO = LS.get('gen_maxO', '');

async function load() {
  const bust = '?t=' + Math.floor(Date.now() / 60000);
  try { DATA = await (await fetch('generator/azi.json' + bust, { cache: 'no-store' })).json(); } catch (e) { DATA = { matches: [] }; }
  try { SCORES = await (await fetch('generator/scoruri.json' + bust, { cache: 'no-store' })).json(); } catch (e) { SCORES = {}; }
  const n = DATA.matches.filter(m => m.vulnerable && new Date(m.kickoff) > Date.now()).length;
  $('#sub').textContent = DATA.generatedAt ? `${n} meciuri vulnerabile încă neînceputute · actualizat ${new Date(DATA.generatedAt).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' })} (ora României)` : 'Nu sunt date încă. Revino în câteva minute.';
  renderVul(); renderMine();
}

// ---- moduri + filtre ----
function renderModes() {
  $('#modes').innerHTML = Object.keys(MODES).map(k => `<button type="button" class="g-mode" data-m="${k}" aria-pressed="${k === mode}"><b>${k}</b><span>${MODE_INFO[k]}</span></button>`).join('');
}
function allTypes() { return [...Object.keys(MARKETS).filter(t => !MARKETS[t].optional), ...CORNER_LINES.map(cornerType), ...Object.keys(MARKETS).filter(t => MARKETS[t].optional)]; }
function renderTypes() {
  $('#types').innerHTML = allTypes().map(t => `<button type="button" data-t="${t}" aria-pressed="${types.has(t)}">${esc(typeLabel(t))}${MARKETS[t] && MARKETS[t].optional ? ' (nerecomandat)' : ''}</button>`).join('');
  const def = types.size === DEFAULT_TYPES.length && DEFAULT_TYPES.every(t => types.has(t)) && !minO && !maxO;
  $('#adv-sum').textContent = def ? 'Piețe implicite' : 'Filtre personalizate';
}
$('#modes').addEventListener('click', e => { const b = e.target.closest('.g-mode'); if (!b) return; mode = b.dataset.m; LS.set('gen_mode', mode); renderModes(); });
$('#types').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const t = b.dataset.t; types.has(t) ? types.delete(t) : types.add(t); LS.set('gen_types', [...types]); renderTypes(); });
$('#minO').value = minO; $('#maxO').value = maxO;
$('#minO').addEventListener('input', e => { minO = e.target.value; LS.set('gen_minO', minO); renderTypes(); });
$('#maxO').addEventListener('input', e => { maxO = e.target.value; LS.set('gen_maxO', maxO); renderTypes(); });
$('#reset').addEventListener('click', () => { types = new Set(DEFAULT_TYPES); minO = maxO = ''; $('#minO').value = $('#maxO').value = ''; LS.set('gen_types', [...types]); LS.set('gen_minO', ''); LS.set('gen_maxO', ''); renderTypes(); });
const filters = () => ({ marketTypes: [...types], minLineOdds: minO ? +minO : null, maxLineOdds: maxO ? +maxO : null });

// ---- generare ----
function recent() { return LS.get('gen_recent', []); }
function remember(sig) { LS.set('gen_recent', [...recent(), sig].slice(-8)); }
function generate() {
  if (!DATA.matches.length) { $('#out').innerHTML = '<div class="g-msg">Nu avem încă meciuri analizate pentru azi. Datele se actualizează de câteva ori pe zi.</div>'; return; }
  const t = generateTicket({ matches: DATA.matches, mode, filters: filters(), recentSignatures: recent() });
  $('#again').hidden = false;
  if (t.error === 'not_enough_matches') { ticket = null; $('#out').innerHTML = '<div class="g-msg"><b>Prea puține meciuri vulnerabile</b> pentru filtrele alese. Încearcă să bifezi mai multe piețe sau să lărgești intervalul de cote.</div>'; return; }
  if (t.error === 'target_odds_unreachable') { ticket = null; const p = t.partial; $('#out').innerHTML = `<div class="g-msg"><b>Nu se poate atinge ținta ${p.targetOdds}x</b> cu meciurile de azi: cea mai bună combinație dă doar ${p.totalOdds}. Încearcă un mod mai mic sau mai multe piețe.</div>` + renderTicket({ ...p, partial: true }); ticket = null; return; }
  ticket = t; remember(t.signature); $('#out').innerHTML = renderTicket(t);
}
const reason = s => s.sampleSize ? `gazde ${s.hitHome}/${s.sampleSize} · oaspeți ${s.hitAway}/${s.sampleSize}` : esc(s.model || 'model pe medii');
function renderTicket(t, mine) {
  const rows = t.selections.map((s, i) => { const imp = Math.round(100 / s.odds), edge = s.percentage - imp;
    return `<div class="g-sl"><div class="g-m">${esc(s.home)} – ${esc(s.away)}${s.res ? `<span class="g-res ${s.res}">${{ won: 'CÂȘTIGAT', lost: 'PIERDUT', void: 'ANULAT' }[s.res]}</span>` : ''}</div><div class="g-od">${s.odds.toFixed(2)}</div>
      <div class="g-meta">${hhmm(s.kickoff)} · ${esc(s.league)}</div><div class="g-mk">${esc(typeLabel(s.type))}</div>
      <div class="g-why">${reason(s)} · formă ${s.percentage}% vs cotă ${imp}% <span class="${edge > 0 ? 'g-ok' : 'g-no'}">(${edge > 0 ? '+' : ''}${edge} pp)</span></div>
      ${t.partial || mine ? '' : `<button type="button" class="g-sw" data-i="${i}">Schimbă meciul</button>`}</div>`; }).join('');
  const ok = !t.partial && t.totalOdds >= MODES[t.mode].minAccept && t.totalOdds <= MODES[t.mode].maxAccept;
  return `<div class="g-tk"><div class="g-tk-h"><div><b>Bilet ${t.targetOdds}x</b> <span>${t.selections.length} selecții</span></div><div><span>țintă ${t.targetOdds}</span> <span class="g-tot">${t.totalOdds.toFixed(2)}</span></div></div>${rows}
    ${t.partial || mine ? '' : `<div class="g-tk-f"><small>${ok ? 'Cota totală e în intervalul țintei.' : ''} Cotele pot varia până plasezi biletul.</small><span><button type="button" id="save">Salvează biletul</button> <button type="button" id="copy">Copiază</button></span></div>`}</div>`;
}
$('#go').addEventListener('click', generate);
$('#again').addEventListener('click', generate);
$('#out').addEventListener('click', e => {
  const sw = e.target.closest('.g-sw'); if (sw && ticket) { const r = swapSelection(ticket, +sw.dataset.i, DATA.matches, { filters: filters() }); if (r.error) return toast('Nu există alt meci potrivit'); ticket = r; $('#out').innerHTML = renderTicket(ticket); return; }
  if (e.target.id === 'save' && ticket) { const L = LS.get('gen_mine', []); if (L.some(x => x.signature === ticket.signature && x.generatedAt === ticket.generatedAt)) return toast('Biletul e deja salvat'); LS.set('gen_mine', [{ ...ticket, id: Date.now() }, ...L].slice(0, 30)); toast('Bilet salvat'); renderMine(); return; }
  if (e.target.id === 'copy' && ticket) { const txt = `Bilet ${ticket.targetOdds}x · cotă ${ticket.totalOdds.toFixed(2)}\n` + ticket.selections.map(s => `${hhmm(s.kickoff)} ${s.home} – ${s.away}: ${typeLabel(s.type)} (${s.odds.toFixed(2)})`).join('\n'); navigator.clipboard && navigator.clipboard.writeText(txt).then(() => toast('Copiat'), () => toast('Nu am putut copia')); }
});

// ---- biletele mele (decontate din scoruri.json) ----
function renderMine() {
  const L = LS.get('gen_mine', []); $('#mine-sec').hidden = !L.length; if (!L.length) return;
  $('#mine').innerHTML = L.map(t => {
    const sels = t.selections.map(s => ({ ...s, res: judgeSelection(s, SCORES[s.matchId]) }));
    const st = judgeTicket(sels);
    return `<div class="g-mine-t ${st || ''}"><div class="h"><b>${t.targetOdds}x · cotă ${ticketOdds(sels).toFixed(2)}</b><span>${st === 'won' ? 'CÂȘTIGAT' : st === 'lost' ? 'PIERDUT' : st === 'void' ? 'ANULAT' : 'în așteptare'} · ${hhmm(t.generatedAt)}</span></div>
      <ul>${sels.map(s => `<li>${esc(s.home)} – ${esc(s.away)}: ${esc(typeLabel(s.type))} (${s.odds.toFixed(2)})${s.res ? `<span class="g-res ${s.res}">${{ won: 'CÂȘTIGAT', lost: 'PIERDUT', void: 'ANULAT' }[s.res]}</span>` : isCornerType(s.type) ? ' <i>(cornere: decontare manuală)</i>' : ''}</li>`).join('')}</ul></div>`; }).join('');
}

// ---- lista meciurilor vulnerabile ----
const sc = x => `${x.ft[0]}-${x.ft[1]} <span>(${x.ht[0]}-${x.ht[1]})</span>`;
function renderVul() {
  const V = DATA.matches.filter(m => m.vulnerable && new Date(m.kickoff) > Date.now()).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  $('#vcnt').textContent = V.length ? `(${V.length})` : '';
  $('#vul').innerHTML = V.length ? V.map(m => `<div class="g-vm"><div class="g-vm-h"><b>${esc(m.home)} – ${esc(m.away)}</b><span>${hhmm(m.kickoff)} · ${esc(m.league)}</span></div>
    <div class="g-sg">${m.markets.filter(x => x.signal).map(x => `<span>${esc(typeLabel(x.type))}${x.odds ? ` @${x.odds.toFixed(2)}` : ''}<em>${x.sampleSize ? `${x.hitHome}/${x.sampleSize} · ${x.hitAway}/${x.sampleSize}` : x.percentage + '%'}</em></span>`).join('')}</div>
    <div class="g-lf"><div><b>${esc(m.home)}, ultimele 5</b>${m.last5.home.map(x => `<p>${x.home ? 'acasă' : 'depl.'} vs ${esc(x.opp)} · ${sc(x)}</p>`).join('')}</div>
    <div><b>${esc(m.away)}, ultimele 5</b>${m.last5.away.map(x => `<p>${x.home ? 'acasă' : 'depl.'} vs ${esc(x.opp)} · ${sc(x)}</p>`).join('')}</div></div></div>`).join('')
    : '<div class="g-msg">Niciun meci vulnerabil neînceput acum. Verifică mai târziu sau mâine dimineață.</div>';
}

renderModes(); renderTypes(); load();
