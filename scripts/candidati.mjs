// Tabelul zilei pentru biletele zilnice: cote reale Superbet + formă (ultimele 10 meciuri, toate competițiile) + H2H.
// Scrie candidati/<YYYY-MM-DD>.json cu: toate selecțiile candidate, propuneri (mai multe variante) pentru fiecare tip de bilet
// și un plan în care meciurile se repetă cât mai puțin între bilete. Rulat de .github/workflows/sugestii.yml.
import fs from 'node:fs';

const OB = 'https://production-superbet-offer-ro.freetls.fastly.net';
const SA = 'https://scorealarm-stats.freetls.fastly.net/v2/soccer/fixtures/overview/rosuperbetsport/ro-RO?fixture-id=ax%3Amatch%3A';
const SAH = 'https://scorealarm-stats.freetls.fastly.net/v2/soccer/fixtures/h2h/rosuperbetsport/ro-RO?';
const BB = 'https://production-superbet-bmb.freetls.fastly.net/betbuilder/v3/getBetbuilderMarketsForMatch?lang=ro-RO&target=SB_RO&match_id=';

const LEAGUES = [
  ['Liga Campionilor', /^(uefa - |uefa )?(liga campionilor|champions league)( - (faza (ligii|eliminatorie)|gr\.?\s?[a-h]|play-?off))?$/, [69433, 80794]],
  ['Europa League', /^(uefa - |uefa )?(europa league|liga europa)( - (faza (ligii|eliminatorie)|gr\.?\s?[a-l]|play-?off))?$/, []],
  ['Conference League', /^(uefa - |uefa )?(europa )?(conference league|liga conferintelor)( - (faza (ligii|eliminatorie)|gr\.?\s?[a-h]|play-?off))?$/, []],
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
  ['Championship', /^anglia - championship$/, [27]],
  ['Premiership (Scoția)', /^scotia - premiership$/, []],
  ['Bundesliga (Austria)', /^austria - bundesliga$/, []],
  ['Super League (Elveția)', /^elvetia - super league$/, [492]],
  ['Superliga (Danemarca)', /^danemarca - superliga(en)?$/, []],
  ['Eliteserien', /^norvegia - eliteserien$/, []],
  ['Allsvenskan', /^suedia - allsvenskan$/, [983]],
];
const nrm = x => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dayKey = d => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest' }).format(d);
const getJ = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } }); if (r.ok) return await r.json(); console.log('HTTP', r.status, u.slice(0, 90)); } catch (e) { console.log('ERR', String(e).slice(0, 120), u.slice(0, 90)); } await new Promise(r => setTimeout(r, 1500)); } return {}; };
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { console.log('EROARE meci', String(e).slice(0, 100)); out[k] = null; } } })); return out; }
const r3 = v => Math.round(v * 1000) / 1000;

const force = process.argv.includes('--force');
const now = new Date(), key = dayKey(now), tomorrow = dayKey(new Date(+now + 24 * 36e5));
const file = `candidati/${key}.json`;
if (fs.existsSync(file) && !force) { console.log('exista deja', file); process.exit(0); }
const hr = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(now);
if (hr < 7 && !force) { console.log('prea devreme', hr); process.exit(0); }

// ---- meciurile zilei (azi + mâine, pentru runda de Champions League) ----
const T = new Map(); LEAGUES.forEach(([, , ids], i) => ids.forEach(id => T.set(String(id), i)));
const st0 = await getJ(OB + '/v2/ro-RO/struct');
for (const t of ((st0.data || st0).tournaments || [])) { const n = nrm(t.localNames && (t.localNames['ro-RO'] || Object.values(t.localNames)[0])).replace(/\s+/g, ' ').trim(); const i = LEAGUES.findIndex(L => L[1].test(n)); if (i >= 0) T.set(String(t.id), i); }
const h0 = Math.floor(now / 36e5) * 36e5;
const ev = await getJ(OB + '/v3/ro-RO/events?index=active-prematch&startDate=' + new Date(h0 - 3 * 36e5).toISOString() + '&endDate=' + new Date(h0 + 54 * 36e5).toISOString());
// Echipe de evitat complet (cerere utilizator 07.11.2026): Tottenham și Manchester United
const EVITA = /tottenham|spurs|man(chester|\.)?\s*(united|utd)/i;
const list = [];
for (const e of (ev.events || [])) {
  const f = e.fixture || {}; if (f.sport_id !== 5) continue;
  const li = T.get(String(f.tournament_id)); if (li == null) continue;
  const when = new Date(f.utc_date || f.unix_date_millis); const zi = dayKey(when); if ((zi !== key && zi !== tomorrow) || when < new Date(+now + 10 * 6e4)) continue;
  const [h, a] = (f.event_name || '').split('·'); if (!h || !a || (/\b(u1[7-9]|u2[0-3]|feminin|women)\b/i.test(f.event_name) || /\((f|r)\)/i.test(f.event_name))) continue;
  if (EVITA.test(f.event_name)) continue; // echipe de evitat (cerere utilizator 07.11): nu intră în tabel
  list.push({ id: e.event_id, h: h.trim(), a: a.trim(), when, zi, liga: LEAGUES[li][0] });
}
console.log('evenimente', (ev.events || []).length, 'meciuri', list.length);

// ---- formă ----
const sc = e => { const s = e.scores || []; const x = s.find(z => z.type === 6) || s.find(z => z.type === 0); return x ? [x.team1 || 0, x.team2 || 0] : null; };
const last = (evs, id, n) => (evs || []).filter(e => e.match_state === 2 && sc(e)).sort((a, b) => b.match_date.seconds - a.match_date.seconds).slice(0, n).map(e => { const [x, y] = sc(e); const home = e.team1.id === id; return { gf: home ? x : y, ga: home ? y : x }; });
const share = (L, f) => L.length ? L.filter(f).length / L.length : null;
const avg = (...v) => { const w = v.filter(x => x != null); return w.length ? w.reduce((s, x) => s + x, 0) / w.length : null; };

// ---- piețe ----
const price = (mk, name, o) => { const m = (mk || []).find(x => x.name === name); const x = m && (m.odds || []).find(y => y.name === o); return x && x.price ? x.price : null; };
const fairPair = (a, b) => b ? (1 / a) / ((1 / a) + (1 / b)) : (1 / a) / 1.06;

const res = await pool(list, 5, async m => {
  const [st, bb] = await Promise.all([getJ(SA + m.id), getJ(BB + m.id)]);
  const t1 = st.team1 && st.team1.id, t2 = st.team2 && st.team2.id; if (!t1 || !t2) return null;
  const hh = await getJ(SAH + 'team1-id=' + t1 + '&team2-id=' + t2);
  const H = last(hh.team1_events, t1, 10), A = last(hh.team2_events, t2, 10); if (H.length < 6 || A.length < 6) return null;
  const mk = bb.markets || []; if (!mk.length) return null;
  const hth = (hh.h2h_events || []).filter(e => e.match_state === 2 && sc(e)).sort((a, b) => b.match_date.seconds - a.match_date.seconds).slice(0, 5).map(e => { const [x, y] = sc(e); return e.team1.id === t1 ? { gf: x, ga: y } : { gf: y, ga: x }; });
  const hs = (f) => hth.length >= 3 ? share(hth, f) : null; // H2H doar cu >= 3 întâlniri
  const form = { h: H.length, a: A.length, gfH: H.reduce((s, x) => s + x.gf, 0) / H.length, gaH: H.reduce((s, x) => s + x.ga, 0) / H.length, gfA: A.reduce((s, x) => s + x.gf, 0) / A.length, gaA: A.reduce((s, x) => s + x.ga, 0) / A.length, h2h: hth.length };
  const fin = ['1', 'X', '2'].map(o => price(mk, 'Final', o)); const fs_ = fin.every(Boolean) ? fin.reduce((s, x) => s + 1 / x, 0) : null;
  const pf = fs_ ? fin.map(x => (1 / x) / fs_) : null; // probabilități piață 1X2
  const out = [];
  const base = { id: m.id, meci: m.h + ' – ' + m.a, when: m.when.toISOString(), zi: m.zi, liga: m.liga };
  // p = 0,4 piață + 0,4 formă + 0,2 H2H (fără H2H: 0,5/0,5), plafon 0,85
  const mix = (pm, pfm, ph) => Math.min(0.85, ph == null ? 0.5 * pm + 0.5 * pfm : 0.4 * pm + 0.4 * pfm + 0.2 * ph);
  const push = (o) => { if (o.od >= 1.20 && o.od <= 2.6 && o.pm != null && o.pform != null) out.push({ ...base, ...o, pm: r3(o.pm), pform: r3(o.pform), ph: o.ph == null ? null : r3(o.ph), p: r3(o.p) }); };
  // total goluri
  for (const L of ['1.5', '2.5']) { const od = price(mk, 'Total goluri', 'Peste ' + L); if (!od) continue; const n = Math.floor(+L) + 1;
    const pm = fairPair(od, price(mk, 'Total goluri', 'Sub ' + L)); const pfm = avg(share(H, x => x.gf + x.ga >= n), share(A, x => x.gf + x.ga >= n)); const ph = hs(x => x.gf + x.ga >= n);
    push({ mk: 'Total goluri', ou: 'Peste ' + L, sel: 'Peste ' + L, kind: 'tot', od, pm, pform: pfm, ph, p: mix(pm, pfm, ph) }); }
  { const od = price(mk, 'Ambele echipe marchează (GG)', 'Da'); if (od) { const pm = fairPair(od, price(mk, 'Ambele echipe marchează (GG)', 'Nu')); const pfm = avg(share(H, x => x.gf >= 1 && x.ga >= 1), share(A, x => x.gf >= 1 && x.ga >= 1)); const ph = hs(x => x.gf >= 1 && x.ga >= 1);
    push({ mk: 'Ambele echipe marchează (GG)', ou: 'Da', sel: 'GG', kind: 'gg', od, pm, pform: pfm, ph, p: mix(pm, pfm, ph) }); } }
  // cornere (media din feed + piața „Total cornere”); doar „Peste”
  { const S = {}; (st.prematch_stats || []).forEach(x => { try { S[x.text.args[0].split('.').pop()] = [parseFloat(x.team1), parseFloat(x.team2)]; } catch (e) {} });
    const k = S.average_corners; const cm = mk.find(x => x.name === 'Total cornere');
    if (k && isFinite(k[0]) && isFinite(k[1]) && cm) { const lam = k[0] + k[1];
      const pois = (l, L) => { let c = 0, t = Math.exp(-l); for (let i = 0; i <= Math.floor(L); i++) { c += t; t *= l / (i + 1); } return 1 - c; };
      let bestC = null;
      for (const x of cm.odds || []) { const r = /^Peste (\d+\.5)$/.exec(x.name); if (!r || !x.price) continue; const L = +r[1]; const un = (cm.odds || []).find(y => y.name === 'Sub ' + r[1]);
        const pm = fairPair(x.price, un && un.price), pfm = pois(lam, L);
        const c = { mk: 'Total cornere', ou: 'Peste ' + r[1], sel: 'Peste ' + r[1] + ' cornere', kind: 'cor', od: x.price, pm, pform: pfm, ph: null, p: Math.min(0.85, 0.5 * pm + 0.5 * pfm), cm: Math.round(lam * 10) / 10 };
        if (x.price >= 1.35 && x.price <= 2.6 && pfm >= pm - 0.03 && pfm <= pm + 0.15 && (!bestC || c.p > bestC.p)) bestC = c; }
      if (bestC) push(bestC); } }
  // goluri pe echipă
  for (const [side, name, me, opp, gfIdx] of [['home', m.h, H, A, 'h'], ['away', m.a, A, H, 'a']]) {
    for (const L of ['0.5', '1.5']) { const mn = 'Total goluri ' + name; const od = price(mk, mn, 'Peste ' + L); if (!od) continue; const n = Math.floor(+L) + 1;
      const pm = fairPair(od, price(mk, mn, 'Sub ' + L)); const pfm = avg(share(me, x => x.gf >= n), share(opp, x => x.ga >= n));
      const ph = hth.length >= 3 ? share(hth, x => (side === 'home' ? x.gf : x.ga) >= n) : null;
      let p = mix(pm, pfm, ph), ok = true, tag = '';
      if (side === 'away' && pf && pf[0] >= 0.55) { // REGULA OUTSIDER: deplasare slabă contra favoritei
        tag = 'outsider'; p = Math.min(0.72, ph == null ? 0.6 * pm + 0.4 * pfm : 0.5 * pm + 0.3 * pfm + 0.2 * ph); if (pm < 0.62) ok = false; }
      if (ok) push({ mk: mn, ou: 'Peste ' + L, sel: name + ' peste ' + L + ' goluri', kind: 'tg', od, pm, pform: pfm, ph, p, tag }); } }
  // rezultat final și șansă dublă
  if (pf) {
    const dH = price(mk, 'Final', '1'), dA = price(mk, 'Final', '2');
    push({ mk: 'Final', ou: '1', sel: m.h + ' câștigă', kind: '1x2', od: dH, pm: pf[0], pform: avg(share(H, x => x.gf > x.ga), share(A, x => x.gf < x.ga)), ph: hth.length >= 3 ? share(hth, x => x.gf > x.ga) : null, p: 0 });
    push({ mk: 'Final', ou: '2', sel: m.a + ' câștigă', kind: '1x2', od: dA, pm: pf[2], pform: avg(share(A, x => x.gf > x.ga), share(H, x => x.gf < x.ga)), ph: hth.length >= 3 ? share(hth, x => x.gf < x.ga) : null, p: 0 });
    const x1 = price(mk, 'Șansă dublă', '1X'), x2 = price(mk, 'Șansă dublă', 'X2');
    if (x1) push({ mk: 'Șansă dublă', ou: '1X', sel: '1X', kind: 'dc', od: x1, pm: pf[0] + pf[1], pform: avg(share(H, x => x.gf >= x.ga), share(A, x => x.gf <= x.ga)), ph: hth.length >= 3 ? share(hth, x => x.gf >= x.ga) : null, p: 0 });
    if (x2) push({ mk: 'Șansă dublă', ou: 'X2', sel: 'X2', kind: 'dc', od: x2, pm: pf[1] + pf[2], pform: avg(share(A, x => x.gf >= x.ga), share(H, x => x.gf <= x.ga)), ph: hth.length >= 3 ? share(hth, x => x.gf <= x.ga) : null, p: 0 });
    for (const o of out) if (o.kind === '1x2' || o.kind === 'dc') o.p = r3(mix(o.pm, o.pform, o.ph));
  }
  return { out, info: { id: m.id, meci: m.h + ' – ' + m.a, zi: m.zi, liga: m.liga, form } };
});
const picks = res.filter(Boolean).flatMap(r => r.out);
const infos = res.filter(Boolean).map(r => r.info);
if (!picks.length) { console.log('niciun candidat (feed indisponibil?)'); process.exit(list.length ? 1 : 0); }
picks.forEach((p, i) => { p.k = 'c' + i; });
console.log('candidati', picks.length, 'din', infos.length, 'meciuri');

// ---- optimizare ----
// praguri minime pe tip de pariu (decizie 09.11, după analiza pe 210 pronosticuri): Peste 2.5 ≥0,65; GG ≥0,70; șansă dublă ≥0,65
const minPFor = (p, minP) => p.kind === 'gg' ? Math.max(minP, 0.70) : (p.kind === 'dc' || (p.kind === 'tot' && /2\.5/.test(p.sel))) ? Math.max(minP, 0.65) : minP;
const eligible = (p, minP) => p.p >= minPFor(p, minP) && p.pform >= p.pm - 0.03 && p.pform <= p.pm + 0.15 && !(p.kind === 'tot' && /3\.5/.test(p.sel));
// (nu mai există selecții rezervate: același pronostic poate apărea pe maximum 2 bilete)
const S = {
  cota2: { n: [2, 4], cota: [1.85, 2.30], minP: 0.62, odds: [1.20, 1.50], comb: 0.50, tg: 1 },
  cota5: { n: [3, 4], cota: [4.5, 6.0], minP: 0.60, odds: [1.35, 2.1], comb: 0.18, tg: 2 },
  cota10: { n: [4, 6], cota: [9.0, 12.0], minP: 0.60, odds: [1.35, 2.1], comb: 0.08, tg: 2 },
};
function search(pool_, spec, usage, top = 3) {
  const P = pool_.filter(p => eligible(p, spec.minP) && p.od >= spec.odds[0] && p.od <= spec.odds[1]);
  // cel mult 2 selecții pe meci (cele mai bune), cel mult 36 în total
  const byM = new Map(); for (const p of P.sort((a, b) => b.p - a.p)) { const l = byM.get(p.id) || []; if (l.length < 2) { l.push(p); byM.set(p.id, l); } }
  const L = [...byM.values()].flat().sort((a, b) => b.p - a.p).slice(0, 36);
  const sols = []; const cur = [];
  const rec = (i, prod, pp, used, tg) => {
    if (cur.length >= spec.n[0] && prod >= spec.cota[0] && prod <= spec.cota[1] && pp >= spec.comb) sols.push({ legs: cur.map(x => x.k), cota: Math.round(prod * 100) / 100, p: pp, m: cur.map(x => x.id) });
    if (cur.length >= spec.n[1] || prod > spec.cota[1]) return;
    for (let j = i; j < L.length; j++) { const x = L[j]; if (used.has(x.id)) continue; if (x.kind === 'tg' && tg >= spec.tg) continue;
      if ((usage.pick[x.k] || 0) >= 2 || (usage.match[x.id] || 0) >= 4) continue;
      cur.push(x); used.add(x.id); rec(j + 1, prod * x.od, pp * x.p, used, tg + (x.kind === 'tg' ? 1 : 0)); cur.pop(); used.delete(x.id); }
  };
  rec(0, 1, 1, new Set(), 0);
  const PREF = new Map(); for (const x of pool_) PREF.set(x.k, (x.kind === 'tg' || x.kind === '1x2' ? 1.04 : 1) * (x.od >= 1.45 && x.od <= 1.65 ? 1.03 : 1));   // preferință ușoară: goluri pe echipă / 1X2 și cote 1,45–1,65
  const sc_ = s => s.p * s.legs.reduce((a, k) => a * (PREF.get(k) || 1), 1) * Math.pow(0.6, s.m.filter(id => usage.match[id]).length) * Math.pow(0.7, s.legs.filter(k => usage.pick[k]).length);
  sols.sort((a, b) => sc_(b) - sc_(a));
  // variante cât mai diferite: maximum 1 meci comun cu o variantă deja aleasă
  const chosen = []; for (const s of sols) { if (chosen.every(c => c.m.filter(id => s.m.includes(id)).length <= 1)) chosen.push(s); if (chosen.length >= top) break; }
  if (chosen.length < top) for (const s of sols) { if (!chosen.includes(s)) chosen.push(s); if (chosen.length >= top) break; }
  return chosen.map(s => ({ ...s, p: r3(s.p) }));
}
const todayP = picks.filter(p => p.zi === key);
const usage = { pick: {}, match: {} }; const use = s => { for (const k of s.legs) { usage.pick[k] = (usage.pick[k] || 0) + 1; } for (const id of new Set(s.m)) usage.match[id] = (usage.match[id] || 0) + 1; };
const propuneri = {}, plan = {};
const single = (spec, excl) => { const L = todayP.filter(p => eligible(p, spec.minP) && p.od >= spec.odds[0] && p.od <= spec.odds[1] && !excl.k.has(p.k) && !excl.m.has(p.id) && (usage.pick[p.k] || 0) < 2 && (usage.match[p.id] || 0) < 4)
  .sort((a, b) => spec.edge ? ((b.p - 1 / b.od) - (a.p - 1 / a.od)) : (b.p - a.p)); const seen = new Set(), o = [];
  for (const p of L) { if (spec.edge && p.p - 1 / p.od < spec.edge) continue; if (seen.has(p.id)) continue; seen.add(p.id); o.push({ legs: [p.k], cota: p.od, p: p.p, m: [p.id], edge: r3(p.p - 1 / p.od) }); if (o.length >= 4) break; } return o; };
// ordine: Cotă 2, Pariul zilei, Challenge, Cotă 5, Cotă 10 (cele mai importante primele); fiecare ia în calcul meciurile deja folosite
// prioritate: Challenge > Cotă 2 > Pariul zilei > Cotă 5 > Cotă 10. Același pronostic pe maximum 2 dintre aceste bilete (usage.pick < 2).
// Biletele mari (restul) pot relua pronosticuri din cele anterioare, fără această limită.
const ex = { k: new Set(), m: new Set() };
propuneri.challenge = single({ minP: 0.65, odds: [1.35, 1.50] }, ex); if (propuneri.challenge[0]) { plan.challenge = propuneri.challenge[0]; use(plan.challenge); }
propuneri.cota2 = search(todayP, S.cota2, usage); if (propuneri.cota2[0]) { plan.cota2 = propuneri.cota2[0]; use(plan.cota2); }
propuneri.pariu = single({ minP: 0.55, odds: [1.40, 2.6], edge: 0.05 }, ex); if (propuneri.pariu[0]) { plan.pariu = propuneri.pariu[0]; use(plan.pariu); }
propuneri.cota5 = search(todayP, S.cota5, usage); if (propuneri.cota5[0]) { plan.cota5 = propuneri.cota5[0]; use(plan.cota5); }
propuneri.cota10 = search(todayP, S.cota10, usage); if (propuneri.cota10[0]) { plan.cota10 = propuneri.cota10[0]; use(plan.cota10); }
// runda de Champions League (azi + mâine): Cotă 10 CL și CL mare
const cl = picks.filter(p => p.liga === 'Liga Campionilor');
const clM = new Set(cl.map(p => p.id)).size;
if (clM >= 4) {
  const u2 = { pick: {}, match: {} };
  propuneri.cl10 = search(cl, { n: [5, 7], cota: [9, 12], minP: 0.62, odds: [1.35, 2.1], comb: 0.08, tg: 2 }, u2);
  propuneri.clmare = search(cl, { n: [8, 12], cota: [25, 50], minP: 0.60, odds: [1.35, 2.1], comb: 0.02, tg: 2 }, u2, 2);
}
const total = Object.values(plan).length;
fs.mkdirSync('candidati', { recursive: true });
fs.writeFileSync(file, JSON.stringify({ data: key, salvat: now.toISOString(), meciuri: infos.length, nota: 'p = 0,4 piață + 0,4 formă(ultimele 10, toate competițiile) + 0,2 H2H; pm = piață fără marjă; pform = doar formă. plan = variantă fără meciuri repetate pe cât posibil; propuneri = variante alternative. Fiecare selecție are mk/ou pentru cod.', plan, propuneri, info: infos, picks: picks.sort((a, b) => b.p - a.p) }) + '\n');
console.log('scris', file, 'plan', Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.cota + ' / ' + v.p])), 'variante', Object.fromEntries(Object.entries(propuneri).map(([k, v]) => [k, v.length])), total);
