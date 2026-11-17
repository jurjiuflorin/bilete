import { MODES, MARKETS, CORNER_LINES, cornerType, isCornerType, typeLabel, DEFAULT_TYPES, generateTicket, swapSelection, judgeSelection, judgeTicket, ticketOdds } from './scripts/generator-lib.mjs';

const $ = s => document.querySelector(s);
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hhmm = iso => new Date(iso).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2200); };

const MODE_INFO = { '5x': 'Cel mai sigur', '10x': 'Risc mic', '25x': 'Risc mediu', '50x': 'Risc mare' };
let DATA = { matches: [] }, SCORES = {}, mode = LS.get('gen_mode', '5x'), types = new Set(LS.get('gen_types', DEFAULT_TYPES)), ticket = null;
let minO = LS.get('gen_minO', ''), maxO = LS.get('gen_maxO', ''), leagues = new Set(LS.get('gen_leagues', [])), TEST = { days: {} }, CODES = {}, kmin = +LS.get('gen_k', 4);

function sub() {
  const n = M().filter(m => m.vulnerable && new Date(m.kickoff) > Date.now()).length;
  $('#sub').textContent = DATA.generatedAt ? `${n} meciuri vulnerabile încă neînceputute (semnal ${kmin} din 5) · actualizat ${new Date(DATA.generatedAt).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' })} (ora României)` : 'Nu sunt date încă. Revino în câteva minute.';
}
async function load() {
  const bust = '?t=' + Math.floor(Date.now() / 60000);
  try { DATA = await (await fetch('generator/azi.json' + bust, { cache: 'no-store' })).json(); } catch (e) { DATA = { matches: [] }; }
  try { SCORES = await (await fetch('generator/scoruri.json' + bust, { cache: 'no-store' })).json(); } catch (e) { SCORES = {}; }
  sub();
  try { CODES = await (await fetch('generator/coduri.json' + bust, { cache: 'no-store' })).json(); } catch (e) { CODES = {}; }
  try { TEST = await (await fetch('generator/bilete.json' + bust, { cache: 'no-store' })).json(); } catch (e) { TEST = { days: {} }, kmin = +LS.get('gen_k', 4); }
  renderK(); renderVul(); renderMine(); renderLeagues(); renderTypes(); renderTest();
}

// ---- moduri + filtre ----
function renderModes() {
  $('#modes').innerHTML = Object.keys(MODES).map(k => `<button type="button" class="g-mode" data-m="${k}" aria-pressed="${k === mode}"><b>${k}</b><span>${MODE_INFO[k]}</span></button>`).join('');
}
function allTypes() { return [...Object.keys(MARKETS).filter(t => !MARKETS[t].optional), ...CORNER_LINES.map(cornerType), ...Object.keys(MARKETS).filter(t => MARKETS[t].optional)]; }
function renderTypes() {
  $('#types').innerHTML = allTypes().map(t => `<button type="button" data-t="${t}" aria-pressed="${types.has(t)}">${esc(typeLabel(t))}${MARKETS[t] && MARKETS[t].optional ? ' (nerecomandat)' : ''}</button>`).join('');
  const def = types.size === DEFAULT_TYPES.length && DEFAULT_TYPES.every(t => types.has(t)) && !minO && !maxO && !leagues.size && kmin === 4;
  $('#adv-sum').textContent = def ? 'Piețe implicite, toate ligile' : kmin !== 4 && !leagues.size ? 'Semnal ' + kmin + ' din 5' : leagues.size ? 'Ligi: ' + leagues.size + ' selectate' : 'Filtre personalizate';
}
$('#modes').addEventListener('click', e => { const b = e.target.closest('.g-mode'); if (!b) return; mode = b.dataset.m; LS.set('gen_mode', mode); renderModes(); });
$('#types').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const t = b.dataset.t; types.has(t) ? types.delete(t) : types.add(t); LS.set('gen_types', [...types]); renderTypes(); });
$('#minO').value = minO; $('#maxO').value = maxO;
$('#minO').addEventListener('input', e => { minO = e.target.value; LS.set('gen_minO', minO); renderTypes(); });
$('#maxO').addEventListener('input', e => { maxO = e.target.value; LS.set('gen_maxO', maxO); renderTypes(); });
$('#reset').addEventListener('click', () => { kmin = 4; LS.set('gen_k', 4); renderK(); renderVul(); sub(); leagues = new Set(); LS.set('gen_leagues', []); renderLeagues(); types = new Set(DEFAULT_TYPES); minO = maxO = ''; $('#minO').value = $('#maxO').value = ''; LS.set('gen_types', [...types]); LS.set('gen_minO', ''); LS.set('gen_maxO', ''); renderTypes(); });
// recalculează semnalele după pragul ales (x din 5); piețele de cornere (model) folosesc x·20%
const withK = k => DATA.matches.map(m => { const markets = m.markets.map(x => ({ ...x, signal: x.sampleSize ? (x.hitHome >= k && x.hitAway >= k) : x.percentage >= k * 20 })); const signals = markets.filter(x => x.signal).length; return { ...m, markets, signals, vulnerable: signals >= 2 }; });
const M = () => withK(kmin);
function renderK() { $('#kmin').innerHTML = [3, 4, 5].map(k => `<button type="button" data-k="${k}" aria-pressed="${k === kmin}">${k} din 5${k === 4 ? ' (implicit)' : ''}</button>`).join(''); }
$('#kmin').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; kmin = +b.dataset.k; LS.set('gen_k', kmin); renderK(); renderLeagues(); renderTypes(); renderVul(); sub(); });
const filters = () => ({ marketTypes: [...types], minLineOdds: minO ? +minO : null, maxLineOdds: maxO ? +maxO : null, leagues: [...leagues] });
function renderLeagues() {
  const L = [...new Set(M().filter(m => m.vulnerable).map(m => m.league))].sort();
  $('#leagues').innerHTML = L.length ? L.map(x => `<button type="button" data-l="${esc(x)}" aria-pressed="${leagues.has(x)}">${esc(x)}</button>`).join('') : '<span class="g-hint">Ligile apar când există meciuri vulnerabile.</span>';
  $('#adv-sum').textContent = leagues.size ? `Ligi: ${leagues.size} selectate` : $('#adv-sum').textContent;
}
$('#leagues').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const l = b.dataset.l; leagues.has(l) ? leagues.delete(l) : leagues.add(l); LS.set('gen_leagues', [...leagues]); renderLeagues(); renderTypes(); });

// ---- generare ----
function recent() { return LS.get('gen_recent', []); }
function remember(sig) { LS.set('gen_recent', [...recent(), sig].slice(-8)); }
let outMsg = '';
const showT = () => { $('#out').innerHTML = outMsg + renderTicket(ticket); };
function generate() {
  outMsg = '';
  if (!DATA.matches.length) { $('#out').innerHTML = '<div class="g-msg">Nu avem încă meciuri analizate pentru azi. Datele se actualizează de câteva ori pe zi.</div>'; return; }
  const t = generateTicket({ matches: M(), mode, filters: filters(), recentSignatures: recent() });
  $('#again').hidden = false;
  if (t.error === 'not_enough_matches') { ticket = null; $('#out').innerHTML = '<div class="g-msg"><b>Prea puține meciuri vulnerabile</b> pentru filtrele alese. Încearcă să bifezi mai multe piețe sau să lărgești intervalul de cote.</div>'; return; }
  if (t.error === 'target_odds_unreachable') { ticket = null; const p = t.partial; ticket = { ...p, id: Date.now(), generatedAt: new Date().toISOString(), partial: true }; outMsg = `<div class="g-msg"><b>Nu se poate atinge ținta ${p.targetOdds}x</b> cu meciurile de azi: cea mai bună combinație dă doar ${p.totalOdds}. Încearcă un mod mai mic sau mai multe piețe. Îl poți salva oricum.</div>`; showT(); return; }
  ticket = { ...t, id: Date.now() }; remember(t.signature); showT();
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
    ${mine ? '' : `<div class="g-tk-f"><small>${ok ? 'Cota totală e în intervalul țintei. ' : ''}Cotele pot varia până la pregătirea biletului.</small><span>${isSaved(t.id) ? '<button type="button" disabled>Salvat ✓</button>' : '<button type="button" id="save" class="g-primary">Salvează biletul</button>'} <button type="button" id="copy">Copiază</button></span></div>`}</div>`;
}
$('#go').addEventListener('click', generate);
$('#again').addEventListener('click', generate);
$('#out').addEventListener('click', e => {
  const sw = e.target.closest('.g-sw'); if (sw && ticket) { const r = swapSelection(ticket, +sw.dataset.i, M(), { filters: filters() }); if (r.error) return toast('Nu există alt meci potrivit'); ticket = r; if (isSaved(r.id)) saveMine(r); showT(); return; }
  if (e.target.id === 'save' && ticket) { saveMine(ticket); showT(); toast('Bilet salvat în „Biletele mele”'); return; }
  if (e.target.id === 'copy' && ticket) { const txt = `Bilet ${ticket.targetOdds}x · cotă ${ticket.totalOdds.toFixed(2)}\n` + ticket.selections.map(s => `${hhmm(s.kickoff)} ${s.home} – ${s.away}: ${typeLabel(s.type)} (${s.odds.toFixed(2)})`).join('\n'); navigator.clipboard && navigator.clipboard.writeText(txt).then(() => toast('Copiat'), () => toast('Nu am putut copia')); }
});

// ---- biletele mele (salvate de tine, decontate din scoruri.json) ----
const isSaved = id => LS.get('gen_mine', []).some(x => x.id === id);
function saveMine(t) { const L = LS.get('gen_mine', []); const i = L.findIndex(x => x.id === t.id); if (i >= 0) L[i] = { ...L[i], ...t, code: L[i].code }; else L.unshift({ ...t }); LS.set('gen_mine', L.slice(0, 200)); renderMine(); }
const LBL = { '5x': 'Bilet 5x', '10x': 'Bilet 10x', '25x': 'Bilet 25x', '50x': 'Bilet 50x' };
function renderMine() {
  const L = LS.get('gen_mine', []); $('#nmine').textContent = L.length ? '(' + L.length + ')' : '';
  const J = L.map(t => { const sels = t.selections.map(s => ({ ...s, res: judgeSelection(s, SCORES[s.matchId]) })); return { t, sels, st: judgeTicket(sels) }; });
  const w = J.filter(x => x.st === 'won').length, l = J.filter(x => x.st === 'lost').length;
  $('#mstats').innerHTML = L.length ? `<div class="g-sum"><div><b>${L.length}</b><span>generate</span></div><div><b>${w}</b><span>câștigate</span></div><div><b>${l}</b><span>pierdute</span></div><div><b>${L.length - w - l}</b><span>în așteptare</span></div></div>` : '';
  $('#mine').innerHTML = L.length ? J.map(({ t, sels, st }) => `<div class="g-mine-t ${st || ''}" data-id="${t.id}"><div class="h"><b>${LBL[t.mode] || 'Bilet'} · cotă ${ticketOdds(sels).toFixed(2)}</b><span>${STAT_[st] || 'în așteptare'} · ${hhmm(t.generatedAt)}</span></div>
      <ul>${sels.map(s => `<li>${esc(s.home)} – ${esc(s.away)}: ${esc(typeLabel(s.type))} (${s.odds.toFixed(2)})${s.res ? `<span class="g-res ${s.res}">${STAT_[s.res]}</span>` : isCornerType(s.type) ? ' <i>(cornere: decontare manuală)</i>' : ''}</li>`).join('')}</ul>
      ${codeBox(t)}<div class="g-act"><label>Cod agenție<input class="g-code" value="${esc(CODES[t.id] ? CODES[t.id].code : t.code || '')}" placeholder="ex. 990O-KLTRBB" maxlength="14"></label><button type="button" class="g-cp">Copiază</button><button type="button" class="g-del">Șterge</button></div></div>`).join('') : '<div class="g-msg">Încă nu ai bilete salvate. Generează unul din tabul „Generator” și apasă „Salvează biletul”.</div>';
}
const REPO = 'jurjiuflorin/bilete';
function reqUrl(t) { const body = JSON.stringify({ id: t.id, mode: t.mode, total: t.totalOdds, sel: t.selections.map(s => [s.matchId, s.type, s.odds]) });
  return `https://github.com/${REPO}/issues/new?labels=cod&title=${encodeURIComponent('Cod Superbet · bilet ' + t.id)}&body=${encodeURIComponent('Cerere de cod de agenție (nu se plasează nimic). Trimite issue-ul; codul apare pe site la bilet.\n\n```json\n' + body + '\n```')}`; }
function codeBox(t) {
  const c = CODES[t.id];
  if (c) return `<div class="g-cod"><small>COD SUPERBET (agenție)</small><b>${esc(c.code)}</b><span>${c.odds ? 'cotă la pregătire ' + c.odds + ' · ' : ''}${hhmm(c.at)} · tu decizi dacă îl plasezi</span></div>`;
  if (t.req) return `<div class="g-cod wait"><small>Cerere trimisă</small><span>Aștept codul. Apare aici după ce îl pregătesc; reîncarcă pagina mai târziu.</span> <a href="${reqUrl(t)}" target="_blank" rel="noopener" class="g-lnk2">Retrimite</a></div>`;
  return `<div class="g-cod"><a href="${reqUrl(t)}" target="_blank" rel="noopener" class="g-ask" data-ask="${t.id}">Cere cod Superbet</a></div>`;
}
const STAT_ = { won: 'CÂȘTIGAT', lost: 'PIERDUT', void: 'ANULAT' };
$('#mine').addEventListener('input', e => { if (!e.target.classList.contains('g-code')) return; const id = +e.target.closest('.g-mine-t').dataset.id; const L = LS.get('gen_mine', []); const t = L.find(x => x.id === id); if (t) { t.code = e.target.value.trim().toUpperCase(); LS.set('gen_mine', L); } });
$('#mine').addEventListener('click', e => { const ask = e.target.closest('.g-ask'); if (ask) { const L = LS.get('gen_mine', []), t = L.find(x => x.id === +ask.dataset.ask); if (t) { t.req = Date.now(); LS.set('gen_mine', L); setTimeout(renderMine, 400); } return; } const card = e.target.closest('.g-mine-t'); if (!card) return; const id = +card.dataset.id; const L = LS.get('gen_mine', []); const t = L.find(x => x.id === id); if (!t) return;
  if (e.target.classList.contains('g-del')) { if (e.target.dataset.sure) { LS.set('gen_mine', L.filter(x => x.id !== id)); renderMine(); } else { e.target.dataset.sure = '1'; e.target.textContent = 'Sigur?'; setTimeout(() => { e.target.dataset.sure = ''; e.target.textContent = 'Șterge'; }, 2500); } }
  if (e.target.classList.contains('g-cp')) { const txt = `${LBL[t.mode] || 'Bilet'} · cotă ${ticketOdds(t.selections).toFixed(2)}${t.code ? ' · cod ' + t.code : ''}\n` + t.selections.map(s => `${hhmm(s.kickoff)} ${s.home} – ${s.away}: ${typeLabel(s.type)} (${s.odds.toFixed(2)})`).join('\n'); navigator.clipboard && navigator.clipboard.writeText(txt).then(() => toast('Copiat'), () => toast('Nu am putut copia')); } });

// ---- lista meciurilor vulnerabile ----
const sc = x => `${x.ft[0]}-${x.ft[1]} <span>(${x.ht[0]}-${x.ht[1]})</span>`;
function renderVul() {
  const V = M().filter(m => m.vulnerable && new Date(m.kickoff) > Date.now()).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  $('#vcnt').textContent = V.length ? `(${V.length})` : '';
  $('#vul').innerHTML = V.length ? V.map(m => `<div class="g-vm"><div class="g-vm-h"><b>${esc(m.home)} – ${esc(m.away)}</b><span>${hhmm(m.kickoff)} · ${esc(m.league)}</span></div>
    <div class="g-sg">${m.markets.filter(x => x.signal).map(x => `<span>${esc(typeLabel(x.type))}${x.odds ? ` @${x.odds.toFixed(2)}` : ''}<em>${x.sampleSize ? `${x.hitHome}/${x.sampleSize} · ${x.hitAway}/${x.sampleSize}` : x.percentage + '%'}</em></span>`).join('')}</div>
    <div class="g-lf"><div><b>${esc(m.home)}, ultimele 5</b>${m.last5.home.map(x => `<p>${x.home ? 'acasă' : 'depl.'} vs ${esc(x.opp)} · ${sc(x)}</p>`).join('')}</div>
    <div><b>${esc(m.away)}, ultimele 5</b>${m.last5.away.map(x => `<p>${x.home ? 'acasă' : 'depl.'} vs ${esc(x.opp)} · ${sc(x)}</p>`).join('')}</div></div></div>`).join('')
    : '<div class="g-msg">Niciun meci vulnerabil neînceput acum. Verifică mai târziu sau mâine dimineață.</div>';
}

// ---- rubrica „Bilete generator (test)” ----
const STAT = { won: 'CÂȘTIGAT', lost: 'PIERDUT', void: 'ANULAT' };
function renderTest() {
  const days = Object.keys(TEST.days || {}).filter(d => Object.keys(TEST.days[d].tickets || {}).length).sort().reverse(), all = days.flatMap(d => Object.values(TEST.days[d].tickets));
  const row = (label, L) => { const w = L.filter(t => t.status === 'won').length, l = L.filter(t => t.status === 'lost').length, p = L.length - w - l, dec = w + l;
    const roi = dec ? L.filter(t => t.status).reduce((s, t) => s + (t.status === 'won' ? t.totalOdds - 1 : t.status === 'lost' ? -1 : 0), 0) : 0;
    return `<tr><td>${label}</td><td>${L.length}</td><td>${w}</td><td>${l}</td><td>${p}</td><td>${dec ? Math.round(100 * w / dec) + '%' : '–'}</td><td>${dec ? (roi >= 0 ? '+' : '') + roi.toFixed(1) : '–'}</td></tr>`; };
  $('#tstats').innerHTML = all.length ? `<table class="g-tab"><thead><tr><th>Tip</th><th>Bilete</th><th>Câștigate</th><th>Pierdute</th><th>În așteptare</th><th>Reușită</th><th>Profit (unități)</th></tr></thead><tbody>${['challenge', 'cota2', 'cota5', 'cota10'].map(id => row(({ challenge: 'Challenge', cota2: 'Cotă 2', cota5: 'Cotă 5', cota10: 'Cotă 10' })[id], all.filter(t => t.id === id))).join('')}${row('<b>Total</b>', all)}</tbody></table>` : '';
  $('#tlist').innerHTML = days.length ? days.map(d => `<h3 class="g-day">${d.split('-').reverse().join('.')}</h3>` + Object.values(TEST.days[d].tickets).map(t => `<div class="g-mine-t ${t.status || ''}"><div class="h"><b>${esc(t.label)} · cotă ${t.totalOdds.toFixed(2)}</b><span>${STAT[t.status] || 'în așteptare'}</span></div>
      <ul>${t.selections.map(s => `<li>${hhmm(s.kickoff)} · ${esc(s.home)} – ${esc(s.away)}: ${esc(typeLabel(s.type))} (${s.odds.toFixed(2)}) <small>${esc(s.league)}</small>${s.res ? `<span class="g-res ${s.res}">${STAT[s.res]}</span>` : ''}</li>`).join('')}</ul></div>`).join('')).join('') : '<div class="g-msg">Încă nu există bilete de test. Primul apare după următoarea actualizare, într-o zi cu meciuri în ligile alese.</div>';
}
$('#seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; for (const x of $('#seg').children) x.setAttribute('aria-pressed', String(x === b)); $('#v-gen').hidden = b.dataset.v !== 'gen'; $('#v-mine').hidden = b.dataset.v !== 'mine'; $('#v-test').hidden = b.dataset.v !== 'test'; });
renderModes(); renderTypes(); load();
