// Salvează lista zilei din tabul „Sugestii” (5 meciuri pentru goluri, GG, cornere, cartonașe)
// în sugestii/<YYYY-MM-DD>.json, ca site-ul să arate a doua zi dacă au intrat.
// Aceeași logică ca buildSug() din app.js. Rulat de .github/workflows/sugestii.yml.
import fs from 'node:fs';

const OB = 'https://production-superbet-offer-ro.freetls.fastly.net';
const SA = 'https://scorealarm-stats.freetls.fastly.net/v2/soccer/fixtures/overview/rosuperbetsport/ro-RO?fixture-id=ax%3Amatch%3A';
const BB = 'https://production-superbet-bmb.freetls.fastly.net/betbuilder/v3/getBetbuilderMarketsForMatch?lang=ro-RO&target=SB_RO&match_id=';
const SUG_MIN = 1.35, SUG_MAX = 2.6;
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
const nrm = x => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dayKey = d => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest' }).format(d);
const f1 = v => String(Math.round(v * 10) / 10).replace('.', ',');
const pois = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
const poisOverL = (l, line) => { let c = 0; for (let k = 0; k <= Math.floor(line); k++) c += pois(l, k); return Math.max(0, 1 - c); };
const getJ = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } }); if (r.ok) return await r.json(); console.log('HTTP', r.status, u.slice(0, 90)); } catch (e) { console.log('ERR', String(e).slice(0, 120), u.slice(0, 90)); } await new Promise(r => setTimeout(r, 1500)); } return {}; };
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } } })); return out; }
function lines(mk, name) { const m = (mk || []).find(x => x.name === name); const o = {}; if (m) for (const x of m.odds || []) { const r = /^Peste (\d+\.5)$/.exec(x.name); if (r && x.price) o[r[1]] = x.price; } return o; }
function bestLine(lam, odds) { let b = null; for (const [L, od] of Object.entries(odds)) { if (od < SUG_MIN || od > SUG_MAX) continue; const pm = poisOverL(lam, +L); const p = Math.min(0.88, 0.5 * pm + 0.5 * (1 / od) / 1.06); if (!b || p > b.p) b = { line: L, od, p }; } return b; }

const force = process.argv.includes('--force');
const now = new Date(), key = dayKey(now), file = `sugestii/${key}.json`;
if (fs.existsSync(file) && !force) { console.log('exista deja', file); process.exit(0); }

const T = new Map(); LEAGUES.forEach(([, , ids], i) => ids.forEach(id => T.set(String(id), i)));
const st0 = await getJ(OB + '/v2/ro-RO/struct');
for (const t of ((st0.data || st0).tournaments || [])) { const n = nrm(t.localNames && (t.localNames['ro-RO'] || Object.values(t.localNames)[0])).replace(/\s+/g, ' ').trim(); const i = LEAGUES.findIndex(L => L[1].test(n)); if (i >= 0) T.set(String(t.id), i); }
const h0 = Math.floor(now / 36e5) * 36e5; // feedul cere ore întregi (fără milisecunde)
const ev = await getJ(OB + '/v3/ro-RO/events?index=active-prematch&startDate=' + new Date(h0 - 3 * 36e5).toISOString() + '&endDate=' + new Date(h0 + 30 * 36e5).toISOString());
const list = [];
for (const e of (ev.events || [])) {
  const f = e.fixture || {}; if (f.sport_id !== 5) continue;
  const li = T.get(String(f.tournament_id)); if (li == null) continue;
  const when = new Date(f.utc_date || f.unix_date_millis); if (dayKey(when) !== key || when < new Date(+now + 10 * 6e4)) continue;
  const [h, a] = (f.event_name || '').split('·'); if (!h || !a || /\b(u1[7-9]|u2[0-3]|feminin|women)\b/i.test(f.event_name)) continue;
  list.push({ id: e.event_id, meci: h.trim() + ' – ' + a.trim(), h: h.trim(), a: a.trim(), when, liga: LEAGUES[li][0] });
}
console.log('evenimente', (ev.events || []).length, 'meciuri azi', list.length);
let extra = []; try { const j = JSON.parse(fs.readFileSync('meciuri.json', 'utf8')); extra = j.meciuri || []; } catch (e) {}

const res = await pool(list, 6, async m => {
  const [st, bb] = await Promise.all([getJ(SA + m.id), getJ(BB + m.id)]);
  const S = {}; (st.prematch_stats || []).forEach(x => { S[x.text.args[0].split('.').pop()] = [parseFloat(x.team1), parseFloat(x.team2)]; });
  const g = S.goals_scored_per_game, c = S.goals_conceded_per_game, x = S.average_xg || g; if (!g || !c) return null;
  const mk = bb.markets || []; const out = [];
  const lh = Math.max(0.2, 0.5 * (g[0] + c[1]) / 2 + 0.5 * (x[0] + c[1]) / 2 + 0.1), la = Math.max(0.2, 0.5 * (g[1] + c[0]) / 2 + 0.5 * (x[1] + c[0]) / 2 - 0.05);
  const base = { id: m.id, meci: m.meci, when: m.when.toISOString(), liga: m.liga };
  const go = bestLine(lh + la, lines(mk, 'Total goluri'));
  if (go) out.push({ ...base, cat: 'goluri', sel: 'Peste ' + go.line + ' goluri', od: go.od, p: go.p, why: m.h + ' dă ' + f1(g[0]) + ' și primește ' + f1(c[0]) + ' goluri pe meci; ' + m.a + ' dă ' + f1(g[1]) + ' și primește ' + f1(c[1]) + '.' });
  const ggm = mk.find(y => y.name === 'Ambele echipe marchează (GG)'); const ggo = ggm && (ggm.odds || []).find(y => y.name === 'Da');
  if (ggo && ggo.price >= SUG_MIN && ggo.price <= SUG_MAX) { const pm = (1 - Math.exp(-lh)) * (1 - Math.exp(-la)); const p = Math.min(0.88, 0.5 * pm + 0.5 * (1 / ggo.price) / 1.06);
    out.push({ ...base, cat: 'gg', sel: 'GG (ambele marchează)', od: ggo.price, p, why: m.h + ' marchează ' + f1(g[0]) + ' și primește ' + f1(c[0]) + ' pe meci; ' + m.a + ' marchează ' + f1(g[1]) + ' și primește ' + f1(c[1]) + '.' }); }
  const k = S.average_corners; if (k) { const co = bestLine(k[0] + k[1], lines(mk, 'Total cornere'));
    if (co) out.push({ ...base, cat: 'cornere', sel: 'Peste ' + co.line + ' cornere', od: co.od, p: co.p, why: 'Media cornerelor: ' + m.h + ' ' + f1(k[0]) + ', ' + m.a + ' ' + f1(k[1]) + ', adică ' + f1(k[0] + k[1]) + ' pe meci.' }); }
  const y = S.average_cards || S.average_yellow_cards; if (y) {
    const inf = extra.find(r => r.id && String(r.id) === String(m.id)); const ref = inf && inf.arbitru_galbene != null ? inf.arbitru_galbene + (inf.arbitru_rosii || 0) : null;
    const lam = ref != null ? 0.5 * (y[0] + y[1]) + 0.5 * ref : y[0] + y[1];
    const ca = bestLine(lam, lines(mk, 'Total cartonașe'));
    if (ca) out.push({ ...base, cat: 'cartonase', sel: 'Peste ' + ca.line + ' cartonașe', od: ca.od, p: ca.p, why: 'Cartonașe pe meci: ' + m.h + ' ' + f1(y[0]) + ', ' + m.a + ' ' + f1(y[1]) + (ref != null ? '; arbitrul ' + (inf.arbitru || '') + ' dă ' + f1(ref) + ' pe meci.' : '.') }); }
  return out;
});
const all = res.filter(Boolean).flat();
if (!all.length) { console.log('nicio sugestie (feed indisponibil?)'); process.exit(list.length ? 1 : 0); }
const data = {};
for (const c of ['goluri', 'gg', 'cornere', 'cartonase']) data[c] = all.filter(z => z.cat === c).sort((a, b) => b.p - a.p).slice(0, 5).map(({ cat, ...z }) => ({ ...z, p: Math.round(z.p * 1000) / 1000 }));
fs.mkdirSync('sugestii', { recursive: true });
fs.writeFileSync(file, JSON.stringify({ data: key, salvat: now.toISOString(), n: list.length, sugestii: data }, null, 1) + '\n');
console.log('scris', file, Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])));
