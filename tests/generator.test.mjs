import test from 'node:test';
import assert from 'node:assert/strict';
import { pickChallenge, MARKETS, scoresOf, lastFinished, analyzeMatch, generateTicket, swapSelection, MODES, judgeSelection, judgeTicket, pois, cornerType } from '../scripts/generator-lib.mjs';

const ev = (t1, t2, ft, ht, sec, id = 'a') => ({ match_state: 2, match_date: { seconds: sec }, team1: { id: t1, name: 'T' + t1 }, team2: { id: t2, name: 'T' + t2 },
  scores: [{ type: 0, team1: ft[0], team2: ft[1] }, { type: 1, team1: ht[0], team2: ht[1] }, { type: 6, team1: ft[0], team2: ft[1] }] });
const M = (ft, ht) => ({ ft, ht });
const mk = (id, odds, signal = true, kickoff = '2099-01-01T12:00:00Z', type = 'over_2_5_ft') => ({ matchId: id, kickoff, league: 'L', home: 'H' + id, away: 'A' + id, vulnerable: true, signals: 2,
  markets: [{ type, odds, hitHome: 4, hitAway: 5, sampleSize: 5, percentage: 90, signal }] });
const rnd = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

test('piețe: gol 45+2 e la pauză (scor la pauză din feed), autogol contează în scor', () => {
  assert.equal(MARKETS.first_half_over_0_5.hit(M([1, 0], [1, 0])), true); // golul 45+2 vine în scorul la pauză
  assert.equal(MARKETS.first_half_over_0_5.hit(M([1, 0], [0, 0])), false);
  assert.equal(MARKETS.first_half_over_1_5.hit(M([2, 1], [1, 1])), true);
  assert.equal(MARKETS.over_2_5_ft.hit(M([2, 1], [0, 0])), true);
  assert.equal(MARKETS.over_2_5_ft.hit(M([1, 1], [0, 0])), false);
  assert.equal(MARKETS.btts_yes.hit(M([1, 1], [0, 0])), true);
  assert.equal(MARKETS.btts_yes.hit(M([2, 0], [1, 0])), false);
  // autogol: 1-0 în favoarea oaspeților înregistrat de feed ca scor 0-1, deci contează pentru total
  assert.equal(MARKETS.over_2_5_ft.hit(M([1, 2], [0, 1])), true);
});

test('scoresOf și lastFinished', () => {
  assert.deepEqual(scoresOf(ev(1, 2, [2, 1], [1, 1], 100)), { ft: [2, 1], ht: [1, 1] });
  assert.equal(scoresOf({ scores: [{ type: 0, team1: 1, team2: 0 }] }), null);
  const L = lastFinished([ev(1, 2, [1, 0], [0, 0], 100), ev(3, 1, [0, 2], [0, 1], 300), { ...ev(1, 4, [0, 0], [0, 0], 500), match_state: 1 }], 1, 5);
  assert.equal(L.length, 2); assert.equal(L[0].ts, 300); assert.equal(L[0].home, false);
});

test('analyzeMatch: regula both, vulnerabil >= 2 semnale, sub N meciuri nu intră', () => {
  const H = [M([2, 1], [1, 0]), M([3, 0], [1, 0]), M([1, 2], [1, 1]), M([2, 2], [0, 1]), M([3, 1], [2, 0])];
  const A = [M([2, 1], [1, 0]), M([1, 3], [1, 1]), M([2, 2], [1, 0]), M([0, 3], [0, 1]), M([2, 1], [1, 1])];
  const r = analyzeMatch({ matchId: 1, kickoff: 'x', league: 'L', home: 'A', away: 'B', homeLast: H, awayLast: A, odds: { over_2_5_ft: 1.5 } });
  const o25 = r.markets.find(m => m.type === 'over_2_5_ft');
  assert.equal(o25.hitHome, 5); assert.equal(o25.hitAway, 5); assert.equal(o25.signal, true); assert.equal(o25.odds, 1.5);
  const bt = r.markets.find(m => m.type === 'btts_yes'); assert.equal(bt.hitHome, 4); assert.equal(bt.hitAway, 4); assert.equal(bt.signal, true); // 4/5 = 80% la ambele
  assert.equal(r.markets.find(m => m.type === 'first_half_over_1_5').signal, false); assert.equal(r.signals >= 2, true); assert.equal(r.vulnerable, true);
  assert.equal(analyzeMatch({ homeLast: H.slice(0, 4), awayLast: A }), null);
  const t = analyzeMatch({ matchId: 1, homeLast: H, awayLast: A }, { rule: 'total', threshold: 0.7, minSignals: 1 });
  assert.equal(t.vulnerable, true);
});

test('cornere: semnal din Poisson', () => {
  assert.ok(Math.abs(pois(10, 8.5) - 0.667) < 0.02);
  const H = Array(5).fill(M([1, 0], [0, 0])), A = Array(5).fill(M([0, 1], [0, 0]));
  const r = analyzeMatch({ matchId: 1, homeLast: H, awayLast: A, corners: { lam: 12, odds: { [cornerType(8.5)]: 1.4 } } }, { threshold: 0.8 });
  const c = r.markets.find(m => m.type === 'corners_over_8_5'); assert.equal(c.signal, true); assert.equal(c.odds, 1.4);
});

test('5x iese în 4.60–5.40, cu random determinist', () => {
  const matches = Array.from({ length: 12 }, (_, i) => mk(i + 1, 1.3 + i * 0.05));
  const t = generateTicket({ matches, mode: '5x', random: rnd(7) });
  assert.ok(!t.error, JSON.stringify(t)); assert.ok(t.totalOdds >= 4.6 && t.totalOdds <= 5.4, 'cota ' + t.totalOdds);
  assert.ok(t.selections.length >= 2 && t.selections.length <= 5);
  const again = generateTicket({ matches, mode: '5x', random: rnd(7) }); assert.equal(again.signature, t.signature);
  const fresh = generateTicket({ matches, mode: '5x', random: rnd(7), recentSignatures: [t.signature] }); assert.notEqual(fresh.signature, t.signature);
});

test('10x în interval; meciurile începute sunt excluse; erori', () => {
  const matches = Array.from({ length: 14 }, (_, i) => mk(i + 1, 1.35 + (i % 5) * 0.1));
  const t = generateTicket({ matches, mode: '10x', random: rnd(3) }); assert.ok(t.totalOdds >= 9.25 && t.totalOdds <= 10.75);
  const started = [mk(1, 1.5, true, '2000-01-01T00:00:00Z'), mk(2, 1.5, true, '2000-01-01T00:00:00Z'), mk(3, 1.5)];
  assert.equal(generateTicket({ matches: started, mode: '5x', random: rnd(1) }).error, 'not_enough_matches');
  const few = [mk(1, 1.2), mk(2, 1.2)]; assert.equal(generateTicket({ matches: few, mode: '50x', random: rnd(1) }).error, 'target_odds_unreachable');
  assert.equal(generateTicket({ matches: few, mode: '5x', random: rnd(1) }).error, 'target_odds_unreachable'); // 1.44 < 4.60
  assert.equal(generateTicket({ matches: [mk(1, 1.3, false), mk(2, 1.3, false)], mode: '5x' }).error, 'not_enough_matches');
});

test('filtre: cotă min/max pe selecție, MAX_LEG_ODDS, cornere la 25x doar > 1.8', () => {
  const m = [mk(1, 1.2), mk(2, 1.6), mk(3, 3.4), mk(4, 1.5, true, undefined, 'corners_over_8_5'), mk(5, 1.9, true, undefined, 'corners_over_8_5')];
  const ids = mode => generateTicket({ matches: m, mode, filters: { minLineOdds: 1.4 }, random: rnd(2) });
  assert.equal(ids('5x').selections ? ids('5x').selections.every(s => s.odds >= 1.4 && s.odds <= 3) : ids('5x').partial.selections.every(s => s.odds >= 1.4 && s.odds <= 3), true);
  const t = generateTicket({ matches: m, mode: '25x', random: rnd(2) }); const sel = (t.selections || t.partial.selections);
  assert.ok(!sel.some(s => s.type === 'corners_over_8_5' && s.odds <= 1.8));
});

test('swapSelection înlocuiește cu alt meci', () => {
  const matches = Array.from({ length: 10 }, (_, i) => mk(i + 1, 1.35 + (i % 4) * 0.1));
  const t = generateTicket({ matches, mode: '5x', random: rnd(11) });
  const s = swapSelection(t, 0, matches, { random: rnd(5) });
  assert.ok(!s.error); assert.notEqual(s.selections[0].matchId, t.selections[0].matchId);
  assert.equal(new Set(s.selections.map(x => x.matchId)).size, s.selections.length);
});

test('decontare', () => {
  assert.equal(judgeSelection({ type: 'btts_yes' }, M([1, 1], [0, 0])), 'won');
  assert.equal(judgeSelection({ type: 'over_2_5_ft' }, M([1, 1], [0, 0])), 'lost');
  assert.equal(judgeSelection({ type: 'btts_yes' }, { void: true }), 'void');
  assert.equal(judgeTicket([{ res: 'won' }, { res: 'lost' }]), 'lost');
  assert.equal(judgeTicket([{ res: 'won' }, { res: null }]), null);
  assert.equal(judgeTicket([{ res: 'won' }, { res: 'void' }]), 'won');
});

test('Challenge: o selecție 1.35–1.50, filtru de ligi', () => {
  const m = [mk(1, 1.2), mk(2, 1.42), mk(3, 1.48), mk(4, 1.8)]; m[2].league = 'Alta';
  const c = pickChallenge({ matches: m }); assert.equal(c.selections.length, 1); assert.equal(c.selections[0].matchId, 2);
  assert.equal(pickChallenge({ matches: m, filters: { leagues: ['Alta'] } }).selections[0].matchId, 3);
  assert.equal(pickChallenge({ matches: [mk(1, 1.2)] }).error, 'no_challenge');
});

test('filtru de ligi la generator + mod Cotă 2', () => {
  const m = Array.from({ length: 10 }, (_, i) => { const x = mk(i + 1, 1.25 + (i % 3) * 0.05); x.league = i < 5 ? 'A' : 'B'; return x; });
  const t = generateTicket({ matches: m, mode: 'c2', filters: { leagues: ['A'] }, random: rnd(9) });
  assert.ok(!t.error, JSON.stringify(t)); assert.ok(t.totalOdds >= 1.85 && t.totalOdds <= 2.3); assert.ok(t.selections.every(s => s.league === 'A'));
});

test('mod personalizat: N meciuri (2-30), cu și fără cotă țintă', () => {
  const mkM = (i, odds) => ({ matchId: 'c' + i, kickoff: new Date(Date.now() + 36e5 * (i + 2)).toISOString(), league: 'L', home: 'H' + i, away: 'A' + i, vulnerable: true, signals: 1,
    markets: [{ type: 'over_1_5_ft', odds, signal: true, hitHome: 4, hitAway: 4, sampleSize: 5, percentage: 80 - i }] });
  const ms = Array.from({ length: 35 }, (_, i) => mkM(i, 1.3 + (i % 5) * 0.05));
  MODES.custom.preferredLegs = [30, 30]; MODES.custom.maxLegs = 30; MODES.custom.legs = 30; MODES.custom.targetOdds = null;
  const t = generateTicket({ matches: ms, mode: 'custom', filters: { marketTypes: ['over_1_5_ft'] } });
  assert.equal(t.selections.length, 30); assert.equal(new Set(t.selections.map(s => s.matchId)).size, 30);
  MODES.custom.legs = 30; const t2 = generateTicket({ matches: ms.slice(0, 10), mode: 'custom', filters: { marketTypes: ['over_1_5_ft'] } });
  assert.equal(t2.selections.length, 10); assert.equal(t2.shortBy, 20);
  Object.assign(MODES.custom, { legs: 4, preferredLegs: [4, 4], maxLegs: 4, targetOdds: 4 });
  const t3 = generateTicket({ matches: ms, mode: 'custom', filters: { marketTypes: ['over_1_5_ft'] } });
  assert.equal(t3.selections.length, 4); assert.ok(t3.totalOdds >= 3.52 && t3.totalOdds <= 4.48, String(t3.totalOdds));
});
