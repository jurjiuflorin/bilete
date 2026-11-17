// Modulul de date al generatorului: meciuri de azi/mâine din top 20 ligi europene + cupe europene (cote Superbet, ultimele 5 meciuri Scorealarm).
// Scrie generator/azi.json (meciuri analizate), generator/arhiva.json (meciuri văzute) și generator/scoruri.json (scoruri finale, pentru decontarea biletelor salvate).
// Sursa e înlocuibilă: DataProvider = { fixtures(from,to), form(match), odds(match), result(id) }. Implementarea de mai jos folosește Superbet + Scorealarm.
import fs from 'node:fs';
import { analyzeMatch, lastFinished, scoresOf, DEFAULT_TYPES, CORNER_LINES, cornerType } from './generator-lib.mjs';

const OB = 'https://production-superbet-offer-ro.freetls.fastly.net';
const SA = 'https://scorealarm-stats.freetls.fastly.net/v2/soccer/fixtures/overview/rosuperbetsport/ro-RO?fixture-id=ax%3Amatch%3A';
const SAH = 'https://scorealarm-stats.freetls.fastly.net/v2/soccer/fixtures/h2h/rosuperbetsport/ro-RO?';
const BB = 'https://production-superbet-bmb.freetls.fastly.net/betbuilder/v3/getBetbuilderMarketsForMatch?lang=ro-RO&target=SB_RO&match_id=';

// top 20 ligi europene (prima divizie) + cupele europene
const LEAGUES = [
  ['Liga Campionilor', /^(uefa - |uefa )?(liga campionilor|champions league)( - .*)?$/],
  ['Europa League', /^(uefa - |uefa )?(europa league|liga europa)( - .*)?$/],
  ['Conference League', /^(uefa - |uefa )?(europa )?(conference league|liga conferintelor)( - .*)?$/],
  ['Premier League', /^anglia - premier league$/],
  ['LaLiga', /^spania - (laliga|la liga|primera division|liga 1)$/],
  ['Serie A', /^italia - seri[ae] a$/],
  ['Bundesliga', /^germania - (bundesliga|bundesliga 1|1\. bundesliga)$/],
  ['Ligue 1', /^franta - ligue 1$/],
  ['Eredivisie', /^olanda - eredivisie$/],
  ['Liga Portugal', /^portugalia - (liga portugal|primeira liga|liga 1|liga betclic|superliga)$/],
  ['Pro League', /^belgia - (pro league|jupiler pro league|first division a)$/],
  ['Süper Lig', /^turcia - super ?lig$/],
  ['Premiership (Scoția)', /^scotia - premiership$/],
  ['Bundesliga (Austria)', /^austria - bundesliga$/],
  ['Super League (Elveția)', /^elvetia - super league$/],
  ['Super League (Grecia)', /^grecia - super ?league( 1)?$/],
  ['Chance Liga (Cehia)', /^cehia - (chance liga|fortuna liga|liga 1|first league|synot liga)$/],
  ['Superliga (Danemarca)', /^danemarca - superliga(en)?$/],
  ['Eliteserien', /^norvegia - eliteserien$/],
  ['Allsvenskan', /^suedia - allsvenskan$/],
  ['Ekstraklasa', /^polonia - (ekstraklasa|pko bp ekstraklasa)$/],
  ['HNL (Croația)', /^croatia - (hnl|supersport hnl|1\. hnl|prva hnl)$/],
  ['SuperLiga (România)', /^romania - (liga 1|superliga)$/],
];
const EVITA = /tottenham|spurs|man(chester|\.)?\s*(united|utd)/i;
const nrm = x => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dayKey = d => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest' }).format(d);
const getJ = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } }); if (r.ok) return await r.json(); console.log('HTTP', r.status, u.slice(0, 90)); } catch (e) { console.log('ERR', String(e).slice(0, 80)); } await new Promise(r => setTimeout(r, 800 * (i + 1))); } return {}; };
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { console.log('E', String(e).slice(0, 100)); } } })); return out; }
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

fs.mkdirSync('generator', { recursive: true });
const now = new Date(), key = dayKey(now);

// ---- 1. meciuri (DataProvider.fixtures) ----
const T = new Map(); const unmatched = new Set();
const st0 = await getJ(OB + '/v2/ro-RO/struct');
for (const t of ((st0.data || st0).tournaments || [])) {
  const n = nrm(t.localNames && (t.localNames['ro-RO'] || Object.values(t.localNames)[0])).replace(/\s+/g, ' ').trim();
  const i = LEAGUES.findIndex(L => L[1].test(n)); if (i >= 0) T.set(String(t.id), i); else if (/^(cehia|grecia|polonia|croatia|elvetia|scotia|austria) - /.test(n)) unmatched.add(n);
}
console.log('turnee potrivite', T.size, 'nepotrivite (verifică numele):', [...unmatched].slice(0, 20).join(' | '));
const ZILE = Math.max(2, Math.min(7, +process.env.GEN_ZILE || 7)); // implicit azi + mâine; poate fi mărit manual (cel mult 7)
const h0 = Math.floor(now / 36e5) * 36e5;
const ev = await getJ(OB + '/v3/ro-RO/events?index=active-prematch&startDate=' + new Date(h0 - 3 * 36e5).toISOString().replace(/\.\d+Z/, '.000Z') + '&endDate=' + new Date(h0 + (ZILE * 24 + 6) * 36e5).toISOString().replace(/\.\d+Z/, '.000Z'));
const days = new Set(Array.from({ length: ZILE }, (_, i) => dayKey(new Date(+now + i * 24 * 36e5)))); const list = [];
for (const e of (ev.events || [])) {
  const f = e.fixture || {}; if (f.sport_id !== 5) continue;
  const li = T.get(String(f.tournament_id)); if (li == null) continue;
  const when = new Date(f.utc_date || f.unix_date_millis); const zi = dayKey(when); if (!days.has(zi) || when < new Date(+now + 10 * 6e4)) continue;
  const [h, a] = (f.event_name || '').split('·'); if (!h || !a || /\b(u1[7-9]|u2[0-3]|feminin|women)\b/i.test(f.event_name) || /\((f|r)\)/i.test(f.event_name) || EVITA.test(f.event_name)) continue;
  list.push({ id: e.event_id, home: h.trim(), away: a.trim(), when, league: LEAGUES[li][0] });
}
console.log('evenimente', (ev.events || []).length, 'meciuri în ligile alese', list.length);

// ---- 2. statistici + cote (DataProvider.form / odds) ----
const price = (mk, name, o) => { const m = (mk || []).find(x => x.name === name); const x = m && (m.odds || []).find(y => y.name === o); return x && x.price ? x.price : null; };
const res = await pool(list, 5, async m => {
  const [st, bb] = await Promise.all([getJ(SA + m.id), getJ(BB + m.id)]);
  const t1 = st.team1 && st.team1.id, t2 = st.team2 && st.team2.id; if (!t1 || !t2) return null;
  const mk = bb.markets || []; if (!mk.length) return null;
  const hh = await getJ(SAH + 'team1-id=' + t1 + '&team2-id=' + t2);
  const homeLast = lastFinished(hh.team1_events, t1, 5), awayLast = lastFinished(hh.team2_events, t2, 5);
  const odds = {
    first_half_over_0_5: price(mk, 'Prima repriză - Total goluri', 'Peste 0.5'), first_half_over_1_5: price(mk, 'Prima repriză - Total goluri', 'Peste 1.5'),
    over_1_5_ft: price(mk, 'Total goluri', 'Peste 1.5'), over_2_5_ft: price(mk, 'Total goluri', 'Peste 2.5'), btts_yes: price(mk, 'Ambele echipe marchează (GG)', 'Da'),
    under_2_5_ft: price(mk, 'Total goluri', 'Sub 2.5'), under_3_5_ft: price(mk, 'Total goluri', 'Sub 3.5'), btts_no: price(mk, 'Ambele echipe marchează (GG)', 'Nu'),
  };
  const S = {}; (st.prematch_stats || []).forEach(x => { try { S[x.text.args[0].split('.').pop()] = [parseFloat(x.team1), parseFloat(x.team2)]; } catch (e) {} });
  const k = S.average_corners; let corners = null;
  if (k && isFinite(k[0]) && isFinite(k[1])) { const co = {}; for (const L of CORNER_LINES) co[cornerType(L)] = price(mk, 'Total cornere', 'Peste ' + L); corners = { lam: k[0] + k[1], odds: co }; }
  const a = analyzeMatch({ matchId: m.id, kickoff: m.when.toISOString(), league: m.league, home: m.home, away: m.away, homeLast, awayLast, odds, corners }, { types: [...Object.keys(odds), ...CORNER_LINES.map(cornerType)] });
  if (!a) return null;
  const lite = L => L.map(x => ({ opp: x.opp, home: x.home, ft: x.ft, ht: x.ht }));
  return { ...a, last5: { home: lite(homeLast), away: lite(awayLast) } };
});
const matches = res.filter(Boolean).filter(m => m.markets.some(x => x.sampleSize ? Math.min(x.hitHome, x.hitAway) >= 3 : x.percentage >= 60)).sort((a, b) => (b.signals - a.signals) || (new Date(a.kickoff) - new Date(b.kickoff)));
fs.writeFileSync('generator/azi.json', JSON.stringify({ generatedAt: now.toISOString(), day: key, analyzed: res.filter(Boolean).length, defaultTypes: DEFAULT_TYPES, matches }) + '\n');
console.log('analizate', res.filter(Boolean).length, 'păstrate (≥3/5 la o piață)', matches.length, 'vulnerabile', matches.filter(m => m.vulnerable).length);

// ---- 3. arhivă + scoruri finale pentru decontare (DataProvider.result) ----
const arh = readJ('generator/arhiva.json', {}), sc = readJ('generator/scoruri.json', {});
for (const m of res.filter(Boolean)) arh[m.matchId] = { league: m.league, home: m.home, away: m.away, kickoff: m.kickoff };
const old = Date.now() - 10 * 864e5;
for (const id of Object.keys(arh)) if (new Date(arh[id].kickoff) < old) { delete arh[id]; delete sc[id]; }
const todo = Object.keys(arh).filter(id => !sc[id] && new Date(arh[id].kickoff).getTime() + 135 * 6e4 < Date.now());
await pool(todo, 5, async id => { const o = await getJ(SA + id); if (o.match_state !== 2) return; const s = scoresOf(o); if (s) sc[id] = { ft: s.ft, ht: s.ht }; });
fs.writeFileSync('generator/arhiva.json', JSON.stringify(arh) + '\n'); fs.writeFileSync('generator/scoruri.json', JSON.stringify(sc) + '\n');
console.log('arhivă', Object.keys(arh).length, 'scoruri', Object.keys(sc).length);
