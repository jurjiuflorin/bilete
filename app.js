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

function parseLegs(r) {
  const [Y, M, D] = r.data.split('-').map(Number);
  return (r.selectii || '').split(' · ').filter(Boolean).map((p, k) => {
    const m = p.match(/^(?:(\d{2})\.(\d{2}) )?(\d{2}):(\d{2}) (.+?): (.+?)(?: \(([^)]*)\))?$/);
    const base = { id: (r.ids || [])[k] || null, motiv: (r.motive || [])[k] || '', sport: r.sport || 'fotbal' };
    if (!m) return { ...base, meci: p, sel: '', o: '', when: null };
    const d = m[1] ? +m[1] : D, mo = m[2] ? +m[2] : M;
    return { ...base, when: new Date(Y, mo - 1, d, +m[3], +m[4]), meci: m[5], sel: m[6], o: m[7] || '' };
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
  const L = parseLegs(r), settled = r.status !== 'în așteptare';
  const s = el('article', 'slip' + (settled ? ' settled' : ''));
  const top = el('div', 'slip-top');
  const first = L.find(l => l.when), last = [...L].reverse().find(l => l.when);
  let span = '';
  if (first) { span = fmtDM(first.when); if (last && dayKey(last.when) !== dayKey(first.when)) span += ' – ' + fmtDM(last.when); }
  const tipBox = el('div', 'slip-tip', r.tip);
  if (r.sport && r.sport !== 'fotbal') tipBox.append(el('span', 'sport', r.sport));
  top.append(tipBox, el('div', 'slip-date', (L.length + ' meciuri') + (span ? ', ' + span : '')));
  s.append(top);

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
  if (settled) { const st = el('div', 'stamp ' + (r.status === 'câștigat' ? 'won' : 'lost'), r.status === 'câștigat' ? 'Câștigat' : 'Pierdut'); st.style.setProperty('--d', (Math.min(i, 8) * .06) + 's'); tot.append(st); }
  s.append(tot);
  if (r.rezultat) s.append(el('div', 'rez', r.rezultat));
  return s;
}

function copy(t, b, label) {
  const done = () => { toast('Copiat'); if (b) { b.textContent = 'Copiat'; b.classList.add('ok'); setTimeout(() => { b.textContent = label; b.classList.remove('ok'); }, 1600); } };
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, () => toast('Nu s-a putut copia')); else toast('Nu s-a putut copia');
}
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), 1800); }

/* ---------- views ---------- */
const filtered = arr => arr.filter(r => !tip || r.tip === tip).filter(r => !q || nrm(r.selectii).includes(q));

function viewTickets(pending) {
  const list = $('list');
  let R = filtered(rows.filter(r => pending === (r.status === 'în așteptare')));
  if (!R.length) { list.append(el('div', 'empty', pending ? 'Niciun bilet de jucat acum. Biletele noi apar dimineața.' : 'Încă nu s-a încheiat niciun bilet.')); return; }
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

// every match on active tickets, grouped by day
function allMatches(fromNow) {
  const map = new Map();
  for (const r of rows) {
    if (r.status !== 'în așteptare') continue;
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
  const M = allMatches(false).filter(m => !q || nrm(m.meci).includes(q)).filter(m => !tip || m.picks.some(p => p.row.tip === tip))
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

/* ---------- builder: your own ticket ---------- */
let pick = store.get('bilet-meu', {});   // key -> {meci, sel, o, when, id}
function viewBuilder() {
  const list = $('list');
  const intro = el('p', 'intro', 'Alege meciurile din biletele active. Pentru fiecare meci poți bifa o singură selecție. Cota și șansa se calculează pe loc, iar „Cere codul” îmi trimite biletul ca să generez codul de agenție.');
  list.append(intro);
  const M = allMatches(true).filter(m => !q || nrm(m.meci).includes(q));
  // drop picks whose match already started
  for (const k of Object.keys(pick)) if (new Date(pick[k].when) < now) delete pick[k];
  if (!M.length) { list.append(el('div', 'empty', 'Nu mai sunt meciuri neîncepute pe biletele active.')); updBuild(); return; }
  const days = new Map(); for (const m of M) { const k = dayKey(m.when); if (!days.has(k)) days.set(k, []); days.get(k).push(m); }
  for (const [k, arr] of days) {
    const sec = el('section', 'day'); const [a, b] = dayLabel(k);
    const h = el('h2', null, a); h.append(el('small', null, b));
    const card = el('div', 'slip cal build');
    const ul = el('ul', 'picks');
    for (const m of arr) {
      const mk = m.id ? 'id' + m.id : nrm(m.meci) + '|' + dayKey(m.when);
      const li = el('li');
      const head = el('div', 'ph'); head.append(el('span', 't', fmtHM(m.when)), el('span', 'm', m.meci));
      const info = el('button', 'info', 'i'); info.type = 'button'; info.title = 'Detalii meci'; info.setAttribute('aria-label', 'Detalii ' + m.meci);
      info.onclick = () => openSheet({ ...m, _picks: m.picks });
      head.append(info); li.append(head);
      const opts = el('div', 'opts');
      const seen = new Set();
      for (const p of m.picks) {
        if (seen.has(p.sel)) continue; seen.add(p.sel);
        const b = el('button', 'opt'); b.type = 'button';
        b.append(el('span', null, p.sel), el('b', null, p.o));
        const on = pick[mk] && pick[mk].sel === p.sel;
        b.setAttribute('aria-pressed', String(!!on));
        b.onclick = () => {
          if (pick[mk] && pick[mk].sel === p.sel) delete pick[mk];
          else pick[mk] = { meci: m.meci, sel: p.sel, o: p.o, when: m.when.toISOString(), id: m.id || null };
          store.set('bilet-meu', pick); opts.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-pressed', String(!!(pick[mk] && pick[mk].sel === x.firstChild.textContent))));
          updBuild();
        };
        opts.append(b);
      }
      li.append(opts); ul.append(li);
    }
    card.append(ul); sec.append(h, card); list.append(sec);
  }
  updBuild();
}
function buildList() { return Object.values(pick).sort((a, b) => new Date(a.when) - new Date(b.when)); }
function updBuild() {
  const B = buildList(), bar = $('buildbar');
  $('n-b').textContent = B.length ? B.length : '';
  bar.hidden = tab !== 'b' || !B.length;
  const c = B.reduce((a, x) => a * (parseFloat(x.o) || 1), 1);
  const p = B.reduce((a, x) => a * Math.min(.9, .94 / (parseFloat(x.o) || 1)), 1);
  $('bb-n').textContent = B.length; $('bb-c').textContent = fmtOdd(c); $('bb-p').textContent = B.length ? pct(p) : '–';
}
function buildText() {
  return buildList().map(x => { const d = new Date(x.when); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + fmtHM(d) + ' ' + x.meci + ': ' + x.sel + ' (' + x.o + ')' + (x.id ? ' [id ' + x.id + ']' : ''); }).join('\n');
}
$('bb-clear').onclick = () => { pick = {}; store.set('bilet-meu', pick); render(); };
$('bb-go').onclick = () => {
  const B = buildList(); if (!B.length) return;
  const c = B.reduce((a, x) => a * (parseFloat(x.o) || 1), 1);
  const body = 'Cerere de bilet trimisă de pe site. Claude generează codul de agenție la următoarea rulare (9:53) sau imediat dacă îi scrii în chat.\n\n```\n' + buildText() + '\n```\n\nCotă estimată: ' + c.toFixed(2);
  const url = 'https://github.com/' + REPO + '/issues/new?title=' + encodeURIComponent('Bilet: ' + B.length + ' meciuri, cota ' + c.toFixed(2)) + '&body=' + encodeURIComponent(body);
  openSheetBuild(url);
};
function openSheetBuild(url) {
  const box = $('sheet-body'); box.replaceChildren();
  box.append(el('h3', null, 'Trimite biletul'));
  box.id = 'sheet-body';
  const pre = el('pre', 'blist', buildText()); box.append(pre);
  const a = el('a', 'btn', 'Trimite cererea pe GitHub'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
  const cp = el('button', 'btn ghost', 'Copiază lista'); cp.type = 'button'; cp.onclick = () => copy(buildText(), cp, 'Copiază lista');
  const row = el('div', 'btnrow'); row.append(a, cp); box.append(row);
  box.append(el('p', 'note', 'Pe GitHub apeși „Create” (trebuie să fii logat). Codul apare pe site la următoarea rulare a sarcinii de coduri, la 9:53. Dacă vrei codul imediat, copiază lista și trimite-o în chat lui Claude.'));
  showSheet();
}

/* ---------- match sheet ---------- */
function showSheet() { $('sheet').hidden = false; document.body.classList.add('noscroll'); setTimeout(() => $('sheet').querySelector('.sheet-x').focus(), 30); }
function hideSheet() { $('sheet').hidden = true; document.body.classList.remove('noscroll'); }
$('sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) hideSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet').hidden) hideSheet(); });

function picksFor(l) {
  if (l._picks) return l._picks;
  const out = [];
  for (const r of rows) parseLegs(r).forEach(x => { if ((l.id && x.id === l.id) || (!l.id && x.meci === l.meci && x.when && l.when && dayKey(x.when) === dayKey(l.when))) out.push({ row: r, sel: x.sel, o: x.o, motiv: x.motiv }); });
  return out;
}
const STAT_LABEL = { goals_scored_per_game: 'Goluri marcate / meci', goals_conceded_per_game: 'Goluri primite / meci', average_xg: 'Goluri așteptate (xG)', average_shots_on_target: 'Șuturi pe poartă', average_corners: 'Cornere / meci', average_yellow_cards: 'Cartonașe galbene', average_cards: 'Cartonașe total' };
async function openSheet(l) {
  const box = $('sheet-body'); box.replaceChildren();
  const [h, a] = (l.meci || '').split(' – ');
  const t = el('h3', null, l.meci); t.id = 'sh-title'; box.append(t);
  if (l.when) box.append(el('p', 'when', dayLabel(dayKey(l.when))[0] + ', ' + fmtDM(l.when) + ', ora ' + fmtHM(l.when)));
  const live = el('div', 'sh-live'); box.append(live);
  const P = picksFor(l);
  if (P.length) {
    const sec = el('div', 'sh-sec'); sec.append(el('h4', null, P.length === 1 ? 'Pe bilet' : 'Pe ' + P.length + ' bilete'));
    const ul = el('ul', 'sh-picks');
    for (const p of P) { const li = el('li'); li.append(el('span', 'k', p.row.tip), el('span', 'v', p.sel + (p.o ? ' @ ' + p.o : ''))); ul.append(li); }
    sec.append(ul);
    const why = P.map(p => p.motiv).filter(Boolean);
    if (why.length) { sec.append(el('h4', null, 'De ce l-am ales')); [...new Set(why)].forEach(w => sec.append(el('p', 'why', w))); }
    box.append(sec);
  }
  const stats = el('div', 'sh-sec'); box.append(stats);
  showSheet();
  if (!l.id || (l.sport && l.sport !== 'fotbal')) { if (!l.id) stats.append(el('p', 'note', 'Pentru meciul ăsta nu am ID-ul Superbet, deci nu pot arăta statisticile.')); return; }
  stats.append(el('p', 'note', 'Se încarcă statisticile…'));
  try {
    const j = await (await fetch(SA + l.id, { cache: 'no-store' })).json();
    stats.replaceChildren();
    const m = await getMatch(l.id);
    if (m && m.state === 1) live.replaceChildren(el('span', 'dot'), document.createTextNode('Live: ' + m.h + ' – ' + m.a + (m.min ? ', minutul ' + m.min : '')));
    else if (m && m.state === 2) live.textContent = 'Final: ' + m.h + ' – ' + m.a;
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
    const ref = (j.referees || []).find(x => x.type === 1);
    if (ref) stats.append(el('p', 'ref', 'Arbitru: ' + ref.name.split(', ').reverse().join(' ')));
    if (!ps.length && !ref) stats.append(el('p', 'note', 'Superbet nu are încă statistici pentru meciul ăsta.'));
  } catch (e) { stats.replaceChildren(el('p', 'note', 'Statisticile nu s-au putut încărca acum. Încearcă din nou peste un minut.')); }
}
document.addEventListener('click', e => {
  const li = e.target.closest('.legs li'); if (!li || !li._leg) return;
  openSheet({ ...li._leg, _picks: li._picks });
});
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.legs li')) { e.preventDefault(); e.target.click(); } });

/* ---------- live scores ---------- */
const live = { cache: {}, busy: false, again: false };
function statOf(j, key) { for (const g of (j.statistics || [])) if (g.period === 0) for (const d of g.data || []) if (d.text && d.text.args && d.text.args[0] === 'stats.football.match.' + key) return [Number(d.team1) || 0, Number(d.team2) || 0]; return null; }
async function getMatch(id, sport) {
  const c = live.cache[id]; if (c && (c.state === 2 || Date.now() - c.t < 55e3)) return c;
  try {
    let m;
    if (!sport || sport === 'fotbal') {
      const j = await (await fetch(SA + id, { cache: 'no-store' })).json();
      const sc = (j.scores || []).find(x => x.type === 0);
      let min = null; if (j.live_minute) { const lm = j.live_minute; const e = lm.elapsed_seconds + (lm.anchor_date ? Math.max(0, Date.now() / 1000 - lm.anchor_date.seconds) : 0); min = Math.min(Math.floor(e / 60) + 1, lm.max_seconds ? Math.floor(lm.max_seconds / 60) : 120); }
      m = { t: Date.now(), state: j.match_state, h: sc ? sc.team1 : null, a: sc ? sc.team2 : null, min, corners: statOf(j, 'corner_kicks'), yellow: statOf(j, 'yellow_cards') };
    } else {
      const j = await (await fetch(OFFER + id + '&includeOnly=fixture,inPlayStats,inPlayStatsMetadata', { cache: 'no-store' })).json();
      const e = j.events && j.events[0]; if (!e) return c || null;
      const st = (e.inplay_stats_metadata && e.inplay_stats_metadata.status) || '';
      const ip = e.inplay_stats || {};
      m = { t: Date.now(), state: /START|LIVE|PROGRESS/i.test(st) ? 1 : /END|FINISH|CLOSE/i.test(st) ? 2 : 0, h: ip.home_team_score != null ? +ip.home_team_score : null, a: ip.away_team_score != null ? +ip.away_team_score : null, min: null, label: e.inplay_stats_metadata && e.inplay_stats_metadata.event_status_label };
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
  if (s.startsWith('bet builder')) { const parts = sel.replace(/^bet builder\s*/i, '').split(/\s*\+\s*/).map(p => judge(p, meci, m)); if (parts.includes(null)) return null; if (parts.includes('lost')) return 'lost'; if (parts.every(p => p === 'won')) return 'won'; return parts.includes('no') ? 'no' : 'ok'; }
  return null;
}
function applyFin() {
  for (const li of document.querySelectorAll('.legs li[data-fin]')) { const m = li._fin; const r = judge(li._sel, li._meci, m); if (r) li.dataset.res = r; const lv = li.querySelector('.lv'); lv.className = 'lv on fin'; lv.textContent = 'Final ' + m.h + ' – ' + m.a; }
}
function progs() {
  for (const s of document.querySelectorAll('.slip')) {
    const p = s.querySelector('.prog'); if (!p) continue;
    const L = [...s.querySelectorAll('.legs li')]; const n = L.length;
    const won = L.filter(l => l.dataset.res === 'won').length, lost = L.filter(l => l.dataset.res === 'lost'), on = L.filter(l => l.classList.contains('livenow')).length;
    const todo = n - won - lost.length - on;
    if (!won && !lost.length && !on) { p.className = 'prog'; continue; }
    p.className = 'prog on'; p.replaceChildren();
    const cnt = el('div', 'cnt');
    cnt.append(el('span', 'cw', '✓ ' + won + (won === 1 ? ' câștigat' : ' câștigate')), el('span', 'cl', '✗ ' + lost.length + (lost.length === 1 ? ' pierdut' : ' pierdute')));
    if (on) cnt.append(el('span', 'co', '● ' + on + ' live'));
    if (todo > 0) cnt.append(el('span', 'ct', todo + ' de jucat'));
    p.append(cnt);
    if (lost.length) p.append(el('div', 'why', 'Picat la ' + lost.map(l => l._meci).join(', ') + '.'));
    else if (won === n) p.append(el('div', 'why', 'Toate meciurile au intrat.'));
  }
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
    let liveCount = 0; const counted = new Set();
    for (const li of lis) {
      const m = res[li.dataset.id]; const lv = li.querySelector('.lv');
      li.classList.remove('livenow');
      if (!m || m.state === 0 || m.h == null) { lv.className = 'lv'; li.removeAttribute('data-res'); continue; }
      const r = judge(li._sel, li._meci, m);
      if (r) li.dataset.res = r; else li.removeAttribute('data-res');
      const corn = m.corners && /corner/.test(nrm(li._sel)) ? (m.corners[0] + m.corners[1]) + ' cornere' : '';
      if (m.state === 1) {
        if (!counted.has(li.dataset.id)) { counted.add(li.dataset.id); liveCount++; }
        li.classList.add('livenow'); lv.className = 'lv on live';
        lv.replaceChildren(el('span', 'dot'), document.createTextNode(m.h + ' – ' + m.a + (m.min ? '  ·  ' + m.min + "'" : m.label ? '  ·  ' + m.label : '') + (corn ? '  ·  ' + corn : '')));
      } else { lv.className = 'lv on fin'; lv.textContent = 'Final ' + m.h + ' – ' + m.a + (corn ? ', ' + corn : ''); }
    }
    progs();
    const nx = $('next'); nx.querySelector('.livebadge')?.remove();
    if (liveCount) { const b = el('span', 'livebadge'); b.append(el('span', 'dot'), liveCount + (liveCount === 1 ? ' meci live acum. ' : ' meciuri live acum. ')); nx.prepend(b); }
  } finally { live.busy = false; if (live.again) { live.again = false; liveTick(); } }
}

/* ---------- header, chips, tabs ---------- */
function header() {
  const P = rows.filter(r => r.status === 'în așteptare'), W = rows.filter(r => r.status === 'câștigat').length, Lo = rows.filter(r => r.status === 'pierdut').length;
  $('s-p').textContent = P.length; $('s-w').textContent = W; $('s-l').textContent = Lo;
  $('n-p').textContent = P.length; $('n-h').textContent = W + Lo;
  let best = null;
  for (const r of P) for (const l of parseLegs(r)) if (l.when && l.when > now && (!best || l.when < best.when)) best = l;
  const n = $('next'); const badge = n.querySelector('.livebadge'); n.replaceChildren(); if (badge) n.append(badge);
  if (best) {
    const mins = Math.round((best.when - now) / 6e4), h = Math.floor(mins / 60), m = mins % 60;
    const cd = el('span', 'cd', mins < 60 ? 'în ' + mins + ' min' : h < 24 ? 'în ' + h + ' h ' + m + ' min' : (dayLabel(dayKey(best.when))[0].toLowerCase() + ' la ' + fmtHM(best.when)));
    n.append('Următorul meci de pe bilete: ', el('strong', null, best.meci), ', ', cd, '.');
  } else n.append('Niciun meci programat pe biletele active.');
}
function chips() {
  const box = $('chips'); box.replaceChildren();
  box.hidden = tab === 'b';
  const tips = ['', ...new Set(rows.map(r => r.tip))];
  for (const t of tips) { const b = el('button', null, t || 'Toate'); b.type = 'button'; b.setAttribute('aria-pressed', String(t === tip)); b.onclick = () => { tip = t; chips(); render(); }; box.append(b); }
}
function render() {
  const list = $('list'); list.replaceChildren();
  if (tab === 'p') viewTickets(true); else if (tab === 'h') viewTickets(false); else if (tab === 'c') viewCalendar(); else viewBuilder();
  updBuild();
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
const h0 = (location.hash || '').slice(1); if (['p', 'c', 'b', 'h'].includes(h0)) { tab = h0; for (const x of $('tabs').querySelectorAll('button')) x.setAttribute('aria-selected', String(x.dataset.tab === tab)); }
fetch('bilete.json?v=' + Date.now(), { cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error('fișierul de bilete nu răspunde (' + r.status + ')'); return r.json(); })
  .then(d => {
    rows = (Array.isArray(d) ? d : (d.rows || [])).filter(r => r.tip !== 'Test');
    chips(); header(); render();
    setInterval(() => { now = new Date(); header(); liveTick(); }, 60000);
  })
  .catch(e => { $('next').textContent = ''; $('list').append(el('div', 'err', 'Biletele nu s-au putut încărca: ' + e.message + '. Reîncarcă pagina peste un minut.')); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
