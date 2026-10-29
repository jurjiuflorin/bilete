/* Biletele mele — site static pe GitHub Pages.
   Datele: bilete.json (scris de sarcinile programate). Scoruri live: datele publice Superbet. */
'use strict';
const $ = id => document.getElementById(id);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const MS = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
const ZI = ['duminică','luni','marți','miercuri','joi','vineri','sâmbătă'];
const REPO = 'jurjiuflorin/bilete';
const SA = 'https://scorealarm-stats.freetls.fastly.net/v2/soccer/fixtures/overview/rosuperbetsport/ro-RO?fixture-id=ax%3Amatch%3A';
const OFFER = 'https://production-superbet-offer-ro.freetls.fastly.net/v3/ro-RO/events?events=';
let rows = [], tab = 'p', tip = '', q = '', now = new Date();
// tickets already lost live (a match is certainly lost) but not yet settled by the nightly task
const lostNow = new Map(Object.entries((() => { try { return JSON.parse(localStorage.getItem('lostNow') || '{}'); } catch (e) { return {}; } })()));
const PEND = 'în așteptare';
const eff = r => r.status === PEND && lostNow.has(r.id) ? 'pierdut' : r.status;

/* ---------- helpers ---------- */
const nrm = x => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pad = n => String(n).padStart(2, '0');
const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fmtHM = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
const fmtDM = d => d.getDate() + ' ' + MS[d.getMonth()];
const fmtOdd = v => Number(v).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function pct(s) { if (s == null) return '–'; const v = s * 100; return (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + '%'; }
function oneIn(s) { if (!s || s < 0.0005) return ''; return 'cam 1 din ' + Math.round(1 / s).toLocaleString('ro-RO'); }
function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number); const dt = new Date(y, m - 1, d);
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((dt - t) / 864e5);
  const name = diff === 0 ? 'Azi' : diff === 1 ? 'Mâine' : diff === -1 ? 'Ieri' : ZI[dt.getDay()][0].toUpperCase() + ZI[dt.getDay()].slice(1);
  return [name, d + ' ' + MS[m - 1]];
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

// orele de pe bilete sunt scrise în ora României; le transformăm în momentul real, ca site-ul să le arate în ora telefonului
const RO_TZ = 'Europe/Bucharest';
const roParts = new Intl.DateTimeFormat('en-GB', { timeZone: RO_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function roOffset(t) { const p = {}; for (const x of roParts.formatToParts(new Date(t))) p[x.type] = x.value; return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 6e4) * 6e4; }
function roDate(y, mo, d, h, mi) { const g = Date.UTC(y, mo, d, h, mi); let t = g - roOffset(g); t = g - roOffset(t); return new Date(t); }
const LOCAL_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || RO_TZ; } catch (e) { return RO_TZ; } })();
const awayFromRO = roOffset(Date.now()) !== -new Date().getTimezoneOffset() * 6e4;
function parseLegs(r) {
  const [Y, M, D] = r.data.split('-').map(Number);
  return (r.selectii || '').split(' · ').filter(Boolean).map((p, k) => {
    const m = p.match(/^(?:(\d{2})\.(\d{2}) )?(\d{2}):(\d{2}) (.+?): (.+?)(?: \(([^)]*)\))?$/);
    const base = { id: (r.ids || [])[k] || null, motiv: (r.motive || [])[k] || '', sport: r.sport || 'fotbal' };
    if (!m) return { ...base, meci: p, sel: '', o: '', when: null };
    const d = m[1] ? +m[1] : D, mo = m[2] ? +m[2] : M;
    return { ...base, when: roDate(Y, mo - 1, d, +m[3], +m[4]), meci: m[5], sel: m[6], o: m[7] || '' };
  });
}
function firstWhen(r) { const l = parseLegs(r).find(x => x.when); return l ? l.when : new Date(r.data); }
// scores already written in "rezultat", e.g. "Sporting–LASK 2-3 · FCSB–Rapid 1-1 (11 cornere)"
function rezScore(rez, meci) {
  if (!rez) return null; const [h, a] = meci.split(' – ').map(nrm);
  const key = w => (w || '').split(/[\s.]+/).filter(t => t.length > 2)[0] || '';
  for (const part of rez.split(/ · /)) {
    const m = part.match(/^(.+?)\s*[–-]\s*(.+?)\s+(\d+)\s*-\s*(\d+)(?:\s*\((\d+) cornere\))?/); if (!m) continue;
    const ph = nrm(m[1]), pa = nrm(m[2]);
    if (key(h) && ph.includes(key(h)) && key(a) && pa.includes(key(a))) return { state: 2, h: +m[3], a: +m[4], corners: m[5] ? [+m[5], 0] : null, yellow: null };
  }
  return null;
}

/* ---------- slip (one ticket) ---------- */
function legItem(l, opts = {}) {
  const li = el('li', (!l.id && l.when && l.when < now && !opts.settled) ? 'past' : '');
  li._leg = l; li._sel = opts.noJudge ? '' : l.sel; li._meci = l.meci; li._sport = l.sport;
  if (l.id) li.dataset.id = l.id;
  else if (opts.rez) { const sc = rezScore(opts.rez, l.meci); if (sc) { li._fin = sc; li.dataset.fin = '1'; } }
  const t = l.when ? (opts.multi ? pad(l.when.getDate()) + '.' + pad(l.when.getMonth() + 1) + ' ' : '') + fmtHM(l.when) : '';
  li.append(el('span', 't', t), el('span', 'm', l.meci), el('span', 'o', l.o), el('span', 's', opts.subtitle != null ? opts.subtitle : l.sel), el('span', 'lv'));
  li.tabIndex = 0; li.setAttribute('role', 'button'); li.title = 'Detalii meci';
  return li;
}

function slip(r, i) {
  const L = parseLegs(r), settled = eff(r) !== PEND, early = r.status === PEND && settled;
  const s = el('article', 'slip' + (settled ? ' settled' : '')); s.dataset.row = r.id; s._row = r;
  const top = el('div', 'slip-top');
  const first = L.find(l => l.when), last = [...L].reverse().find(l => l.when);
  let span = '';
  if (first) { span = fmtDM(first.when); if (last && dayKey(last.when) !== dayKey(first.when)) span += ' – ' + fmtDM(last.when); }
  const tipBox = el('div', 'slip-tip', r.tip);
  if (r.sport && r.sport !== 'fotbal') tipBox.append(el('span', 'sport', r.sport));
  top.append(tipBox, el('div', 'slip-date', (L.length + ' meciuri') + (span ? ', ' + span : '')));
  s.append(top);
  const meter = el('div', 'meter'); meter.setAttribute('aria-hidden', 'true'); L.forEach(() => meter.append(el('i'))); s.append(meter);

  const c = el('div', 'code' + (r.cod ? '' : ' none'));
  if (r.cod) {
    const box = el('div'); box.append(el('div', 'lbl', 'Cod agenție'), el('div', 'pin', r.cod));
    const b = el('button', null, 'Copiază codul'); b.type = 'button'; b.onclick = () => copy(r.cod, b, 'Copiază codul');
    c.append(box, b);
  } else c.textContent = 'Codul apare la următoarea pregătire';
  s.append(c);

  const ul = el('ul', 'legs'); const LIM = 7, long = L.length > LIM + 1, multi = span.includes('–');
  L.forEach((l, k) => { const li = legItem(l, { settled, multi, rez: r.rezultat }); li._row = r; if (long && k >= LIM) li.hidden = true; ul.append(li); });
  s.append(ul);
  if (long) {
    const m = el('button', 'more', 'Arată toate cele ' + L.length + ' meciuri'); m.type = 'button';
    m.onclick = () => { const open = m.dataset.open !== '1'; ul.querySelectorAll('li').forEach((li, k) => { if (k >= LIM) li.hidden = !open; }); m.dataset.open = open ? '1' : '0'; m.textContent = open ? 'Arată mai puțin' : 'Arată toate cele ' + L.length + ' meciuri'; };
    s.append(m);
  }
  s.append(el('div', 'prog'));
  const tot = el('div', 'tot');
  const cc = el('div', 'c'); cc.append(el('small', null, 'cotă'), document.createTextNode(fmtOdd(r.cota)));
  const pp = el('div', 'p'); pp.append(el('b', null, pct(r.sansa)), document.createTextNode(oneIn(r.sansa) || 'șansă estimată'));
  tot.append(cc, pp);
  if (settled) { const st = el('div', 'stamp ' + (eff(r) === 'câștigat' ? 'won' : 'lost'), eff(r) === 'câștigat' ? 'Câștigat' : 'Pierdut'); st.style.setProperty('--d', (Math.min(i, 8) * .06) + 's'); tot.append(st); }
  s.append(tot);
  if (r.rezultat) s.append(el('div', 'rez', r.rezultat));
  if (early) s.append(el('div', 'rez', 'Picat la ' + lostNow.get(r.id).join(', ') + '. Restul meciurilor nu mai contează; rezultatul final se confirmă la verificarea de noapte.'));
  const sh = el('button', 'share', 'Trimite ca imagine'); sh.type = 'button'; sh.onclick = () => shareSlip(r, sh); s.append(sh);
  return s;
}

function copy(t, b, label) {
  const done = () => { toast('Copiat'); if (b) { b.textContent = 'Copiat'; b.classList.add('ok'); setTimeout(() => { b.textContent = label; b.classList.remove('ok'); }, 1600); } };
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, () => toast('Nu s-a putut copia')); else toast('Nu s-a putut copia');
}
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), 1800); }

/* ---------- views ---------- */
// categoriile din filtre: puține grupe în loc de un buton pentru fiecare tip de bilet
const CATS = ['Pariul zilei', 'Cotă 2', 'Zilnice', 'Weekend', 'Săptămânale', 'SuperLiga', 'Biletul meu'];
function catOf(t) {
  const s = nrm(t || '');
  if (s.startsWith('pariul zilei')) return 'Pariul zilei';
  if (s.startsWith('biletul meu')) return 'Biletul meu';
  if (s.startsWith('challenge')) return 'Challenge';
  if (s.includes('superliga')) return 'SuperLiga';
  if (/^cota 2(\b|$)/.test(s)) return 'Cotă 2';
  if (s.includes('weekend')) return 'Weekend';
  if (/100\+|mega|saptamanal/.test(s)) return 'Săptămânale';
  return 'Zilnice';
}
const filtered = arr => arr.filter(r => !tip || catOf(r.tip) === tip).filter(r => !q || nrm(r.selectii).includes(q));

function viewTickets(pending) {
  const list = $('list');
  let R = filtered(rows.filter(r => pending === (eff(r) === PEND)));
  if (!R.length) { list.append(el('div', 'empty', pending ? 'Niciun bilet de jucat acum. Biletele noi apar dimineața.' : 'Încă nu s-a încheiat niciun bilet.')); return; }
  if (pending && !tip && !q) { const h = hero(); if (h) list.append(h); }
  if (!pending) list.append(histStats(R));
  const groups = new Map();
  R.sort((a, b) => pending ? firstWhen(a) - firstWhen(b) : (b.data + b.id).localeCompare(a.data + a.id));
  for (const r of R) { const k = pending ? (firstWhen(r) < now ? 'live' : dayKey(firstWhen(r))) : r.data; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  let i = 0;
  for (const [k, arr] of groups) {
    const sec = el('section', 'day'); const [a, b] = k === 'live' ? ['În desfășurare', 'au început deja unele meciuri'] : dayLabel(k);
    const h = el('h2', null, a); h.append(el('small', null, k === 'live' ? b : b + (pending ? ', primul meci' : '')));
    const g = el('div', 'grid'); arr.forEach(r => g.append(slip(r, i++)));
    sec.append(h, g); list.append(sec);
  }
}

// statistica biletelor încheiate din filtrul ales (ex. doar Cotă 2)
function histStats(R) {
  const S = [...R].sort((a, b) => (a.data + a.id).localeCompare(b.data + b.id));
  const won = r => eff(r) === 'câștigat';
  const n = S.length, w = S.filter(won).length;
  const profit = S.reduce((a, r) => a + (won(r) ? Number(r.cota) - 1 : -1), 0) * 10;
  const avg = n ? S.reduce((a, r) => a + Number(r.cota || 0), 0) / n : 0;
  let lw = 0, ln = 0; const seen = new Set();
  for (const r of S) { if (!r.rezultat) continue; for (const l of parseLegs(r)) { const sc = rezScore(r.rezultat, l.meci); if (!sc) continue; const res = judge(l.sel, l.meci, sc); if (res !== 'won' && res !== 'lost') continue; const k = r.id + '|' + nrm(l.meci); if (seen.has(k)) continue; seen.add(k); ln++; if (res === 'won') lw++; } }
  let streak = 0; const last = S.length ? won(S[S.length - 1]) : null; for (let i = S.length - 1; i >= 0 && won(S[i]) === last; i--) streak++;
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
  const box = el('section', 'hs');
  const h = el('h2', null, (tip || 'Toate biletele')); h.append(el('small', null, q ? 'statistici pentru căutarea „' + q + '”' : 'statistici din biletele încheiate'));
  const tiles = el('div', 'rs-tiles');
  const tile = (big, lab, cls) => { const t = el('div', 'rs-tile' + (cls ? ' ' + cls : '')); t.append(el('b', null, big), el('span', null, lab)); return t; };
  tiles.append(
    tile(pct(w, n), w + ' din ' + n + ' bilete câștigate'),
    tile((profit >= 0 ? '+' : '−') + Math.abs(profit).toLocaleString('ro-RO', { maximumFractionDigits: 0 }) + ' lei', 'dacă puneai 10 lei pe fiecare', profit >= 0 ? 'up' : 'down'),
    tile(avg ? fmtOdd(avg) : '–', 'cota medie'),
    tile(ln ? pct(lw, ln) : '–', ln ? lw + ' din ' + ln + ' meciuri intrate' : 'meciuri intrate'),
    tile(n ? streak + (last ? ' ✓' : ' ✗') : '–', last ? 'câștigate la rând acum' : 'pierdute la rând acum'));
  const dots = el('div', 'hs-dots'); dots.append(el('span', 'l', 'Ultimele ' + Math.min(15, n) + ':'));
  S.slice(-15).forEach(r => { const d = el('i', won(r) ? 'w' : 'x'); d.title = r.data.split('-').reverse().join('.') + ' · cotă ' + fmtOdd(r.cota) + ' · ' + (won(r) ? 'câștigat' : 'pierdut'); dots.append(d); });
  box.append(h, tiles); if (n) box.append(dots);
  return box;
}

/* ---------- Challenge 1.40: piramida (toată suma trece la pasul următor) ---------- */
const CH_STEPS = 10;
function challengeBox() {
  const C = rows.filter(r => catOf(r.tip) === 'Challenge').sort((a, b) => (a.data + a.id).localeCompare(b.data + b.id));
  const start = Number(store.get('chStart', 10)) || 10;
  const money = v => v.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
  const box = el('section', 'ch');
  const h = el('h2', null, 'Challenge 1.40'); h.append(el('small', null, 'piramidă de ' + CH_STEPS + ' pași, câte un pariu pe zi; tot câștigul trece la pasul următor'));
  box.append(h);
  const set = el('label', 'ch-set'); set.append(el('span', null, 'Miza de start'));
  const inp = el('input'); inp.type = 'number'; inp.min = '1'; inp.step = '1'; inp.value = start; inp.inputMode = 'decimal';
  inp.onchange = () => { const v = Math.max(1, Number(inp.value) || 10); store.set('chStart', v); render(); };
  set.append(inp, el('span', null, 'lei')); box.append(set);
  const cyc = C.length ? Math.max(...C.map(r => Number(r.ciclu) || 1)) : 1;
  const cur = C.filter(r => (Number(r.ciclu) || 1) === cyc).sort((a, b) => (Number(a.pas) || 0) - (Number(b.pas) || 0));
  // banii la fiecare pas, cu cotele reale ale pașilor jucați și 1,40 pentru cei care urmează
  let bank = start; const lad = el('ol', 'ch-lad');
  for (let i = 1; i <= CH_STEPS; i++) {
    const r = cur.find(x => Number(x.pas) === i); const st = r ? eff(r) : null;
    const o = r ? Number(r.cota) : 1.40; const win = bank * o;
    const li = el('li', st === 'câștigat' ? 'w' : st === 'pierdut' ? 'l' : r ? 'p' : 'f');
    const leg = r ? parseLegs(r)[0] : null;
    li.append(el('b', null, 'Pasul ' + i), el('span', 'm', leg ? leg.meci + ': ' + leg.sel : 'urmează'), el('span', 'o', '@ ' + fmtOdd(o)), el('span', 'v', money(bank) + ' → ' + money(win)));
    if (r && r.cod) li.append(el('span', 'c', r.cod));
    if (leg) { li.tabIndex = 0; li.setAttribute('role', 'button'); li.onclick = () => openSheet({ ...leg }); }
    lad.append(li);
    if (st === 'pierdut') { bank = 0; break; }
    bank = win;
  }
  box.append(lad);
  const done = cur.filter(r => eff(r) === 'câștigat').length, lost = cur.some(r => eff(r) === 'pierdut');
  const all = C.length; const cycles = new Set(C.map(r => Number(r.ciclu) || 1)).size;
  const best = Math.max(0, ...[...new Set(C.map(r => Number(r.ciclu) || 1))].map(c => C.filter(r => (Number(r.ciclu) || 1) === c && eff(r) === 'câștigat').length));
  const target = start * Math.pow(1.4, CH_STEPS);
  box.append(el('p', 'ch-sum', lost ? 'Ciclul ' + cyc + ' s-a oprit la pasul ' + (done + 1) + '. Următorul ciclu pornește de la pasul 1 cu ' + money(start) + '.'
    : !all ? 'Prima treaptă se publică vineri dimineață. La ' + CH_STEPS + ' pași reușiți la cota ~1,40, ' + money(start) + ' devin ~' + money(target) + '.'
    : 'Ciclul ' + cyc + ': ' + done + ' din ' + CH_STEPS + ' pași reușiți. Ținta: ~' + money(target) + '.'));
  if (all) box.append(el('p', 'ch-meta', 'Cicluri jucate: ' + cycles + ' · cel mai lung șir: ' + best + ' pași'));
  box.append(el('p', 'ch-note', 'Un singur pas pierdut înseamnă pierderea întregii sume din ciclu. Șansa de a trece toți cei ' + CH_STEPS + ' pași e mică (cam 3 din 100 la ~70% pe pas), așa că pune doar o sumă pe care ești dispus să o pierzi.'));
  return box;
}

// tabul Challenge: tipurile de challenge (deocamdată unul) + scara și biletele lui
const CHALLENGES = [{ k: '140', name: 'Challenge 1.40', sub: '10 pași la cota ~1,40, tot câștigul merge mai departe' }];
let chSel = '140';
function viewChallenge() {
  const list = $('list');
  list.append(el('p', 'intro', 'Provocări pe mai mulți pași: pornești cu o sumă mică și o duci din pas în pas. Biletul fiecărui pas apare dimineața, cu cod de agenție.'));
  const types = el('div', 'ch-types');
  for (const c of CHALLENGES) { const b = el('button', 'ch-type'); b.type = 'button'; b.setAttribute('aria-pressed', String(chSel === c.k)); b.append(el('b', null, c.name), el('span', null, c.sub)); b.onclick = () => { chSel = c.k; render(); }; types.append(b); }
  const soon = el('div', 'ch-type soon'); soon.append(el('b', null, 'Alte challenge-uri'), el('span', null, 'în curând')); types.append(soon);
  list.append(types, challengeBox());
  const C = rows.filter(r => catOf(r.tip) === 'Challenge').sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id));
  if (C.length) { const sec = el('section', 'day'); const h = el('h2', null, 'Biletele challenge-ului'); h.append(el('small', null, 'cel mai nou primul')); const g = el('div', 'grid'); C.forEach((r, i) => g.append(slip(r, i))); sec.append(h, g); list.append(sec); }
}

// every match on active tickets, grouped by day
function allMatches(fromNow) {
  const map = new Map();
  for (const r of rows) {
    if (eff(r) !== PEND) continue;
    for (const l of parseLegs(r)) {
      if (!l.when) continue;
      if (fromNow && l.when < new Date(now.getTime() + 5 * 6e4)) continue;
      const k = l.id ? 'id' + l.id : nrm(l.meci) + '|' + dayKey(l.when);
      if (!map.has(k)) map.set(k, { ...l, picks: [] });
      map.get(k).picks.push({ row: r, sel: l.sel, o: l.o, motiv: l.motiv });
    }
  }
  return [...map.values()].sort((a, b) => a.when - b.when);
}

function viewCalendar() {
  const list = $('list');
  const M = allMatches(false).filter(m => !q || nrm(m.meci).includes(q)).filter(m => !tip || m.picks.some(p => catOf(p.row.tip) === tip))
    .filter(m => m.when > new Date(now.getTime() - 3 * 36e5));
  if (!M.length) { list.append(el('div', 'empty', 'Niciun meci programat pe biletele active.')); return; }
  const days = new Map(); for (const m of M) { const k = dayKey(m.when); if (!days.has(k)) days.set(k, []); days.get(k).push(m); }
  for (const [k, arr] of days) {
    const sec = el('section', 'day'); const [a, b] = dayLabel(k);
    const h = el('h2', null, a); h.append(el('small', null, b + ', ' + arr.length + (arr.length === 1 ? ' meci' : ' meciuri')));
    const card = el('div', 'slip cal');
    const ul = el('ul', 'legs');
    for (const m of arr) {
      const cnt = {}; m.picks.forEach(p => { cnt[p.sel] = (cnt[p.sel] || 0) + 1; }); const sub = Object.entries(cnt).map(([k, v]) => m.picks.length > 1 ? k + ' (' + v + ')' : k).join(' / ');
      const li = legItem(m, { noJudge: true, subtitle: sub });
      li.querySelector('.o').textContent = m.picks.length > 1 ? m.picks.length + ' bilete' : m.o;
      li._picks = m.picks; ul.append(li);
    }
    card.append(ul); sec.append(h, card); list.append(sec);
  }
}

/* ---------- meciurile zilei: top 20 campionate ---------- */
const OB = 'https://production-superbet-offer-ro.freetls.fastly.net';
// [nume afișat, regex pe numele Superbet fără diacritice, id-uri Superbet cunoscute]
const LEAGUES = [
  ['Liga Campionilor', /^(liga campionilor|uefa champions league)( - (faza (ligii|eliminatorie)|gr\.?\s?[a-h]|play-?off))?$/, [69433]],
  ['Europa League', /^(uefa )?(europa league|liga europa)( - (faza (ligii|eliminatorie)|gr\.?\s?[a-l]|play-?off))?$/, []],
  ['Conference League', /^(uefa )?(europa )?(conference league|liga conferintelor)( - (faza (ligii|eliminatorie)|gr\.?\s?[a-h]|play-?off))?$/, []],
  ['Premier League', /^anglia - premier league$/, []],
  ['LaLiga', /^spania - (laliga|la liga|primera division|liga 1)$/, []],
  ['Serie A', /^italia - seri[ae] a$/, [30336]],
  ['Bundesliga', /^germania - (bundesliga|bundesliga 1|1\. bundesliga)$/, [245]],
  ['Ligue 1', /^franta - ligue 1$/, []],
  ['SuperLiga', /^romania - (liga 1|superliga)$/, [28564]],
  ['Eredivisie', /^olanda - eredivisie$/, [25895]],
  ['Liga Portugal', /^portugalia - (liga portugal|primeira liga|liga 1|liga betclic|superliga)$/, []],
  ['Süper Lig', /^turcia - super ?lig$/, [28035]],
  ['Pro League', /^belgia - (pro league|jupiler pro league|first division a)$/, [324]],
  ['Championship', /^anglia - championship$/, []],
  ['Premiership (Scoția)', /^scotia - premiership$/, []],
  ['Bundesliga (Austria)', /^austria - bundesliga$/, []],
  ['Super League (Elveția)', /^elvetia - super league$/, [492]],
  ['Superliga (Danemarca)', /^danemarca - superliga(en)?$/, []],
  ['Eliteserien', /^norvegia - eliteserien$/, []],
  ['Allsvenskan', /^suedia - allsvenskan$/, [983]],
];
let day = { key: '', t: 0, list: [], err: '', busy: null };
let extra = { t: 0, rows: [] };   // meciuri.json: formă, absenți (scris zilnic de sarcina programată)
let tmap = null;                  // tournament_id -> index în LEAGUES

async function tournaments() {
  if (tmap) return tmap;
  const m = new Map();
  LEAGUES.forEach(([, , ids], i) => ids.forEach(id => m.set(String(id), i)));
  try {
    const j = await (await fetch(OB + '/v2/ro-RO/struct')).json();
    for (const t of ((j.data || j).tournaments || [])) {
      const n = nrm(t.localNames && (t.localNames['ro-RO'] || Object.values(t.localNames)[0])).replace(/\s+/g, ' ').trim();
      const i = LEAGUES.findIndex(L => L[1].test(n));
      if (i >= 0) m.set(String(t.id), i);
    }
  } catch (e) {}
  return (tmap = m);
}
function mkOdds(markets) {
  const o = {};
  for (const mk of markets || []) {
    const nm = nrm(mk.name);
    for (const x of mk.odds || []) {
      const on = (x.metadata && x.metadata.name) || x.name || '', pr = x.price;
      if (!pr) continue;
      if (nm === 'final' && ['1', 'X', '2'].includes(on)) o[on] = pr;
      else if (nm === 'total goluri' && on === 'Peste 2.5') o.o25 = pr;
      else if (/^ambele echipe marcheaza/.test(nm) && on === 'Da') o.gg = pr;
    }
  }
  return o;
}
async function loadDay() {
  if (day.busy) return day.busy;
  return (day.busy = (async () => {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); const d1 = new Date(d0.getTime() + 864e5);
    const key = dayKey(d0);
    const saved = store.get('meciuri-' + key, []);
    try {
      const T = await tournaments();
      const q = '&startDate=' + d0.toISOString() + '&endDate=' + d1.toISOString();
      const parts = await Promise.all(['active-prematch', 'active-live'].map(ix => fetch(OB + '/v3/ro-RO/events?index=' + ix + q, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ events: [] }))));
      const map = new Map(saved.map(x => [String(x.id), x]));
      for (const p of parts) for (const e of (p.events || [])) {
        const f = e.fixture || {}; if (f.sport_id !== 5) continue;
        const li = T.get(String(f.tournament_id)); if (li == null) continue;
        const when = new Date(f.utc_date || f.unix_date_millis); if (dayKey(when) !== key) continue;
        const [h, a] = (f.event_name || '').split('·');
        if (!h || !a || /\b(u1[7-9]|u2[0-3]|feminin|women)\b/i.test(f.event_name)) continue;
        const old = map.get(String(e.event_id));
        map.set(String(e.event_id), { id: e.event_id, meci: h.trim() + ' – ' + a.trim(), when: when.toISOString(), liga: li, odds: { ...(old && old.odds), ...mkOdds(e.markets) } });
      }
      day.list = [...map.values()].sort((x, y) => new Date(x.when) - new Date(y.when) || x.liga - y.liga);
      try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('meciuri-') && k !== 'meciuri-' + key) localStorage.removeItem(k); } } catch (e) {}
      store.set('meciuri-' + key, day.list);
      day.err = '';
    } catch (e) { day.list = saved; day.err = 'Nu s-au putut încărca meciurile de la Superbet acum.'; }
    day.key = key; day.t = Date.now();
    await loadExtra();
    day.busy = null;
  })());
}
// meciuri.json (formă, absenți, arbitri) — încărcat o dată la 10 minute, pentru orice fereastră de meci
let extraBusy = null;
function loadExtra() {
  if (Date.now() - extra.t <= 10 * 6e4) return Promise.resolve();
  return extraBusy || (extraBusy = (async () => {
    try { const j = await (await fetch('meciuri.json?v=' + Date.now(), { cache: 'no-store' })).json(); extra = { t: Date.now(), rows: (j && j.meciuri) || [] }; } catch (e) { extra.t = Date.now() - 9 * 6e4; }
    extraBusy = null;
  })());
}
function teamWords(t) { return nrm(t).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['fc', 'cf', 'afc', 'sc', 'ac', 'club', 'united', 'city', 'real', 'sporting'].includes(w)); }
function sameTeam(a, b) {
  const A = teamWords(a), B = teamWords(b); if (!A.length || !B.length) return nrm(a) === nrm(b);
  return A.some(w => B.some(v => v === w || (w.length > 4 && v.length > 4 && (v.startsWith(w) || w.startsWith(v)))));
}
// statisticile arbitrului, scrise de sarcina zilnică în meciuri.json (arbitru, arbitru_galbene, arbitru_rosii pe meci, arbitru_meciuri, arbitru_sezon)
function refText(inf) {
  if (!inf || inf.arbitru_galbene == null) return '';
  const f = v => Number(v).toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return f(inf.arbitru_galbene) + ' galbene' + (inf.arbitru_rosii != null ? ' și ' + f(inf.arbitru_rosii) + ' roșii' : '') + ' pe meci'
    + (inf.arbitru_meciuri || inf.arbitru_sezon ? ' (' + [inf.arbitru_sezon, inf.arbitru_meciuri ? inf.arbitru_meciuri + ' meciuri' : ''].filter(Boolean).join(', ') + ')' : '');
}
function refBlock(name, inf) {
  const box = el('div', 'refbox');
  const nm = name || (inf && inf.arbitru) || '';
  if (!nm) return null;
  box.append(el('div', 'rb-k', 'Arbitru'), el('div', 'rb-n', nm));
  const t = refText(inf);
  box.append(el('div', 'rb-s', t || 'Statisticile arbitrului apar când sunt găsite în surse (actualizare la 10:07 și 16:07).'));
  return box;
}
function infoFor(l) {
  if (!l || !l.meci) return null; const [h, a] = l.meci.split(' – ');
  const k = l.when ? dayKey(l.when) : '';
  return extra.rows.find(x => (x.id && l.id && String(x.id) === String(l.id))) ||
    extra.rows.find(x => (!x.data || !k || x.data === k) && sameTeam(x.gazde || '', h || '') && sameTeam(x.oaspeti || '', a || '')) || null;
}
function viewMatches() {
  const list = $('list');
  const go = () => { if (tab === 'm') render(); };
  if (!day.t || day.key !== dayKey(new Date())) { list.append(el('div', 'empty', 'Se încarcă meciurile de azi…')); loadDay().then(go); return; }
  const M = day.list.map(x => ({ ...x, when: new Date(x.when) })).filter(m => !q || nrm(m.meci).includes(q));
  const intro = el('p', 'intro', 'Meciurile de azi din cele 20 de competiții urmărite. Apasă pe un meci pentru cote, șanse, statistici, formă și absenți.');
  list.append(intro);
  if (day.err) list.append(el('div', 'err', day.err));
  if (!M.length) { list.append(el('div', 'empty', q ? 'Niciun meci de azi nu se potrivește căutării.' : 'Azi nu sunt meciuri în competițiile urmărite.')); return; }
  const by = new Map(); for (const m of M) { if (!by.has(m.liga)) by.set(m.liga, []); by.get(m.liga).push(m); }
  for (const [li, arr] of [...by].sort((x, y) => x[0] - y[0])) {
    const sec = el('section', 'day');
    const h = el('h2', null, LEAGUES[li][0]); h.append(el('small', null, arr.length + (arr.length === 1 ? ' meci' : ' meciuri')));
    const card = el('div', 'slip cal games'); const ul = el('ul', 'legs');
    for (const m of arr) {
      const o = m.odds || {};
      const sub = [o.o25 && 'Peste 2.5: ' + fmtOdd(o.o25), o.gg && 'GG: ' + fmtOdd(o.gg)].filter(Boolean).join('  ·  ');
      const inf = infoFor(m);
      const li = legItem({ id: m.id, meci: m.meci, when: m.when, sel: '', o: '', sport: 'fotbal' }, { noJudge: true, subtitle: sub });
      li.querySelector('.o').textContent = o['1'] ? [o['1'], o.X, o['2']].map(v => v ? fmtOdd(v) : '–').join(' / ') : '';
      if (inf && (inf.forma_gazde || inf.forma_oaspeti)) { const fm = el('span', 'fm'); fm.append(formBadges(inf.forma_gazde), el('i', null, '·'), formBadges(inf.forma_oaspeti)); li.querySelector('.s').append(fm); }
      li._picks = picksFor({ id: m.id, meci: m.meci, when: m.when });
      ul.append(li);
    }
    card.append(ul); sec.append(h, card); list.append(sec);
  }
  list.append(el('p', 'note small', 'Cotele sunt 1 / X / 2 de la Superbet. Lista se actualizează singură la câteva minute.'));
}
function formBadges(f) {
  const s = el('span', 'form'); const v = String(f || '').toUpperCase().replace(/[^VEI]/g, '').slice(-5);
  if (!v) { s.append(el('b', 'n', '?')); return s; }
  for (const c of v) s.append(el('b', c === 'V' ? 'w' : c === 'I' ? 'l' : 'd', c));
  return s;
}
// prob. implicite din cote (marja eliminată pe grupul de rezultate)
const fair = arr => { const inv = arr.map(p => p ? 1 / p : 0), t = inv.reduce((a, b) => a + b, 0); return inv.map(x => t ? x / t : null); };
function lineNear(mk, target = 1.9) {
  // grupează Peste/Sub după linie și alege linia cu cota „Peste” cea mai apropiată de target
  const L = {};
  for (const x of mk.odds || []) { const n = (x.metadata && x.metadata.name) || x.name || ''; const m = n.match(/^(Peste|Sub) ([\d.]+)$/); if (!m) continue; (L[m[2]] = L[m[2]] || {})[m[1]] = x.price; }
  let best = null; for (const [ln, v] of Object.entries(L)) if (v.Peste && v.Sub && (!best || Math.abs(v.Peste - target) < Math.abs(best.p - target))) best = { ln, p: v.Peste, s: v.Sub };
  return best;
}
// ---------- estimare din statistici: ultimele meciuri oficiale ale echipelor ----------
const SAH = 'https://scorealarm-stats.freetls.fastly.net/v2/soccer/fixtures/h2h/rosuperbetsport/ro-RO?';
const poisOver = (lam, line) => { let p = 0, t = Math.exp(-lam); for (let k = 0; k <= Math.floor(line); k++) { p += t; t *= lam / (k + 1); } return Math.max(0, Math.min(1, 1 - p)); };
const official = e => e.match_state === 2 && !/amical|friendl/.test(nrm(e.competition && e.competition.name));
async function statModel(id) {
  try {
    const o = await (await fetch(SA + id, { cache: 'no-store' })).json();
    const t1 = o.team1 && o.team1.id, t2 = o.team2 && o.team2.id; if (!t1 || !t2) return null;
    const hh = await (await fetch(SAH + 'team1-id=' + t1 + '&team2-id=' + t2, { cache: 'no-store' })).json();
    const ft = e => { const x = (e.scores || []).find(y => y.type === 0); return x && x.team1 != null && x.team2 != null ? [x.team1, x.team2] : null; };
    // goals for/against of the team in its last 10 official matches (newest first)
    const games = (evs, tid) => (evs || []).filter(official).map(e => { const x = ft(e); if (!x) return null; const home = e.team1 && e.team1.id === tid; return { f: home ? x[0] : x[1], a: home ? x[1] : x[0], vs: home ? e.team2 && e.team2.name : e.team1 && e.team1.name }; }).filter(Boolean).slice(0, 10);
    // match totals (both teams) of corners, cards, offsides, shots on target in the last 8 official matches
    const REC = ['corner_kicks', 'yellow_cards', 'red_cards', 'offsides', 'shots_on_goal'];
    const recStats = async evs => (await Promise.all((evs || []).filter(e => official(e) && e.offer_id && e.offer_id.value).slice(0, 8).map(async e => {
      const fid = e.offer_id.value.split(':').pop();
      try { const c = live.cache['st' + fid]; if (c) return c; const jj = await (await fetch(SA + fid)).json(); const r = {}; for (const k of REC) { const v = statOf(jj, k); if (v) r[k] = v[0] + v[1]; } if (r.yellow_cards != null) r.cards = r.yellow_cards + (r.red_cards || 0); live.cache['st' + fid] = r; return r; } catch (err) { return null; }
    }))).filter(Boolean);
    const [R1, R2] = await Promise.all([recStats(hh.team1_events), recStats(hh.team2_events)]);
    const avg = {};
    for (const x of (o.prematch_stats || [])) { const k = x.text && x.text.args && String(x.text.args[0]).split('.').pop(); const va = parseFloat(x.team1), vb = parseFloat(x.team2); if (k && !isNaN(va) && !isNaN(vb)) avg[k] = [va, vb]; }
    for (const x of (o.prematch_season_stats || [])) { const k = x.text && x.text.args && String(x.text.args[0]).split('.').pop(); const va = parseFloat(x.team1), vb = parseFloat(x.team2); if (!k || isNaN(va) || isNaN(vb)) continue; const key = 's_' + k; if (!avg[key] || va + vb < avg[key][0] + avg[key][1]) avg[key] = [va, vb]; }
    return { G1: games(hh.team1_events, t1), G2: games(hh.team2_events, t2), R1, R2, avg };
  } catch (e) { return null; }
}
const shrink = (k, n) => (k + 1) / (n + 2); // 8 din 8 nu devine 100%
const pc = p => Math.round(p * 100) + '%';
function dotsRow(seq) { // seq: newest first; drawn old → new, left to right
  const d = el('span', 'dots'); [...seq].reverse().forEach(v => d.append(el('i', v === true ? 'y' : v === false ? 'n' : v)));
  return d;
}
function verdict(pOdds, pStat, price, inPlay) {
  if (inPlay) return ['', ''];
  const d = pStat - pOdds;
  if (d >= 0.08 && price >= 1.3) return ['val', 'Forma echipelor susține mai mult decât arată cota: posibilă valoare.'];
  if (d <= -0.08) return ['low', 'Forma echipelor nu susține cota: mai puțin probabil decât pare.'];
  return ['ok', 'Cota și forma echipelor spun cam același lucru.'];
}
function barsBlock(pOdds, pStat) {
  const w = el('div', 'mk-bars');
  for (const [lab, p, cls] of [['După cotă', pOdds, 'od'], ['După formă', pStat, 'fo']]) {
    if (p == null) continue;
    const r = el('div', 'mk-bar ' + cls); const tr = el('div', 'track'); const f = el('i'); f.style.width = pc(p); tr.append(f);
    r.append(el('span', 'lab', lab), tr, el('b', null, pc(p))); w.append(r);
  }
  return w;
}
function numsRow(vals, line) { // valorile pe meci, de la vechi la recent; verde = peste linie
  const d = el('span', 'nums'); [...vals].reverse().forEach(v => d.append(el('i', v > line ? 'y' : '', String(v))));
  return d;
}
const r1 = x => Math.round(x * 10) / 10;
function teamLine(name, seq, text) {
  const r = el('div', 'mk-team'); r.append(el('span', 'tn', name), dotsRow(seq), el('span', 'tc', text)); return r;
}
async function sheetOdds(box, l) {
  const sec = el('div', 'sh-sec mkt'); sec.append(el('h4', null, 'Cote și formă')); const body = el('div', 'note', 'Se încarcă cotele și statisticile…'); sec.append(body); box.append(sec);
  try {
    const [j, SM, LM] = await Promise.all([
      fetch(OB + '/v3/ro-RO/events?events=' + l.id + '&includeOnly=fixture,markets', { cache: 'no-store' }).then(r => r.json()),
      statModel(l.id), getMatch(l.id).catch(() => null)]);
    const inPlay = !!(LM && LM.state >= 1);
    const e = j.events && j.events[0]; const MK = (e && e.markets) || [];
    const find = re => MK.find(m => re.test(nrm(m.name)));
    const price = (m, n) => { const x = m && (m.odds || []).find(o => ((o.metadata && o.metadata.name) || o.name) === n); return x ? x.price : null; };
    const [h, a] = (l.meci || '').split(' – ');
    const G1 = (SM && SM.G1) || [], G2 = (SM && SM.G2) || [], okG = G1.length >= 5 && G2.length >= 5;
    const R1 = (SM && SM.R1) || [], R2 = (SM && SM.R2) || [], A = (SM && SM.avg) || {};
    body.replaceChildren(); body.className = '';
    const intro = el('p', 'mk-intro');
    intro.append(el('b', null, 'Cum citești: '), document.createTextNode('bara gri e șansa după cota Superbet, bara verde („după formă”) e cât de des s-a întâmplat în ultimele meciuri ale echipelor. La cornere, cartonașe, goluri etc. vezi media pe meci a fiecărei echipe și valorile din fiecare meci (de la cel mai vechi la cel mai recent); verde = peste linie.'));
    body.append(intro);
    if (inPlay) body.append(el('p', 'mk-live', 'Meciul se joacă acum: cotele sunt live și se schimbă cu scorul, iar forma e de dinainte de meci. Nu compara cele două până la final.'));
    let any = false;
    const group = t => { const g = el('div', 'mk-group'); g.append(el('h5', null, t)); body.append(g); return g; };

    // ---- rezultat final
    const fin = find(/^final$/);
    if (fin && price(fin, '1')) {
      any = true; const g = group('Rezultat final');
      const P = [price(fin, '1'), price(fin, 'X'), price(fin, '2')], F = fair(P);
      let S = [null, null, null];
      if (okG) {
        const fr = (G, fn) => G.filter(fn).length / G.length, W = x => x.f > x.a, D = x => x.f === x.a, Lo = x => x.f < x.a;
        const raw = [(fr(G1, W) + fr(G2, Lo)) / 2, (fr(G1, D) + fr(G2, D)) / 2, (fr(G2, W) + fr(G1, Lo)) / 2], t = raw[0] + raw[1] + raw[2] || 1;
        S = raw.map(x => x / t);
      }
      const card = el('div', 'mk');
      const labs = ['Câștigă ' + (h || 'gazdele'), 'Egal', 'Câștigă ' + (a || 'oaspeții')];
      labs.forEach((lab, k) => {
        const [cls, why] = S[k] != null ? verdict(F[k], S[k], P[k], inPlay) : ['', ''];
        const row = el('div', 'mk-out' + (cls ? ' ' + cls : ''));
        const hd = el('div', 'mk-h'); hd.append(el('span', 'mk-t', lab), el('span', 'mk-o', fmtOdd(P[k])));
        row.append(hd, barsBlock(F[k], S[k]));
        if (cls === 'val') row.append(el('div', 'mk-v val', why));
        card.append(row);
      });
      if (okG) {
        const res = G => G.map(x => x.f > x.a ? 'w' : x.f < x.a ? 'l' : 'd');
        const cnt = (G, fn) => G.filter(fn).length;
        const tl = (name, G) => teamLine(name, res(G), cnt(G, x => x.f > x.a) + 'V ' + cnt(G, x => x.f === x.a) + 'E ' + cnt(G, x => x.f < x.a) + 'Î');
        const tw = el('div', 'mk-teams'); tw.append(el('div', 'mk-cap', 'Ultimele ' + Math.max(G1.length, G2.length) + ' meciuri (verde = victorie, gri = egal, roșu = înfrângere)'), tl(h, G1), tl(a, G2)); card.append(tw);
      }
      g.append(card);
    }

    // ---- goluri
    const binCard = (g, title, pOdds, prc, seq1, seq2, capText, extra) => {
      const card = el('div', 'mk');
      const n1 = seq1 ? seq1.length : 0, n2 = seq2 ? seq2.length : 0;
      const k1 = seq1 ? seq1.filter(Boolean).length : 0, k2 = seq2 ? seq2.filter(Boolean).length : 0;
      const pStat = extra && extra.p != null ? extra.p : (n1 >= 4 && n2 >= 4 ? (shrink(k1, n1) + shrink(k2, n2)) / 2 : null);
      const [cls, why] = pStat != null ? verdict(pOdds, pStat, prc, inPlay) : ['', ''];
      if (cls) card.classList.add(cls);
      const hd = el('div', 'mk-h'); hd.append(el('span', 'mk-t', title), el('span', 'mk-o', fmtOdd(prc)));
      card.append(hd, barsBlock(pOdds, pStat));
      if (extra && extra.vals) {
        // media pe meci a fiecărei echipe, cu valorile din fiecare meci dedesubt
        const [v1, v2] = extra.vals, mean = v => v.reduce((x, y) => x + y, 0) / v.length;
        const tw = el('div', 'mk-teams avg'); tw.append(el('div', 'mk-cap', capText));
        for (const [nm, v] of [[h, v1], [a, v2]]) {
          const r = el('div', 'mk-team');
          const m = el('span', 'tm'); m.append(el('b', null, r1(mean(v)).toFixed(1)), document.createTextNode(' / meci'));
          r.append(el('span', 'tn', nm), numsRow(v, extra.line), m); tw.append(r);
        }
        const both = el('div', 'mk-sum'); both.append(document.createTextNode('Media celor două: '), el('b', null, r1((mean(v1) + mean(v2)) / 2).toFixed(1) + ' ' + (extra.unit || '')), document.createTextNode(' pe meci, față de linia de ' + extra.line + '.'));
        tw.append(both);
        card.append(tw);
      } else if (n1 >= 4 && n2 >= 4) {
        const tw = el('div', 'mk-teams'); tw.append(el('div', 'mk-cap', capText));
        tw.append(teamLine(h, seq1, k1 + ' din ' + n1), teamLine(a, seq2, k2 + ' din ' + n2));
        if (extra && extra.mean) tw.append(el('div', 'mk-mean', extra.mean));
        card.append(tw);
      } else if (extra && extra.mean) card.append(el('div', 'mk-mean', extra.mean));
      if (extra && extra.ref) card.append(el('div', 'mk-ref', extra.ref));
      if (why) card.append(el('div', 'mk-v ' + cls, why));
      g.append(card);
    };
    const gg = find(/^ambele echipe marcheaza( \(gg\))?$/), tg = find(/^total goluri$/);
    const pGG = gg && [price(gg, 'Da'), price(gg, 'Nu')], pO = tg && [price(tg, 'Peste 2.5'), price(tg, 'Sub 2.5')];
    if ((pGG && pGG[0]) || (pO && pO[0])) {
      any = true; const g = group('Goluri');
      if (pGG && pGG[0]) binCard(g, 'Ambele echipe marchează (GG)', fair(pGG)[0], pGG[0], G1.map(x => x.f > 0 && x.a > 0), G2.map(x => x.f > 0 && x.a > 0), 'În câte meciuri au marcat ambele echipe');
      if (pO && pO[0]) {
        const mg = G => G.reduce((s2, x) => s2 + x.f + x.a, 0) / G.length;
        binCard(g, 'Peste 2.5 goluri', fair(pO)[0], pO[0], G1.map(x => x.f + x.a > 2), G2.map(x => x.f + x.a > 2), 'Goluri în meciurile fiecărei echipe, ultimele ' + Math.max(G1.length, G2.length) + ' (verde = 3 sau mai multe)',
          okG ? { vals: [G1.map(x => x.f + x.a), G2.map(x => x.f + x.a)], line: 2.5, unit: 'goluri' } : null);
      }
    }

    // ---- statistici de joc
    const LINES = [[/^total cornere$/, 'Cornere', ['average_corners', 's_corners'], 'cornere', 'corner_kicks'], [/^total cartonase$/, 'Cartonașe', ['average_cards', 'average_yellow_cards', 's_yellow_cards'], 'cartonașe', 'cards'], [/^total (offside|ofsaid)/, 'Offside-uri', ['s_offsides'], 'offside-uri', 'offsides'], [/^total suturi pe poarta$/, 'Șuturi pe poartă', ['average_shots_on_target', 's_shots_on_target'], 'șuturi pe poartă', 'shots_on_goal']];
    let gJoc = null;
    const refLine = () => { const inf = infoFor(l); const t = refText(inf); return t ? 'Arbitru ' + (inf.arbitru || '') + ': ' + t + '.' : ''; };
    for (const [re, lab, keys, unit, rk] of LINES) {
      const m = find(re); const b = m && lineNear(m); if (!b) continue;
      if (!gJoc) { gJoc = group('Statistici de joc'); any = true; }
      const F = fair([b.p, b.s]); const ln = +b.ln, need = Math.floor(ln) + 1;
      const v1 = R1.map(x => x[rk]).filter(x => x != null), v2 = R2.map(x => x[rk]).filter(x => x != null);
      const mean = v => v.reduce((x, y) => x + y, 0) / v.length;
      if (v1.length >= 4 && v2.length >= 4) {
        binCard(gJoc, lab + ' peste ' + b.ln, F[0], b.p, v1.map(x => x > ln), v2.map(x => x > ln), lab + ' în meciurile fiecărei echipe (total pe meci, ultimele ' + Math.max(v1.length, v2.length) + '; verde = ' + need + ' sau mai multe)',
          { vals: [v1, v2], line: ln, unit, ref: rk === 'cards' ? refLine() : '' });
      } else {
        const k = keys.find(x => A[x]); const v = k && A[k];
        binCard(gJoc, lab + ' peste ' + b.ln, F[0], b.p, null, null, '', v ? { ref: rk === 'cards' ? refLine() : '', p: poisOver(v[0] + v[1], ln), mean: 'Media din sezon: ' + v[0] + ' (' + h + ') + ' + v[1] + ' (' + a + ') = ' + (Math.round((v[0] + v[1]) * 10) / 10) + ' ' + unit + ' / meci' } : null);
      }
    }

    const sc = MK.filter(m => /marc(heaza|ator)/.test(nrm(m.name)) && /(oricand|in meci|marcator)/.test(nrm(m.name)) && !/(primul|ultimul|ambele|pauza|repriz)/.test(nrm(m.name)));
    const players = [];
    for (const m of sc) for (const o of m.odds || []) { const n = (o.metadata && o.metadata.name) || o.name; if (n && !/^(da|nu|niciun|fara)/i.test(n) && o.price) players.push([n, o.price]); }
    if (players.length) {
      players.sort((x, y) => x[1] - y[1]);
      const g = group('Cine poate marca (oricând în meci)');
      const ul = el('ul', 'sh-picks'); for (const [n, pr] of players.slice(0, 8)) { const li = el('li'); li.append(el('span', 'k', n), el('span', 'v', fmtOdd(pr) + ' · ' + Math.round(100 / pr) + '%')); ul.append(li); }
      g.append(ul);
    }
    if (!any && !players.length) body.replaceChildren(el('p', 'note', 'Superbet nu are cote pentru meciul ăsta acum.'));
    else body.append(el('p', 'note small', 'Șansa după cotă e calculată fără marja casei. Forma: 1X2 și goluri din ultimele 10 meciuri oficiale ale fiecărei echipe, restul din ultimele 8 (totalul din meci, ambele echipe). Sunt eșantioane mici: un semnal de verificat, nu o garanție.'));
  } catch (err) { body.className = 'note'; body.textContent = 'Cotele nu s-au putut încărca acum.'; }
}
function sheetInfo(box, l) {
  const inf = infoFor(l); if (!inf) return;
  const [h, a] = (l.meci || '').split(' – ');
  const sec = el('div', 'sh-sec');
  if (inf.forma_gazde || inf.forma_oaspeti || inf.loc_gazde || inf.loc_oaspeti) {
    sec.append(el('h4', null, 'Forma (ultimele 5, de la stânga la dreapta: vechi → recent)'));
    const ul = el('ul', 'sh-picks');
    for (const [t, f, loc] of [[h, inf.forma_gazde, inf.loc_gazde], [a, inf.forma_oaspeti, inf.loc_oaspeti]]) { const li = el('li'); const k = el('span', 'k', t || ''); if (loc) k.append(el('small', null, ' · locul ' + loc)); li.append(k, formBadges(f)); ul.append(li); }
    sec.append(ul);
  }
  const abs = [[h, inf.absenti_gazde], [a, inf.absenti_oaspeti]].filter(x => x[1] && x[1].length);
  sec.append(el('h4', null, 'Accidentați și suspendați'));
  if (abs.length) for (const [t, L] of abs) { const p = el('p', 'why'); p.append(el('b', null, t + ': '), document.createTextNode(L.join(', '))); sec.append(p); }
  else sec.append(el('p', 'note', 'Nicio absență importantă anunțată.'));
  if (inf.marcatori_gazde || inf.marcatori_oaspeti) {
    sec.append(el('h4', null, 'Golgheteri în sezon'));
    for (const [t, s] of [[h, inf.marcatori_gazde], [a, inf.marcatori_oaspeti]]) if (s) { const p = el('p', 'why'); p.append(el('b', null, t + ': '), document.createTextNode(s)); sec.append(p); }
  }
  if (inf.nota) sec.append(el('p', 'why', inf.nota));
  box.append(sec);
}

/* ---------- match sheet ---------- */
function showSheet() { $('sheet').hidden = false; document.body.classList.add('noscroll'); setTimeout(() => $('sheet').querySelector('.sheet-x').focus(), 30); }
function hideSheet() { $('sheet').hidden = true; document.body.classList.remove('noscroll'); }
$('sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) hideSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet').hidden) hideSheet(); });

// închide fereastra și duce la biletul respectiv (tabul potrivit, fără filtre), cu o evidențiere scurtă
function goToTicket(id) {
  const r = rows.find(x => x.id === id); if (!r) return;
  hideSheet();
  const want = eff(r) === PEND ? 'p' : 'h';
  if (tab !== want || tip || q) {
    tab = want; tip = ''; q = ''; const qi = $('q'); if (qi) qi.value = '';
    for (const x of $('tabs').querySelectorAll('button')) x.setAttribute('aria-selected', String(x.dataset.tab === tab));
    try { history.replaceState(null, '', '#' + tab); } catch (err) {}
    chips(); render();
  }
  setTimeout(() => {
    const s = [...document.querySelectorAll('#list .slip')].find(x => x.dataset.row === id); if (!s) return;
    s.scrollIntoView({ behavior: 'smooth', block: 'center' });
    s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash');
    setTimeout(() => s.classList.remove('flash'), 2200);
  }, 60);
}
function picksFor(l) {
  if (l._picks) return l._picks;
  const out = [];
  for (const r of rows) parseLegs(r).forEach(x => { if ((l.id && x.id === l.id) || (!l.id && x.meci === l.meci && x.when && l.when && dayKey(x.when) === dayKey(l.when))) out.push({ row: r, sel: x.sel, o: x.o, motiv: x.motiv }); });
  return out;
}
const STAT_LABEL = { goals_scored_per_game: 'Goluri marcate / meci', goals_conceded_per_game: 'Goluri primite / meci', average_xg: 'Goluri așteptate (xG)', average_shots_on_target: 'Șuturi pe poartă', average_shots_off_target: 'Șuturi pe lângă', average_corners: 'Cornere / meci', average_yellow_cards: 'Cartonașe galbene', average_cards: 'Cartonașe total', average_red_cards: 'Cartonașe roșii' };
async function openSheet(l) {
  await loadExtra();
  const box = $('sheet-body'); box.replaceChildren();
  const [h, a] = (l.meci || '').split(' – ');
  const t = el('h3', null, l.meci); t.id = 'sh-title'; box.append(t);
  if (l.when) box.append(el('p', 'when', dayLabel(dayKey(l.when))[0] + ', ' + fmtDM(l.when) + ', ora ' + fmtHM(l.when)));
  const live = el('div', 'sh-live'); box.append(live);
  const P = picksFor(l);
  if (P.length) {
    const sec = el('div', 'sh-sec'); sec.append(el('h4', null, P.length === 1 ? 'Pe bilet' : 'Pe ' + P.length + ' bilete'));
    const ul = el('ul', 'sh-picks');
    for (const p of P) {
      const li = el('li', 'go'); li.tabIndex = 0; li.setAttribute('role', 'button'); li.title = 'Mergi la bilet';
      li.append(el('span', 'k', p.row.tip), el('span', 'v', p.sel + (p.o ? ' @ ' + p.o : '')), el('span', 'arr', '→'));
      li.onclick = () => goToTicket(p.row.id);
      li.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); goToTicket(p.row.id); } };
      ul.append(li);
    }
    sec.append(ul);
    const why = P.map(p => p.motiv).filter(Boolean);
    if (why.length) { sec.append(el('h4', null, 'De ce l-am ales')); [...new Set(why)].forEach(w => sec.append(el('p', 'why', w))); }
    box.append(sec);
  }
  sheetInfo(box, l);
  if (l.id && (!l.sport || l.sport === 'fotbal')) sheetOdds(box, l);
  const stats = el('div', 'sh-sec'); box.append(stats);
  showSheet();
  if (!l.id || (l.sport && l.sport !== 'fotbal')) { if (!l.id) stats.append(el('p', 'note', 'Pentru meciul ăsta nu am ID-ul Superbet, deci nu pot arăta statisticile.')); return; }
  stats.append(el('p', 'note', 'Se încarcă statisticile…'));
  try {
    const j = await (await fetch(SA + l.id, { cache: 'no-store' })).json();
    stats.replaceChildren();
    const m = await getMatch(l.id);
    const sc2 = m && m.h != null ? m.h + ' – ' + m.a : '';
    if (m && m.state === 1) live.replaceChildren(el('span', 'dot'), document.createTextNode('Live' + (sc2 ? ': ' + sc2 : '') + (m.min ? ', minutul ' + m.min : '')));
    else if (m && m.state === 2) live.textContent = 'Final' + (sc2 ? ': ' + sc2 : '');
    const comp = j.competition && j.competition.name || j.tournament && j.tournament.name;
    if (comp) stats.append(el('p', 'comp', comp + (j.stadium_name && j.stadium_name.value ? ', ' + j.stadium_name.value : '')));
    const ps = (j.prematch_stats || []).map(x => ({ k: x.text.args[0].split('.').pop(), a: parseFloat(x.team1), b: parseFloat(x.team2) })).filter(x => STAT_LABEL[x.k]);
    if (ps.length) {
      stats.append(el('h4', null, 'Mediile echipelor în competiție'));
      const tbl = el('div', 'sh-stats');
      const hd = el('div', 'row hd'); hd.append(el('span', 'a', h || 'Gazde'), el('span', 'l', ''), el('span', 'b', a || 'Oaspeți')); tbl.append(hd);
      for (const k of Object.keys(STAT_LABEL)) {
        const x = ps.find(y => y.k === k); if (!x) continue;
        const r = el('div', 'row'); const tot = (x.a + x.b) || 1;
        const bar = el('div', 'bar2'); const ba = el('i', 'ba'); ba.style.width = (100 * x.a / tot) + '%'; const bb = el('i', 'bb'); bb.style.width = (100 * x.b / tot) + '%'; bar.append(ba, bb);
        r.append(el('span', 'a', String(x.a)), el('span', 'l', STAT_LABEL[k]), el('span', 'b', String(x.b)), bar);
        tbl.append(r);
      }
      stats.append(tbl);
    }
    const SS = [[/offside/, 'Offside-uri'], [/^(average_)?(total_)?shots(_total)?(_per_game)?$/, 'Șuturi total'], [/possession/, 'Posesie %'], [/^big_chances_created$/, 'Ocazii mari create'], [/fouls/, 'Faulturi']];
    const seen = new Set(), ss = [];
    for (const x of (j.prematch_season_stats || [])) {
      const k = x.text && x.text.args && String(x.text.args[0]).split('.').pop(); if (!k) continue;
      const hit = SS.find(([re]) => re.test(k)); if (!hit) continue;
      const va = parseFloat(x.team1), vb = parseFloat(x.team2); if (isNaN(va) || isNaN(vb)) continue;
      // Superbet trimite aceeași statistică de două ori: total pe sezon și medie pe meci; păstrăm media (valoarea mai mică)
      const prev = ss.find(y => y.key === hit[1]);
      if (!prev) { seen.add(hit[1]); ss.push({ l: hit[1] + (/Posesie/.test(hit[1]) ? '' : ' / meci'), a: va, b: vb, key: hit[1] }); }
      else if (va + vb < prev.a + prev.b) { prev.a = va; prev.b = vb; }
    }
    if (ss.length) {
      stats.append(el('h4', null, 'Alte statistici din sezon'));
      const tbl = el('div', 'sh-stats');
      for (const x of ss) { const r = el('div', 'row'); const tot = (x.a + x.b) || 1; const bar = el('div', 'bar2'); const ba = el('i', 'ba'); ba.style.width = (100 * x.a / tot) + '%'; const bb = el('i', 'bb'); bb.style.width = (100 * x.b / tot) + '%'; bar.append(ba, bb); r.append(el('span', 'a', String(Math.round(x.a * 10) / 10)), el('span', 'l', x.l), el('span', 'b', String(Math.round(x.b * 10) / 10)), bar); tbl.append(r); }
      stats.append(tbl);
    }
    const ref = (j.referees || []).find(x => x.type === 1);
    const rb = refBlock(ref ? ref.name.split(', ').reverse().join(' ') : '', infoFor(l)); if (rb) stats.append(rb);
    if (!ps.length && !ref) stats.append(el('p', 'note', 'Superbet nu are încă statistici pentru meciul ăsta.'));
  } catch (e) { stats.replaceChildren(el('p', 'note', 'Statisticile nu s-au putut încărca acum. Încearcă din nou peste un minut.')); }
}
document.addEventListener('click', e => {
  const li = e.target.closest('.legs li, .hero .hl'); if (!li || !li._leg) return;
  openSheet({ ...li._leg, _picks: li._picks });
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.legs li, .hero .hl')) { e.preventDefault(); e.target.click(); } });

/* ---------- live scores ---------- */
const live = { cache: {}, busy: false, again: false, prev: {} };
function statOf(j, key) { for (const g of (j.statistics || [])) if (g.period === 0) for (const d of g.data || []) if (d.text && d.text.args && d.text.args[0] === 'stats.football.match.' + key) return [Number(d.team1) || 0, Number(d.team2) || 0]; return null; }
async function getMatch(id, sport) {
  const c = live.cache[id]; if (c && (c.state === 2 || Date.now() - c.t < 55e3)) return c;
  try {
    let m;
    if (!sport || sport === 'fotbal') {
      const j = await (await fetch(SA + id, { cache: 'no-store' })).json();
      // pariurile se judecă pe 90 de minute: type 6 = scorul la finalul timpului regulamentar (fără prelungiri și penalty-uri)
      const ET = [32, 33, 34, 41, 42, 50, 110, 120].includes(j.match_status);
      const reg = (j.scores || []).find(x => x.type === 6), tot = (j.scores || []).find(x => x.type === 0);
      const sc = (ET || j.match_state === 2) && reg ? reg : tot;
      let min = null; if (j.live_minute) { const lm = j.live_minute; const e = lm.elapsed_seconds + (lm.anchor_date ? Math.max(0, Date.now() / 1000 - lm.anchor_date.seconds) : 0); min = Math.min(Math.floor(e / 60) + 1, lm.max_seconds ? Math.floor(lm.max_seconds / 60) : 120); }
      // before the first goal Superbet sends no score at all: a started match without a score is 0-0
      const started = j.match_state >= 1, num = v => (v == null || v === '' ? null : Number(v));
      const sh = sc ? num(sc.team1) : null, sa = sc ? num(sc.team2) : null;
      m = { t: Date.now(), state: ET ? 2 : j.match_state, ft90: ET, h: sh != null ? sh : (started ? 0 : null), a: sa != null ? sa : (started ? 0 : null), min, corners: statOf(j, 'corner_kicks'), yellow: statOf(j, 'yellow_cards') };
    } else {
      const j = await (await fetch(OFFER + id + '&includeOnly=fixture,inPlayStats,inPlayStatsMetadata', { cache: 'no-store' })).json();
      const e = j.events && j.events[0]; if (!e) return c || null;
      const st = (e.inplay_stats_metadata && e.inplay_stats_metadata.status) || '';
      const ip = e.inplay_stats || {};
      m = { t: Date.now(), state: /START|LIVE|PROGRESS/i.test(st) ? 1 : /END|FINISH|CLOSE/i.test(st) ? 2 : 0, h: ip.home_team_score != null ? +ip.home_team_score : (/START|LIVE|PROGRESS|END|FINISH|CLOSE/i.test(st) ? 0 : null), a: ip.away_team_score != null ? +ip.away_team_score : (/START|LIVE|PROGRESS|END|FINISH|CLOSE/i.test(st) ? 0 : null), min: null, label: e.inplay_stats_metadata && e.inplay_stats_metadata.event_status_label };
    }
    live.cache[id] = m; return m;
  } catch (e) { return c || null; }
}
// result of one selection: 'won' | 'lost' | 'ok' | 'no' | null
function judge(sel, meci, m) {
  if (!sel || !m || m.h == null || m.state === 0) return null;
  const fin = m.state === 2, H = m.h, A = m.a, T = H + A, s = nrm(sel).trim();
  const done = (win, certainWin, certainLose) => fin ? (win ? 'won' : 'lost') : (certainWin ? 'won' : certainLose ? 'lost' : (win ? 'ok' : 'no'));
  let x;
  if (s === '1') return done(H > A); if (s === 'x') return done(H === A); if (s === '2') return done(A > H);
  if (s === '1x') return done(H >= A); if (s === 'x2') return done(A >= H); if (s === '12') return done(H !== A);
  if (s === 'gg') return done(H > 0 && A > 0, H > 0 && A > 0); if (s === 'ng') return done(!(H > 0 && A > 0), false, H > 0 && A > 0);
  if ((x = s.match(/^(peste|sub) (\d+(?:\.\d)?)(?: goluri| puncte)?$/))) { const L = +x[2]; return x[1] === 'peste' ? done(T > L, T > L) : done(T < L, false, T > L); }
  if ((x = s.match(/^(.+?) peste (\d+(?:\.\d)?) goluri$/))) { const hm = nrm(meci.split(' – ')[0]); const t = nrm(x[1]); const G = (hm.includes(t) || t.includes(hm.split(' ')[0])) ? H : A; const L = +x[2]; return done(G > L, G > L); }
  if ((x = s.match(/cornere (peste|sub) (\d+(?:\.\d)?)/) || s.match(/(peste|sub) (\d+(?:\.\d)?) cornere/))) { if (!m.corners) return null; const C = m.corners[0] + m.corners[1], L = +x[2]; return x[1] === 'peste' ? done(C > L, C > L) : done(C < L, false, C > L); }
  if ((x = s.match(/(peste|sub) (\d+(?:\.\d)?) (?:galbene|cartonase)/))) { if (!m.yellow) return null; const Y = m.yellow[0] + m.yellow[1], L = +x[2]; return x[1] === 'peste' ? done(Y > L, Y > L) : done(Y < L, false, Y > L); }
  { const [hn, an] = (meci || '').split(' – ').map(t => nrm(t)); const side = t => { t = nrm(t).trim(); const w = x => x.split(/\s+/).filter(y => y.length > 2); if (hn && (hn.includes(t) || t.includes(hn) || w(t).some(y => hn.includes(y)))) return 'h'; if (an && (an.includes(t) || t.includes(an) || w(t).some(y => an.includes(y)))) return 'a'; return null; };
    if ((x = s.match(/^(.+?) (?:castiga|victorie)$/))) { const d = side(x[1]); if (d) return done(d === 'h' ? H > A : A > H); }
    if ((x = s.match(/^(.+?) sau egal/))) { const d = side(x[1]); if (d) return done(d === 'h' ? H >= A : A >= H); }
    if ((x = s.match(/^(.+?) fara gol primit$/))) { const d = side(x[1]); if (d) { const c = d === 'h' ? A : H; return done(c === 0, false, c > 0); } }
    if ((x = s.match(/^(.+?) castiga cu (\d)\+ goluri/))) { const d = side(x[1]); if (d) return done((d === 'h' ? H - A : A - H) >= +x[2]); } }
  if (s.startsWith('bet builder')) { const parts = sel.replace(/^bet builder\s*/i, '').split(/\s*\+\s*/).map(p => judge(p, meci, m)); if (parts.includes(null)) return null; if (parts.includes('lost')) return 'lost'; if (parts.every(p => p === 'won')) return 'won'; return parts.includes('no') ? 'no' : 'ok'; }
  return null;
}
function applyFin() {
  for (const li of document.querySelectorAll('.legs li[data-fin]')) { const m = li._fin; const r = judge(li._sel, li._meci, m); if (r) li.dataset.res = r; const lv = li.querySelector('.lv'); lv.className = 'lv on fin'; lv.textContent = (m.ft90 ? 'Final 90′ ' : 'Final ') + m.h + ' – ' + m.a; }
}
function markLost(r, matches) {
  if (!r || r.status !== PEND || lostNow.has(r.id)) return false;
  lostNow.set(r.id, matches);
  try { localStorage.setItem('lostNow', JSON.stringify(Object.fromEntries(lostNow))); } catch (e) {}
  return true;
}
let moveTimer = null;
function progs() {
  let moved = false;
  for (const s of document.querySelectorAll('.slip')) {
    const p = s.querySelector('.prog'); if (!p) continue;
    const L = [...s.querySelectorAll('.legs li')]; const n = L.length;
    const won = L.filter(l => l.dataset.res === 'won').length, lost = L.filter(l => l.dataset.res === 'lost'), on = L.filter(l => l.classList.contains('livenow')).length;
    const todo = n - won - lost.length - on;
    const segs = s.querySelectorAll('.meter i');
    L.forEach((l, k) => { if (segs[k]) segs[k].className = l.dataset.res === 'won' ? 'w' : l.dataset.res === 'lost' ? 'l' : l.classList.contains('livenow') ? (l.dataset.res === 'no' ? 'ln' : 'lv') : ''; });
    if (n && won === n) celebrate(s);
    if (!won && !lost.length && !on) { p.className = 'prog'; continue; }
    p.className = 'prog on'; p.replaceChildren();
    const cnt = el('div', 'cnt');
    cnt.append(el('span', 'cw', '✓ ' + won + (won === 1 ? ' câștigat' : ' câștigate')), el('span', 'cl', '✗ ' + lost.length + (lost.length === 1 ? ' pierdut' : ' pierdute')));
    if (on) cnt.append(el('span', 'co', '● ' + on + ' live'));
    if (todo > 0) cnt.append(el('span', 'ct', todo + ' de jucat'));
    p.append(cnt);
    if (lost.length) { p.append(el('div', 'why', 'Picat la ' + lost.map(l => l._meci).join(', ') + '.')); if (markLost(s._row, lost.map(l => l._meci))) moved = true; }
    else if (won === n) p.append(el('div', 'why', 'Toate meciurile au intrat.'));
  }
  // a ticket that just lost leaves "În desfășurare" and moves to the history
  if (moved) { header(); clearTimeout(moveTimer); moveTimer = setTimeout(() => { if (tab === 'p' || tab === 'h' || tab === 'c') render(); }, 1500); }
}
async function liveTick() {
  applyFin(); progs();
  if (live.busy) { live.again = true; return; } live.busy = true;
  try {
    const lis = [...document.querySelectorAll('.legs li[data-id]')];
    // only matches that started or start within 15 min, plus finished ones never fetched
    const want = new Map();
    for (const li of lis) { const l = li._leg; if (!l.when || l.when.getTime() - Date.now() < 15 * 6e4) want.set(li.dataset.id, l.sport); }
    const res = {}; await Promise.all([...want].map(async ([id, sp]) => { res[id] = await getMatch(id, sp); }));
    let liveCount = 0; const counted = new Set(); const tick = [];
    for (const [id, m] of Object.entries(res)) {
      if (!m || m.h == null) continue;
      const prev = live.prev[id];
      if (prev && m.state >= 1 && (m.h + m.a) > (prev.h + prev.a)) goal(id, m, m.h > prev.h);
      live.prev[id] = { h: m.h, a: m.a };
    }
    for (const li of lis) {
      const m = res[li.dataset.id]; const lv = li.querySelector('.lv');
      li.classList.remove('livenow');
      if (!m || m.state === 0 || m.h == null) { lv.className = 'lv'; li.removeAttribute('data-res'); continue; }
      const r = judge(li._sel, li._meci, m);
      if (r) li.dataset.res = r; else li.removeAttribute('data-res');
      const corn = m.corners && /corner/.test(nrm(li._sel)) ? (m.corners[0] + m.corners[1]) + ' cornere' : '';
      if (m.state === 1) {
        if (!counted.has(li.dataset.id)) { counted.add(li.dataset.id); liveCount++; tick.push({ id: li.dataset.id, meci: li._meci, m }); }
        li.classList.add('livenow'); lv.className = 'lv on live';
        lv.replaceChildren(el('span', 'dot'), document.createTextNode(m.h + ' – ' + m.a + (m.min ? '  ·  ' + m.min + "'" : m.label ? '  ·  ' + m.label : '') + (corn ? '  ·  ' + corn : '')));
      } else { lv.className = 'lv on fin'; lv.textContent = (m.ft90 ? 'Final 90′ ' : 'Final ') + m.h + ' – ' + m.a + (corn ? ', ' + corn : ''); }
    }
    progs(); ticker(tick); heroLive();
    const nx = $('next'); nx.querySelector('.livebadge')?.remove();
    if (liveCount) {
      const b = el('button', 'livebadge'); b.type = 'button'; b.title = 'Vezi biletele care se joacă acum';
      b.append(el('span', 'dot'), liveCount + (liveCount === 1 ? ' meci live acum. ' : ' meciuri live acum. '));
      b.onclick = () => {
        if (tab !== 'p' || tip || q) { tab = 'p'; tip = ''; q = ''; const qi = $('q'); if (qi) qi.value = ''; for (const x of $('tabs').querySelectorAll('button')) x.setAttribute('aria-selected', String(x.dataset.tab === tab)); try { history.replaceState(null, '', '#p'); } catch (err) {} chips(); render(); }
        setTimeout(() => { const li = document.querySelector('#list .legs li.livenow'); const t = (li && li.closest('.slip')) || document.querySelector('#list .day'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80);
      };
      nx.prepend(b);
    }
  } finally { live.busy = false; if (live.again) { live.again = false; liveTick(); } }
}


/* ---------- biletul zilei (hero) ---------- */
let heroTimer = null;
function heroPick() {
  // today's ticket stays the "ticket of the day" while it is live; otherwise the next one within 36 h
  const lastWhen = r => { const L = parseLegs(r).filter(x => x.when); return L.length ? L[L.length - 1].when : firstWhen(r); };
  // a one-day ticket whose first match has kicked off and whose last match ended less than 2.5 h ago
  const liveNow = r => firstWhen(r) <= now && dayKey(lastWhen(r)) === dayKey(firstWhen(r)) && now - lastWhen(r) < 2.5 * 36e5;
  const soon = rows.filter(r => eff(r) === PEND && (liveNow(r) || (firstWhen(r) > now && firstWhen(r) - now < 36 * 36e5)));
  if (!soon.length) return null;
  const pref = ['Pariul zilei', 'Cotă 2', 'Goluri ~5', 'Cotă 5'];
  const rank = r => { const p = pref.indexOf(r.tip); return p < 0 ? 9 : p; };
  soon.sort((a, b) => (liveNow(b) - liveNow(a)) || rank(a) - rank(b) || (b.sansa || 0) - (a.sansa || 0));
  return soon[0];
}
function hero() {
  const r = heroPick(); if (!r) return null;
  const L = parseLegs(r), t0 = firstWhen(r);
  const h = el('section', 'hero'); const isLive = t0 <= now; if (isLive) h.classList.add('is-live');
  const left = el('div', 'hero-l');
  const k = el('div', 'hero-k', r.tip === 'Pariul zilei' ? 'Pariul zilei, ales de Claude' : 'Biletul zilei');
  if (isLive) { const lb = el('span', 'hero-livetag'); lb.append(el('span', 'dot'), 'LIVE'); k.append(lb); }
  // titlul se poate apăsa: un singur meci -> fereastra meciului; altfel -> biletul complet din listă
  const ht = el('button', 'hero-tip', r.tip === 'Pariul zilei' && L[0] ? L[0].meci : r.tip); ht.type = 'button';
  ht.title = L.length === 1 ? 'Detalii meci' : 'Vezi biletul';
  ht.onclick = () => { if (L.length === 1) openSheet({ ...L[0] }); else goToTicket(r.id); };
  left.append(k, ht);
  const cd = el('div', 'hero-cd'); cd.setAttribute('aria-label', 'Timp până la primul meci');
  const units = [['h', 'ore'], ['m', 'min'], ['s', 'sec']].map(([k, lab]) => { const u = el('div', 'u'); const b = el('b', null, '00'); u.append(b, el('span', null, lab)); cd.append(u); return b; });
  if (isLive) { const st = el('div', 'hero-state'); st.id = 'hero-state'; st.textContent = 'Se încarcă scorurile…'; left.append(st); }
  else left.append(cd, el('div', 'hero-sub', 'până la ' + L[0].meci + ', ' + (dayKey(t0) === dayKey(now) ? 'azi' : 'mâine') + ' la ' + fmtHM(t0)));
  const right = el('div', 'hero-r');
  const nums = el('div', 'hero-nums');
  const a = el('div'); a.append(el('b', null, fmtOdd(r.cota)), el('span', null, 'cotă'));
  const b = el('div'); b.append(el('b', null, pct(r.sansa)), el('span', null, 'șansă'));
  nums.append(a, b); right.append(nums);
  if (r.cod) { const c = el('button', 'hero-code'); c.type = 'button'; c.append(el('span', null, 'Cod'), el('b', null, r.cod)); c.onclick = () => copy(r.cod, null); right.append(c); }
  const chips = el('div', 'hero-legs');
  L.forEach(l => { const c = el('span', 'hl'); c._leg = l; if (l.id) c.dataset.id = l.id; c.tabIndex = 0; c.setAttribute('role', 'button'); c.title = 'Detalii meci'; c.append(el('i', null, fmtHM(l.when)), document.createTextNode(l.meci + ' '), el('b', null, l.sel), el('em', 'sc')); chips.append(c); });
  h.append(left, right, chips);
  if (r.motive && r.motive[0] && L.length === 1) h.append(el('p', 'why1', r.motive[0]));
  clearInterval(heroTimer);
  if (isLive) return h;
  const upd = () => { let d = Math.max(0, Math.floor((t0 - Date.now()) / 1000)); const v = [Math.floor(d / 3600), Math.floor(d % 3600 / 60), d % 60]; units.forEach((u, k) => { u.textContent = pad(v[k]); }); if (!d) clearInterval(heroTimer); };
  upd(); heroTimer = setInterval(() => { if (!document.body.contains(h)) { clearInterval(heroTimer); return; } upd(); }, 1000);
  return h;
}

function heroLive() {
  const st = $('hero-state'); if (!st) return;
  const C = [...document.querySelectorAll('.hero .hl')]; let won = 0, lost = 0, on = 0, todo = 0, next = null;
  for (const c of C) {
    const l = c._leg, m = l.id ? live.cache[l.id] : null, sc = c.querySelector('.sc');
    c.classList.remove('w', 'l', 'lv');
    if (!m || m.state === 0 || m.h == null) { sc.textContent = ''; todo++; if (l.when && l.when > now && (!next || l.when < next.when)) next = l; continue; }
    const res = judge(l.sel, l.meci, m);
    if (m.state === 1) { on++; c.classList.add('lv'); sc.textContent = m.h + '-' + m.a + (m.min ? ' · ' + m.min + "'" : ''); if (res === 'won') won++; else if (res === 'lost') { lost++; c.classList.replace('lv', 'l'); } }
    else { sc.textContent = 'Final ' + m.h + '-' + m.a; if (res === 'won') { won++; c.classList.add('w'); } else if (res === 'lost') { lost++; c.classList.add('l'); } else todo++; }
  }
  st.replaceChildren(el('span', 'cw', '✓ ' + won + (won === 1 ? ' câștigat' : ' câștigate')), el('span', 'cl', '✗ ' + lost + (lost === 1 ? ' pierdut' : ' pierdute')));
  if (on) st.append(el('span', 'co', '● ' + on + ' live'));
  if (next) st.append(el('span', 'ct', 'următorul: ' + next.meci + ' la ' + fmtHM(next.when)));
}

/* ---------- live ticker, goals, sound ---------- */
function ticker(items) {
  let t = $('ticker');
  if (!items.length) { if (t) t.hidden = true; return; }
  if (!t) { t = el('div', 'ticker'); t.id = 'ticker'; document.body.prepend(t); }
  t.hidden = false; t.replaceChildren();
  const lab = el('span', 'tk-l'); lab.append(el('span', 'dot'), 'LIVE'); t.append(lab);
  const row = el('div', 'tk-row');
  for (const x of items) {
    const [h, a] = x.meci.split(' – ');
    const c = el('button', 'tk'); c.type = 'button';
    c.append(el('span', null, h), el('b', null, x.m.h + ' – ' + x.m.a), el('span', null, a || ''), el('i', null, x.m.min ? x.m.min + "'" : (x.m.label || '')));
    c.onclick = () => { const li = document.querySelector('.legs li[data-id="' + x.id + '"]'); if (li) { li.scrollIntoView({ behavior: 'smooth', block: 'center' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1600); } };
    row.append(c);
  }
  t.append(row);
}
let sound = store.get('sunet-gol', false), actx = null;
function beep() {
  if (!sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523, 659, 784, 1047]; const t = actx.currentTime;
    notes.forEach((f, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + i * .12); g.gain.exponentialRampToValueAtTime(.25, t + i * .12 + .02); g.gain.exponentialRampToValueAtTime(.0001, t + i * .12 + .3); o.connect(g).connect(actx.destination); o.start(t + i * .12); o.stop(t + i * .12 + .32); });
  } catch (e) {}
}
function goal(id, m, home) {
  const li = document.querySelector('.legs li[data-id="' + id + '"]'); if (!li) return;
  const [h, a] = li._meci.split(' – ');
  document.querySelectorAll('.legs li[data-id="' + id + '"]').forEach(x => { x.classList.remove('goalflash'); void x.offsetWidth; x.classList.add('goalflash'); });
  const g = $('goal') || (() => { const d = el('div', 'goal'); d.id = 'goal'; d.setAttribute('role', 'status'); document.body.append(d); return d; })();
  g.replaceChildren(el('div', 'g-big', 'GOL!'), el('div', 'g-who', (home ? h : a) + ' marchează'), el('div', 'g-sc', h + ' ' + m.h + ' – ' + m.a + ' ' + a + (m.min ? '  ·  ' + m.min + "'" : '')));
  g.classList.remove('on'); void g.offsetWidth; g.classList.add('on');
  clearTimeout(g._t); g._t = setTimeout(() => g.classList.remove('on'), 4200);
  beep();
  if (navigator.vibrate) try { navigator.vibrate([120, 60, 120]); } catch (e) {}
}
function soundBtn() {
  const b = el('button', 'snd'); b.type = 'button';
  const set = () => { b.textContent = sound ? '🔔 Sunet la gol: pornit' : '🔕 Sunet la gol: oprit'; b.setAttribute('aria-pressed', String(sound)); };
  b.onclick = () => { sound = !sound; store.set('sunet-gol', sound); set(); if (sound) beep(); };
  set(); return b;
}

/* ---------- confetti when a ticket wins ---------- */
function celebrate(slipEl) {
  const id = slipEl.dataset.row; if (!id) return;
  const done = store.get('sarbatorite', []); if (done.includes(id)) return;
  done.push(id); store.set('sarbatorite', done);
  slipEl.classList.add('winner');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = slipEl.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
  const cv = el('canvas', 'confetti'); cv.width = innerWidth; cv.height = innerHeight; document.body.append(cv);
  const ctx = cv.getContext('2d'); const cols = ['#f2c230', '#21894f', '#f6f3ea', '#e5322d', '#5fd393'];
  const P = Array.from({ length: 140 }, () => ({ x: r.left + r.width / 2, y: r.top + 60, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, s: 4 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6, va: (Math.random() - .5) * .4 }));
  let f = 0; (function step() { ctx.clearRect(0, 0, cv.width, cv.height); for (const p of P) { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); } if (++f < 150) requestAnimationFrame(step); else cv.remove(); })();
  toast('Bilet câștigător: ' + (slipEl._row ? slipEl._row.tip : ''));
}

/* ---------- share as image ---------- */
async function shareSlip(r, btn) {
  const L = parseLegs(r);
  const W = 1080, rowH = 92, H = 520 + L.length * rowH + (r.cod ? 150 : 0);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  try { await document.fonts.ready; } catch (e) {}
  const F = (w, s, f) => w + ' ' + s + 'px ' + f;
  const disp = '"Barlow Condensed", Arial Narrow, sans-serif', ui = 'Barlow, Arial, sans-serif', mono = '"IBM Plex Mono", Consolas, monospace';
  c.fillStyle = '#0f2a20'; c.fillRect(0, 0, W, H);
  // paper with torn bottom
  const px = 70, py = 140, pw = W - 140, ph = H - 220;
  c.fillStyle = '#f6f3ea'; c.beginPath(); c.moveTo(px, py); c.lineTo(px + pw, py); c.lineTo(px + pw, py + ph);
  const nz = Math.round(pw / 24), zw = pw / nz; for (let k = 0; k < nz; k++) { const x = px + pw - k * zw; c.lineTo(x - zw / 2, py + ph + 14); c.lineTo(x - zw, py + ph); }
  c.closePath(); c.fill();
  c.fillStyle = '#e9efe9'; c.font = F(800, 64, disp); c.fillText('Biletele mele', px, 100);
  c.fillStyle = '#1d1f1c'; c.font = F(700, 60, disp); c.fillText(r.tip, px + 40, py + 80);
  c.font = F(500, 26, mono); c.fillStyle = '#6d6f68'; c.textAlign = 'right'; c.fillText(L.length + ' meciuri', px + pw - 40, py + 76); c.textAlign = 'left';
  let y = py + 120;
  if (r.cod) {
    c.setLineDash([10, 8]); c.strokeStyle = '#c9c4b5'; c.lineWidth = 3; c.strokeRect(px + 40, y, pw - 80, 110); c.setLineDash([]);
    c.fillStyle = '#6d6f68'; c.font = F(500, 24, mono); c.fillText('Cod agenție', px + 64, y + 38);
    c.fillStyle = '#1d1f1c'; c.font = F(700, 52, mono); c.fillText(r.cod, px + 64, y + 92); y += 150;
  }
  for (const l of L) {
    c.strokeStyle = '#c9c4b5'; c.setLineDash([3, 6]); c.lineWidth = 2; c.beginPath(); c.moveTo(px + 40, y); c.lineTo(px + pw - 40, y); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#6d6f68'; c.font = F(500, 24, mono); c.fillText(l.when ? pad(l.when.getDate()) + '.' + pad(l.when.getMonth() + 1) + ' ' + fmtHM(l.when) : '', px + 40, y + 40);
    c.fillStyle = '#1d1f1c'; c.font = F(600, 30, ui); c.fillText(l.meci, px + 250, y + 40);
    c.fillStyle = '#3b3d38'; c.font = F(400, 24, mono); c.fillText(l.sel, px + 250, y + 74);
    c.fillStyle = '#1d1f1c'; c.font = F(600, 30, mono); c.textAlign = 'right'; c.fillText(l.o, px + pw - 40, y + 56); c.textAlign = 'left';
    y += rowH;
  }
  c.fillStyle = '#1d1f1c'; c.fillRect(px + 40, y + 6, pw - 80, 4);
  c.font = F(500, 26, mono); c.fillStyle = '#6d6f68'; c.fillText('cotă', px + 40, y + 76);
  c.fillStyle = '#1d1f1c'; c.font = F(800, 84, disp); c.fillText(fmtOdd(r.cota), px + 120, y + 90);
  c.textAlign = 'right'; c.font = F(600, 34, ui); c.fillText(pct(r.sansa) + ' șansă', px + pw - 40, y + 76); c.textAlign = 'left';
  c.fillStyle = '#9fb3a8'; c.font = F(500, 24, ui); c.fillText('jurjiuflorin.github.io/bilete', px, H - 30);
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  const file = new File([blob], 'bilet-' + r.id + '.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: r.tip, text: r.tip + (r.cod ? ' · cod ' + r.cod : '') }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.append(a); a.click(); a.remove();
  toast('Imaginea biletului s-a salvat');
}


/* ---------- Rezultate: cât de bine merg ponturile ---------- */
const famOf = t => (t || '').replace(/\s*\(refăcut\)\s*$/i, '').trim();
function marketOf(sel) {
  const s = nrm(sel).trim();
  if (s.startsWith('bet builder')) return 'Bet Builder';
  if (/cornere/.test(s)) return 'Cornere';
  if (/galbene|cartonase/.test(s)) return 'Cartonașe';
  if (/^(1|x|2)$/.test(s)) return 'Rezultat final (1X2)';
  if (/^(1x|x2|12)$/.test(s)) return 'Șansă dublă';
  if (/^(gg|ng)$/.test(s)) return 'GG / NG';
  if (/^.+ peste \d+(\.\d)? goluri$/.test(s)) return 'Goluri echipă';
  if (/^(peste|sub) \d/.test(s)) return 'Total goluri';
  return 'Altele';
}
function resultsData() {
  const S = rows.filter(r => r.status === 'câștigat' || r.status === 'pierdut').sort((a, b) => (a.data + a.id).localeCompare(b.data + b.id));
  const sum = arr => { const n = arr.length, w = arr.filter(r => r.status === 'câștigat').length; const profit = arr.reduce((a, r) => a + (r.status === 'câștigat' ? Number(r.cota) - 1 : -1), 0); return { n, w, profit, roi: n ? profit / n : 0 }; };
  const all = sum(S);
  const fam = new Map(); for (const r of S) { const k = catOf(r.tip); if (!fam.has(k)) fam.set(k, []); fam.get(k).push(r); }
  const byTip = [...fam].map(([k, arr]) => ({ k, ...sum(arr), avg: arr.reduce((a, r) => a + Number(r.cota), 0) / arr.length })).sort((a, b) => b.n - a.n);
  // fiecare selecție judecată din scorurile scrise în „rezultat”
  const mk = new Map(); let lw = 0, ll = 0; const seen = new Set();
  for (const r of rows) {
    if (!r.rezultat) continue;
    for (const l of parseLegs(r)) {
      const sc = rezScore(r.rezultat, l.meci); if (!sc) continue;
      const res = judge(l.sel, l.meci, sc); if (res !== 'won' && res !== 'lost') continue;
      const key = nrm(l.meci) + '|' + nrm(l.sel) + '|' + (l.when ? dayKey(l.when) : r.data); if (seen.has(key)) continue; seen.add(key);
      const m = marketOf(l.sel); if (!mk.has(m)) mk.set(m, { k: m, w: 0, n: 0 });
      const o = mk.get(m); o.n++; if (res === 'won') { o.w++; lw++; } else ll++;
    }
  }
  const byMarket = [...mk.values()].sort((a, b) => b.n - a.n);
  return { S, all, byTip, byMarket, legs: { w: lw, n: lw + ll } };
}
function viewResults() {
  const list = $('list'); const D = resultsData();
  list.append(el('p', 'intro', 'Cât de bine merg ponturile, din toate biletele încheiate. Profitul presupune 1 leu pus pe fiecare bilet, fără taxa de 5% a agenției.'));
  if (!D.all.n) { list.append(el('div', 'empty', 'Încă nu s-a încheiat niciun bilet. Statisticile apar după primele rezultate.')); return; }
  const pctS = (w, n) => n ? Math.round(100 * w / n) + '%' : '–';
  const money = v => (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
  const tiles = el('div', 'rs-tiles');
  const tile = (big, lab, cls) => { const t = el('div', 'rs-tile' + (cls ? ' ' + cls : '')); t.append(el('b', null, big), el('span', null, lab)); return t; };
  tiles.append(
    tile(pctS(D.all.w, D.all.n), D.all.w + ' din ' + D.all.n + ' bilete câștigate'),
    tile(pctS(D.legs.w, D.legs.n), D.legs.w + ' din ' + D.legs.n + ' meciuri intrate'),
    tile(money(D.all.profit), 'profit cu 1 leu pe bilet', D.all.profit >= 0 ? 'up' : 'down'),
    tile((D.all.roi >= 0 ? '+' : '−') + Math.abs(Math.round(D.all.roi * 100)) + '%', 'randament (ROI)', D.all.roi >= 0 ? 'up' : 'down'));
  list.append(tiles);
  // ultimele rezultate
  const last = D.S.slice(-15);
  const sec0 = el('section', 'day'); const h0 = el('h2', null, 'Ultimele bilete'); h0.append(el('small', null, 'cel mai recent în dreapta')); sec0.append(h0);
  const strip = el('div', 'rs-strip');
  for (const r of last) { const d = el('button', 'rs-dot ' + (r.status === 'câștigat' ? 'w' : 'l'), r.status === 'câștigat' ? '✓' : '✗'); d.type = 'button'; d.title = r.tip + ', cotă ' + fmtOdd(r.cota) + ', ' + fmtDM(new Date(r.data)); d.onclick = () => goToTicket(r.id); strip.append(d); }
  sec0.append(strip); list.append(sec0);
  // pe tip de bilet
  const table = (title, sub, head, data, row) => {
    const sec = el('section', 'day'); const h = el('h2', null, title); if (sub) h.append(el('small', null, sub)); sec.append(h);
    const box = el('div', 'rs-table'); const t = el('table'); const tr = el('tr'); head.forEach(x => tr.append(el('th', null, x))); const th = el('thead'); th.append(tr); t.append(th);
    const tb = el('tbody'); data.forEach(d => { const r = el('tr'); row(d).forEach((c, i) => { const td = el('td'); if (c instanceof Node) td.append(c); else td.textContent = c; if (i) td.className = 'n'; r.append(td); }); tb.append(r); }); t.append(tb); box.append(t); sec.append(box); list.append(sec);
  };
  const bar = (w, n) => { const f = el('span', 'rs-bar'); const i = el('i'); i.style.width = Math.round(n ? 90 * w / n : 0) + 'px'; f.append(i, el('em', null, pctS(w, n))); return f; };
  table('Pe categorie', 'cât de des intră fiecare', ['Categorie', 'Bilete', 'Câștigate', 'Cotă medie', 'Profit (1 leu)'], D.byTip,
    d => [d.k, String(d.n), bar(d.w, d.n), fmtOdd(d.avg), money(d.profit)]);
  if (D.byMarket.length) table('Pe tip de pariu', 'fiecare meci de pe bilete, judecat separat', ['Piață', 'Meciuri', 'Intrate'], D.byMarket,
    d => [d.k, String(d.n), bar(d.w, d.n)]);
  list.append(el('p', 'note rs-note', 'Meciurile se judecă din scorurile finale scrise pe bilet. Cornerele și cartonașele intră în calcul doar când numărul lor e trecut la rezultat. Statisticile se schimbă pe măsură ce se încheie bilete noi.'));
}


/* ---------- Sugestii: 5 meciuri pe zi pentru goluri, GG, cornere, cartonașe ---------- */
const BB = 'https://production-superbet-bmb.freetls.fastly.net/betbuilder/v3/getBetbuilderMarketsForMatch?lang=ro-RO&target=SB_RO&match_id=';
const SUG_MIN = 1.35, SUG_MAX = 2.6;
let sugDay = 0;   // -1 = ieri, 0 = azi, 1 = mâine
let sugDate = '';  // o zi aleasă din istoric (YYYY-MM-DD)
let sugIdx = null, sugIdxT = 0;   // sugestii/index.json: scorul fiecărei zile salvate
function loadSugIdx() { sugIdxT = Date.now(); return fetch('sugestii/index.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []).then(j => { sugIdx = Array.isArray(j) ? j : []; }); }
const sug = {};   // key -> {t, data, busy}
const pois = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
const poisOverL = (l, line) => { let c = 0; for (let k = 0; k <= Math.floor(line); k++) c += pois(l, k); return Math.max(0, 1 - c); };
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } })); return out; }
async function dayMatches(off) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() + off); const d1 = new Date(d0.getTime() + 864e5);
  const T = await tournaments();
  const j = await (await fetch(OB + '/v3/ro-RO/events?index=active-prematch&startDate=' + d0.toISOString() + '&endDate=' + d1.toISOString(), { cache: 'no-store' })).json();
  const out = [];
  for (const e of (j.events || [])) {
    const f = e.fixture || {}; if (f.sport_id !== 5) continue;
    const li = T.get(String(f.tournament_id)); if (li == null) continue;
    const when = new Date(f.utc_date || f.unix_date_millis); if (dayKey(when) !== dayKey(d0) || when < new Date(Date.now() + 10 * 6e4)) continue;
    const [h, a] = (f.event_name || '').split('·'); if (!h || !a || /\b(u1[7-9]|u2[0-3]|feminin|women)\b/i.test(f.event_name)) continue;
    out.push({ id: e.event_id, meci: h.trim() + ' – ' + a.trim(), h: h.trim(), a: a.trim(), when, liga: LEAGUES[li][0] });
  }
  return { key: dayKey(d0), list: out.sort((x, y) => x.when - y.when) };
}
function lines(mk, name) { const m = (mk || []).find(x => x.name === name); const o = {}; if (m) for (const x of m.odds || []) { const r = /^Peste (\d+\.5)$/.exec(x.name); if (r && x.price) o[r[1]] = x.price; } return o; }
function bestLine(lam, odds) {
  let b = null;
  for (const [L, od] of Object.entries(odds)) { if (od < SUG_MIN || od > SUG_MAX) continue; const pm = poisOverL(lam, +L); const p = Math.min(0.88, 0.5 * pm + 0.5 * (1 / od) / 1.06); if (!b || p > b.p) b = { line: L, od, p, pm }; }
  return b;
}
async function buildSug(off) {
  const { key, list } = await dayMatches(off);
  await loadExtra();
  const f1 = v => (Math.round(v * 10) / 10).toLocaleString('ro-RO');
  const res = await pool(list, 6, async m => {
    const [st, bb] = await Promise.all([fetch(SA + m.id).then(r => r.json()).catch(() => ({})), fetch(BB + m.id).then(r => r.json()).catch(() => ({}))]);
    const S = {}; (st.prematch_stats || []).forEach(x => { S[x.text.args[0].split('.').pop()] = [parseFloat(x.team1), parseFloat(x.team2)]; });
    const g = S.goals_scored_per_game, c = S.goals_conceded_per_game, x = S.average_xg || g; if (!g || !c) return null;
    const mk = bb.markets || []; const out = [];
    const lh = Math.max(0.2, 0.5 * (g[0] + c[1]) / 2 + 0.5 * (x[0] + c[1]) / 2 + 0.1), la = Math.max(0.2, 0.5 * (g[1] + c[0]) / 2 + 0.5 * (x[1] + c[0]) / 2 - 0.05);
    const base = { id: m.id, meci: m.meci, when: m.when, liga: m.liga };
    // goluri
    const go = bestLine(lh + la, lines(mk, 'Total goluri'));
    if (go) out.push({ ...base, cat: 'goluri', sel: 'Peste ' + go.line + ' goluri', od: go.od, p: go.p, why: m.h + ' dă ' + f1(g[0]) + ' și primește ' + f1(c[0]) + ' goluri pe meci; ' + m.a + ' dă ' + f1(g[1]) + ' și primește ' + f1(c[1]) + '.' });
    // GG
    const ggm = mk.find(y => y.name === 'Ambele echipe marchează (GG)'); const ggo = ggm && (ggm.odds || []).find(y => y.name === 'Da');
    if (ggo && ggo.price >= SUG_MIN && ggo.price <= SUG_MAX) { const pm = (1 - Math.exp(-lh)) * (1 - Math.exp(-la)); const p = Math.min(0.88, 0.5 * pm + 0.5 * (1 / ggo.price) / 1.06);
      out.push({ ...base, cat: 'gg', sel: 'GG (ambele marchează)', od: ggo.price, p, why: m.h + ' marchează ' + f1(g[0]) + ' și primește ' + f1(c[0]) + ' pe meci; ' + m.a + ' marchează ' + f1(g[1]) + ' și primește ' + f1(c[1]) + '.' }); }
    // cornere
    const k = S.average_corners; if (k) { const co = bestLine(k[0] + k[1], lines(mk, 'Total cornere'));
      if (co) out.push({ ...base, cat: 'cornere', sel: 'Peste ' + co.line + ' cornere', od: co.od, p: co.p, why: 'Media cornerelor: ' + m.h + ' ' + f1(k[0]) + ', ' + m.a + ' ' + f1(k[1]) + ', adică ' + f1(k[0] + k[1]) + ' pe meci.' }); }
    // cartonașe
    const y = S.average_cards || S.average_yellow_cards; if (y) {
      const inf = infoFor({ id: m.id, meci: m.meci, when: m.when }); const ref = inf && inf.arbitru_galbene != null ? inf.arbitru_galbene + (inf.arbitru_rosii || 0) : null;
      const lam = ref != null ? 0.5 * (y[0] + y[1]) + 0.5 * ref : y[0] + y[1];
      const ca = bestLine(lam, lines(mk, 'Total cartonașe'));
      if (ca) out.push({ ...base, cat: 'cartonase', sel: 'Peste ' + ca.line + ' cartonașe', od: ca.od, p: ca.p, why: 'Cartonașe pe meci: ' + m.h + ' ' + f1(y[0]) + ', ' + m.a + ' ' + f1(y[1]) + (ref != null ? '; arbitrul ' + (inf.arbitru || '') + ' dă ' + f1(ref) + ' pe meci.' : '.') }); }
    return out;
  });
  const all = res.filter(Boolean).flat();
  const data = {};
  for (const c of ['goluri', 'gg', 'cornere', 'cartonase']) data[c] = all.filter(z => z.cat === c).sort((a, b) => b.p - a.p).slice(0, 5);
  return { key, n: list.length, data };
}
function loadSug(off) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() + off); const key = dayKey(d0);
  const c = sug[key];
  if (c && c.data && Date.now() - c.t < 30 * 6e4) return Promise.resolve(c);
  if (c && c.busy) return c.busy;
  const o = sug[key] = { ...(c || {}), busy: null };
  return (o.busy = buildSug(off).then(r => { Object.assign(o, r, { t: Date.now(), busy: null, err: '' }); return o; }).catch(() => { o.busy = null; o.err = 'Sugestiile nu s-au putut calcula acum. Încearcă din nou peste un minut.'; return o; }));
}
// lista salvată în fiecare dimineață (sugestii/<zi>.json, scrisă de GitHub Actions) + rezultatele ei
const snap = {};   // key -> {t, d (json|null), busy, res: {id|cat -> 'won'|'lost'|'ok'|'no'}, sc: {id -> 'H – A'}}
function loadSnap(key) {
  const c = snap[key]; if (c && (c.busy || Date.now() - c.t < 10 * 6e4)) return c.busy || Promise.resolve(c);
  const o = snap[key] = { ...(c || {}), busy: null };
  return (o.busy = fetch('sugestii/' + key + '.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
    .then(d => { Object.assign(o, { d, t: Date.now(), busy: null }); return o; }));
}
const sugSel = s => /^gg\b/i.test(s) ? 'GG' : s;
async function loadSnapRes(key) {
  const o = snap[key]; if (!o || !o.d || o.rbusy) return; if (o.rt && Date.now() - o.rt < 55e3) return;
  o.rbusy = true; try {
  const items = Object.values(o.d.sugestii || {}).flat();
  const ids = [...new Set(items.filter(z => !z.rez && new Date(z.when) < new Date()).map(z => z.id))];
  const M = {}; await pool(ids, 6, async id => { M[id] = await getMatch(id); });
  o.res = {}; o.sc = {}; o.live = false;
  for (const z of items) { if (z.rez) { if (z.rez !== 'void') o.res[z.id + '|' + z.sel] = z.rez; if (z.scor) o.sc[z.id + '|' + z.sel] = z.scor.replace('-', ' – ') + (z.total != null && /corner|cartona|galben/i.test(z.sel) ? ' · ' + z.total + (/corner/i.test(z.sel) ? ' cornere' : ' galbene') : ''); continue; } const m = M[z.id]; if (!m) continue; const r = judge(sugSel(z.sel), z.meci, m); if (r) o.res[z.id + '|' + z.sel] = r; if (m.h != null) o.sc[z.id + '|' + z.sel] = m.h + ' – ' + m.a + (/corner/i.test(z.sel) && m.corners ? ' · ' + (m.corners[0] + m.corners[1]) + ' cornere' : /cartona|galben/i.test(z.sel) && m.yellow ? ' · ' + (m.yellow[0] + m.yellow[1]) + ' galbene' : '') + (m.state === 2 ? '' : (m.min ? ' · ' + m.min + "'" : ' · live')); if (m.state === 1) o.live = true; }
  } finally { o.rt = Date.now(); o.rbusy = false; }
}
const SUG_CATS = [['goluri', 'Goluri', 'Meciuri cu multe goluri'], ['gg', 'GG', 'Ambele echipe marchează'], ['cornere', 'Cornere', 'Peste numărul de cornere'], ['cartonase', 'Cartonașe', 'Peste numărul de cartonașe']];
function viewSuggest() {
  const list = $('list');
  const seg = el('div', 'sg-seg');
  [['Ieri', -1], ['Azi', 0], ['Mâine', 1]].forEach(([t, v]) => { const b = el('button', null, t); b.type = 'button'; b.setAttribute('aria-pressed', String(sugDay === v && !sugDate)); b.onclick = () => { sugDay = v; sugDate = ''; render(); }; seg.append(b); });
  // istoric: orice zi salvată
  const bar = el('div', 'sg-bar'); bar.append(seg);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0); const kIeri = dayKey(new Date(t0.getTime() - 864e5)), kAzi = dayKey(t0);
  if (sugIdx && sugIdx.length) {
    const sel = el('select', 'sg-pick'); sel.setAttribute('aria-label', 'Alege o zi din istoric');
    sel.append(new Option('Istoric: alege ziua…', ''));
    for (const r of sugIdx) if (r.data !== kAzi) sel.append(new Option(dayLabel(r.data).join(', ') + (r.n ? ' — ' + r.w + ' din ' + r.n : ''), r.data));
    sel.value = sugDate; sel.onchange = () => { sugDate = sel.value; render(); };
    bar.append(sel);
  } else if (!sugIdxT) loadSugIdx().then(() => { if (tab === 's') render(); });
  list.append(el('p', 'intro', 'Câte 5 meciuri pentru fiecare tip de pariu, alese după cea mai mare șansă de reușită din statisticile echipelor (și ale arbitrului, la cartonașe), combinate cu cota Superbet. Doar cote de la 1,35 în sus. Nu e un bilet: le alegi tu.'), bar);
  if (sugIdx && sugIdx.some(r => r.n)) {
    const T = { w: 0, n: 0 }, C = {}; for (const r of sugIdx) { T.w += r.w; T.n += r.n; for (const [k, [w, n]] of Object.entries(r.cat || {})) { C[k] = C[k] || [0, 0]; C[k][0] += w; C[k][1] += n; } }
    const tot = el('div', 'sg-tot'); const first = sugIdx[sugIdx.length - 1].data;
    tot.append(el('span', null, 'Din ' + dayLabel(first)[1] + ' încoace: '), el('b', null, T.w + ' din ' + T.n + ' (' + Math.round(100 * T.w / T.n) + '%)'));
    for (const [k, name] of SUG_CATS) if (C[k] && C[k][1]) tot.append(el('span', 'c', name + ' ' + C[k][0] + '/' + C[k][1]));
    list.append(tot);
  }
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() + sugDay); const key = sugDate || dayKey(d0);
  const past = sugDate ? sugDate < kAzi : sugDay < 0;
  const again = () => { if (tab === 's') render(); };
  // ieri și azi: lista salvată dimineața, cu rezultatele; mâine (sau azi înainte de salvare): calcul live
  let saved = null;
  if (sugDate || sugDay <= 0) {
    const sn = snap[key];
    if (!sn || sn.t == null) { list.append(el('div', 'empty', 'Se încarcă sugestiile…')); loadSnap(key).then(again); return; }
    if (Date.now() - sn.t > 10 * 6e4) loadSnap(key).then(again);
    if (sn.d) { saved = sn; if (!sn.rbusy && (!sn.rt || (Date.now() - sn.rt > 55e3 && !past))) loadSnapRes(key).then(again); }
    else if (past) { list.append(el('div', 'empty', 'Pentru ziua asta nu există o listă salvată. Listele se salvează în fiecare dimineață, începând cu 25 octombrie 2026.')); return; }
  }
  let c;
  if (saved) c = { data: saved.d.sugestii, n: saved.d.n };
  else {
    c = sug[key];
    if (!c || !c.data) { list.append(el('div', 'empty', 'Se calculează sugestiile… (se citesc cotele și statisticile fiecărui meci, durează câteva secunde)')); loadSug(sugDay).then(again); return; }
    if (c.err) list.append(el('div', 'err', c.err));
  }
  const R = (saved && saved.res) || {}, SC = (saved && saved.sc) || {};
  if (saved) {
    const all = Object.values(c.data).flat(), won = all.filter(z => R[z.id + '|' + z.sel] === 'won').length, lost = all.filter(z => R[z.id + '|' + z.sel] === 'lost').length;
    const sum = el('div', 'sg-sum');
    sum.append(el('b', null, won + ' din ' + (won + lost)), el('span', null, (won + lost ? ' intrate până acum' : ' încă nicio sugestie încheiată') + (all.length - won - lost ? ' · ' + (all.length - won - lost) + (past ? ' fără rezultat încă' : ' de jucat sau în desfășurare') : '')));
    list.append(sum);
  }
  const grid = el('div', 'sg-grid');
  for (const [k, name, sub] of SUG_CATS) {
    const card = el('section', 'sg-card'); const h = el('h3', null, name);
    const arr = (c.data[k] || []);
    if (saved) { const w = arr.filter(z => R[z.id + '|' + z.sel] === 'won').length, l = arr.filter(z => R[z.id + '|' + z.sel] === 'lost').length; h.append(el('small', null, w + l ? w + ' din ' + (w + l) + ' intrate' : sub)); }
    else h.append(el('small', null, sub));
    card.append(h);
    if (!arr.length) card.append(el('p', 'note', !sugDate && sugDay === 0 ? 'Nu mai sunt meciuri potrivite azi. Vezi „Mâine”.' : 'Nu sunt încă meciuri potrivite.'));
    const ol = el('ol', 'sg-list');
    arr.forEach(z => {
      const when = new Date(z.when), r = R[z.id + '|' + z.sel];
      const li = el('li'); li.tabIndex = 0; li.setAttribute('role', 'button'); li.title = 'Detalii meci'; if (r) li.dataset.res = r;
      const top = el('div', 'sg-top'); top.append(el('span', 't', fmtHM(when)), el('span', 'm', z.meci), el('span', 'sg-p', Math.round(z.p * 100) + '%'));
      const mid = el('div', 'sg-mid'); mid.append(el('b', null, z.sel), el('span', 'o', '@ ' + fmtOdd(z.od)));
      if (SC[z.id + '|' + z.sel]) mid.append(el('span', 'sg-sc', SC[z.id + '|' + z.sel]));
      if (r === 'won' || r === 'lost') mid.append(el('span', 'sg-res ' + r, r === 'won' ? '✓ Intrat' : '✗ Pierdut'));
      mid.append(el('span', 'lg', z.liga));
      li.append(top, mid, el('p', 'sg-why', z.why));
      const open = () => openSheet({ id: z.id, meci: z.meci, when, sel: z.sel, o: fmtOdd(z.od), motiv: z.why });
      li.onclick = open; li.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
      ol.append(li);
    });
    card.append(ol); grid.append(card);
  }
  list.append(grid);
  list.append(el('p', 'note rs-note', saved
    ? 'Lista a fost salvată la ' + fmtHM(new Date(saved.d.salvat)) + ', cu cotele de atunci, și nu se mai schimbă, ca să se vadă cinstit câte au intrat. Cornerele și cartonașele se judecă din statisticile Superbet ale meciului (la cartonașe se numără galbenele). ' + (c.n ? c.n + ' meciuri analizate.' : '')
    : 'Procentul e șansa estimată de noi; cota arată ce crede casa. Sugestiile se recalculează la fiecare 30 de minute, cu cotele de atunci. ' + (c.n ? c.n + ' meciuri analizate.' : '')));
  if (saved && saved.live) setTimeout(() => { if (tab === 's' && !past) { loadSnapRes(key).then(again); } }, 60e3);
}

/* ---------- header, chips, tabs ---------- */
function header() {
  const P = rows.filter(r => eff(r) === PEND), W = rows.filter(r => eff(r) === 'câștigat').length, Lo = rows.filter(r => eff(r) === 'pierdut').length;
  $('s-p').textContent = P.length; $('s-w').textContent = W; $('s-l').textContent = Lo;
  $('n-p').textContent = P.length; $('n-h').textContent = W + Lo;
  let best = null;
  for (const r of P) for (const l of parseLegs(r)) if (l.when && l.when > now && (!best || l.when < best.when)) best = l;
  const n = $('next'); const badge = n.querySelector('.livebadge'); n.replaceChildren(); if (badge) n.append(badge);
  if (best) {
    const mins = Math.round((best.when - now) / 6e4), h = Math.floor(mins / 60), m = mins % 60;
    const cd = el('span', 'cd', mins < 60 ? 'în ' + mins + ' min' : h < 24 ? 'în ' + h + ' h ' + m + ' min' : (dayLabel(dayKey(best.when))[0].toLowerCase() + ' la ' + fmtHM(best.when)));
    const nm = el('button', 'nextm', best.meci); nm.type = 'button'; nm.title = 'Detalii meci';
    nm.onclick = () => openSheet({ ...best });
    n.append('Următorul meci de pe bilete: ', nm, ', ', cd, '.');
  } else n.append('Niciun meci programat pe biletele active.');
}
function chips() {
  const box = $('chips'); box.replaceChildren();
  box.hidden = tab === 'm' || tab === 'r' || tab === 's' || tab === 'x';
  const have = new Set(rows.map(r => catOf(r.tip))); const tips = ['', ...CATS.filter(c => have.has(c))];
  for (const t of tips) { const b = el('button', null, t || 'Toate'); b.type = 'button'; b.setAttribute('aria-pressed', String(t === tip)); b.onclick = () => { tip = t; chips(); render(); }; box.append(b); }
}
function render() {
  const list = $('list'); list.replaceChildren();
  if (tab === 'p') viewTickets(true); else if (tab === 'h') viewTickets(false); else if (tab === 'c') viewCalendar(); else if (tab === 'r') viewResults(); else if (tab === 's') viewSuggest(); else if (tab === 'x') viewChallenge(); else viewMatches();
  liveTick();
}
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  tab = b.dataset.tab;
  for (const x of $('tabs').querySelectorAll('button')) x.setAttribute('aria-selected', String(x === b));
  try { history.replaceState(null, '', '#' + tab); } catch (err) {}
  chips(); render();
});
$('q').addEventListener('input', e => { q = nrm(e.target.value.trim()); render(); });

/* ---------- start ---------- */
const h0 = (location.hash || '').slice(1); if (['p', 'm', 'c', 'h', 'r', 's', 'x'].includes(h0)) { tab = h0; for (const x of $('tabs').querySelectorAll('button')) x.setAttribute('aria-selected', String(x.dataset.tab === tab)); }
loadExtra();
fetch('bilete.json?v=' + Date.now(), { cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error('fișierul de bilete nu răspunde (' + r.status + ')'); return r.json(); })
  .then(d => {
    rows = (Array.isArray(d) ? d : (d.rows || [])).filter(r => r.tip !== 'Test');
    for (const id of [...lostNow.keys()]) { const r = rows.find(x => x.id === id); if (!r || r.status !== PEND) lostNow.delete(id); }
    try { localStorage.setItem('lostNow', JSON.stringify(Object.fromEntries(lostNow))); } catch (e) {}
    chips(); header(); render(); $('next').after(soundBtn());
    setInterval(() => { now = new Date(); header(); liveTick(); if (tab === 'm' && Date.now() - day.t > 5 * 6e4) loadDay().then(() => { if (tab === 'm') render(); }); }, 60000);
  })
  .catch(e => { $('next').textContent = ''; $('list').append(el('div', 'err', 'Biletele nu s-au putut încărca: ' + e.message + '. Reîncarcă pagina peste un minut.')); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// ceasul din bara de sus, ca la teletext
(function ttxClock() {
  const e = document.getElementById('ttx-ck'); if (!e) return;
  const city = LOCAL_TZ.split('/').pop().replace(/_/g, ' ');
  const tick = () => { const d = new Date(); e.textContent = d.toLocaleDateString('ro-RO', { weekday: 'short', day: '2-digit', month: 'short' }) + '  ' + d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + (awayFromRO ? '  ora ta: ' + city : ''); };
  if (awayFromRO) e.title = 'Orele meciurilor sunt afișate în ora locală (' + city + '), nu în ora României.';
  tick(); setInterval(tick, 1000);
})();
