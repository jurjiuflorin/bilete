// Generator de bilete: statistici (funcții pure) + generatorul propriu-zis. Rulează identic în Node (teste, workflow) și în browser.
// Meci = { ft: [gazde, oaspeți], ht: [gazde, oaspeți] } (scor final și la pauză, din perspectiva meciului).

export const MAX_LEG_ODDS = 3.0;

// ---- piețe de goluri: hit(meci) -> bool ----
export const MARKETS = {
  first_half_over_0_5: { label: 'Peste 0.5 goluri la pauză', hit: m => m.ht[0] + m.ht[1] >= 1, default: true },
  first_half_over_1_5: { label: 'Peste 1.5 goluri la pauză', hit: m => m.ht[0] + m.ht[1] >= 2, default: false },
  over_1_5_ft: { label: 'Peste 1.5 goluri', hit: m => m.ft[0] + m.ft[1] >= 2, default: false },
  over_2_5_ft: { label: 'Peste 2.5 goluri', hit: m => m.ft[0] + m.ft[1] >= 3, default: true },
  btts_yes: { label: 'Ambele marchează (GG)', hit: m => m.ft[0] >= 1 && m.ft[1] >= 1, default: true },
  // dezactivate implicit (utilizatorul preferă să nu joace sub / NG)
  under_2_5_ft: { label: 'Sub 2.5 goluri', hit: m => m.ft[0] + m.ft[1] <= 2, default: false, optional: true },
  under_3_5_ft: { label: 'Sub 3.5 goluri', hit: m => m.ft[0] + m.ft[1] <= 3, default: false, optional: true },
  btts_no: { label: 'Nu marchează ambele (NG)', hit: m => !(m.ft[0] >= 1 && m.ft[1] >= 1), default: false, optional: true },
};
// piețe de cornere: nu avem cornere pe ultimele meciuri, deci semnalul vine din media pe sezon (Poisson), nu din 5/5
export const CORNER_LINES = [7.5, 8.5, 9.5, 10.5, 11.5];
export const cornerType = L => 'corners_over_' + String(L).replace('.', '_');
export const isCornerType = t => /^corners_over_/.test(t);
export const typeLabel = t => MARKETS[t] ? MARKETS[t].label : isCornerType(t) ? 'Peste ' + t.replace('corners_over_', '').replace('_', '.') + ' cornere' : t;
export const DEFAULT_TYPES = [...Object.keys(MARKETS).filter(t => MARKETS[t].default), cornerType(8.5)];

// ---- scoruri din feedul Scorealarm ----
export function scoresOf(ev) {
  const s = ev.scores || [], f = t => s.find(x => x.type === t);
  const ft = f(0) || f(6), ht = f(1);
  if (!ft || !ht) return null;
  return { ft: [ft.team1 || 0, ft.team2 || 0], ht: [ht.team1 || 0, ht.team2 || 0] };
}
// ultimele N meciuri terminate ale unei echipe (orice teren), cele mai recente primele
export function lastFinished(events, teamId, n = 5) {
  return (events || []).filter(e => e.match_state === 2 && scoresOf(e)).sort((a, b) => b.match_date.seconds - a.match_date.seconds).slice(0, n)
    .map(e => ({ ...scoresOf(e), home: e.team1.id === teamId, opp: (e.team1.id === teamId ? e.team2 : e.team1).name, ts: e.match_date.seconds }));
}

export const pois = (lam, L) => { let c = 0, t = Math.exp(-lam); for (let i = 0; i <= Math.floor(L); i++) { c += t; t *= lam / (i + 1); } return 1 - c; };

// ---- statistica unui meci programat ----
// input: { matchId, kickoff, league, home, away, homeLast, awayLast, odds: {tip: cotă}, corners: { lam, odds: {tip: cotă} } | null }
export function analyzeMatch(inp, opts = {}) {
  const N = opts.N || 5, thr = opts.threshold ?? 0.8, rule = opts.rule || 'both', minSignals = opts.minSignals ?? 2;
  const types = opts.types || Object.keys(MARKETS);
  const H = (inp.homeLast || []).slice(0, N), A = (inp.awayLast || []).slice(0, N);
  if (H.length < N || A.length < N) return null; // sub N meciuri: nu intră
  const markets = [];
  for (const type of types) {
    const def = MARKETS[type]; if (!def) continue;
    const hitHome = H.filter(def.hit).length, hitAway = A.filter(def.hit).length;
    const pctHome = hitHome / N, pctAway = hitAway / N, pctTotal = (hitHome + hitAway) / (2 * N);
    const signal = rule === 'total' ? pctTotal >= thr : (pctHome >= thr && pctAway >= thr);
    markets.push({ type, odds: (inp.odds || {})[type] ?? null, hitHome, hitAway, sampleSize: N, percentage: Math.round(pctTotal * 100), signal });
  }
  if (inp.corners && inp.corners.lam > 0) {
    for (const L of CORNER_LINES) { const type = cornerType(L); if (opts.types && !opts.types.includes(type)) continue;
      const p = pois(inp.corners.lam, L);
      markets.push({ type, odds: inp.corners.odds[type] ?? null, hitHome: null, hitAway: null, sampleSize: null, percentage: Math.round(p * 100), signal: p >= thr, model: 'medie ' + inp.corners.lam.toFixed(1) + ' cornere/meci' }); }
  }
  const signals = markets.filter(m => m.signal).length;
  return { matchId: inp.matchId, kickoff: inp.kickoff, league: inp.league, home: inp.home, away: inp.away, markets, signals, vulnerable: signals >= minSignals };
}

// ---- generatorul ----
export const MODES = {
  c2: { targetOdds: 2, strategy: 'lowest', preferredLegs: [2, 3], maxLegs: 4, minAccept: 1.85, maxAccept: 2.3, attempts: 800 },
  '5x': { targetOdds: 5, strategy: 'lowest', preferredLegs: [2, 4], maxLegs: 5, minAccept: 4.6, maxAccept: 5.4, attempts: 1000 },
  '10x': { targetOdds: 10, strategy: 'lowest', preferredLegs: [3, 5], maxLegs: 7, minAccept: 9.25, maxAccept: 10.75, attempts: 1000 },
  '25x': { targetOdds: 25, strategy: 'second_lowest', preferredLegs: [4, 6], maxLegs: 8, minAccept: 23, maxAccept: 27, attempts: 1200 },
  '50x': { targetOdds: 50, strategy: 'highest', preferredLegs: [5, 8], maxLegs: 10, minAccept: 46, maxAccept: 54, attempts: 1500 },
};
const r2 = v => Math.round(v * 100) / 100;

export function buildPool(matches, mode, filters = {}, now = Date.now(), overrides = {}) {
  const cfg = { ...MODES[mode], ...overrides }; const types = filters.marketTypes || DEFAULT_TYPES; const pool = [];
  for (const m of matches) {
    if (!m.vulnerable || new Date(m.kickoff).getTime() <= now) continue;
    let cand = m.markets.filter(x => x.signal && x.odds > 1 && x.odds <= MAX_LEG_ODDS && types.includes(x.type)
      && (!filters.leagues || !filters.leagues.length || filters.leagues.includes(m.league))
      && (filters.minLineOdds == null || x.odds >= filters.minLineOdds) && (filters.maxLineOdds == null || x.odds <= filters.maxLineOdds)
      && !(isCornerType(x.type) && (mode === '25x' || mode === '50x') && !(x.odds > 1.8)));
    if (!cand.length) continue;
    cand = cand.sort((a, b) => a.odds - b.odds);
    const pick = cfg.strategy === 'lowest' ? cand[0] : cfg.strategy === 'second_lowest' ? (cand[1] || cand[0]) : cand[cand.length - 1];
    pool.push({ match: m, market: pick });
  }
  return pool;
}

export function generateTicket({ matches, mode, filters = {}, recentSignatures = [], random = Math.random, now = Date.now(), overrides = {} }) {
  if (!MODES[mode]) return { error: 'mode_unknown' };
  const cfg = { ...MODES[mode], ...overrides};
  const pool = buildPool(matches, mode, filters, now, overrides);
  if (pool.length < 2) return { error: 'not_enough_matches' };
  const recent = new Set(recentSignatures); const target = cfg.targetOdds, mid = Math.round((cfg.preferredLegs[0] + cfg.preferredLegs[1]) / 2);
  let best = null;
  for (let i = 0; i < cfg.attempts; i++) {
    const arr = pool.slice(); for (let j = arr.length - 1; j > 0; j--) { const k = Math.floor(random() * (j + 1)); [arr[j], arr[k]] = [arr[k], arr[j]]; }
    let legs = cfg.preferredLegs[0] + Math.floor(random() * (cfg.preferredLegs[1] - cfg.preferredLegs[0] + 1));
    legs = Math.max(1, Math.min(legs, cfg.maxLegs, arr.length));
    const cand = arr.slice(0, legs), prod = cand.reduce((p, s) => p * s.market.odds, 1);
    const signature = cand.map(s => s.match.matchId + ':' + s.market.type).sort().join('|');
    const score = Math.abs(prod - target) + 0.05 * Math.max(0, legs - mid) + (prod > target ? 0.1 * (prod - target) : 0);
    const inRange = prod >= cfg.minAccept && prod <= cfg.maxAccept, isFresh = !recent.has(signature);
    const c = { cand, prod, signature, score, inRange, isFresh };
    if (!best || (c.inRange !== best.inRange ? c.inRange : c.isFresh !== best.isFresh ? c.isFresh : c.score < best.score)) best = c;
  }
  const selections = best.cand.map(s => ({ matchId: s.match.matchId, kickoff: s.match.kickoff, league: s.match.league, home: s.match.home, away: s.match.away, type: s.market.type, odds: s.market.odds,
    hitHome: s.market.hitHome, hitAway: s.market.hitAway, sampleSize: s.market.sampleSize, percentage: s.market.percentage, model: s.market.model || null }));
  if (!best.inRange) return { error: 'target_odds_unreachable', partial: { mode, targetOdds: target, totalOdds: r2(best.prod), selections, signature: best.signature } };
  return { mode, targetOdds: target, totalOdds: r2(best.prod), selections, generatedAt: new Date(now).toISOString(), signature: best.signature };
}

// Challenge: un singur meci, cota 1.35–1.50, piața cu cel mai mare procent din formă
export function pickChallenge({ matches, filters = {}, now = Date.now() }) {
  const types = filters.marketTypes || DEFAULT_TYPES; let best = null;
  for (const m of matches) {
    if (!m.vulnerable || new Date(m.kickoff).getTime() <= now) continue;
    if (filters.leagues && filters.leagues.length && !filters.leagues.includes(m.league)) continue;
    for (const x of m.markets) {
      if (!x.signal || !(x.odds >= 1.35 && x.odds <= 1.5) || !types.includes(x.type)) continue;
      const c = { m, x, score: x.percentage - Math.abs(x.odds - 1.42) * 10 };
      if (!best || c.score > best.score) best = c;
    }
  }
  if (!best) return { error: 'no_challenge' };
  const { m, x } = best;
  return { mode: 'challenge', targetOdds: 1.45, totalOdds: x.odds, generatedAt: new Date(now).toISOString(), signature: m.matchId + ':' + x.type,
    selections: [{ matchId: m.matchId, kickoff: m.kickoff, league: m.league, home: m.home, away: m.away, type: x.type, odds: x.odds, hitHome: x.hitHome, hitAway: x.hitAway, sampleSize: x.sampleSize, percentage: x.percentage, model: x.model || null }] };
}

// înlocuiește o selecție cu alt meci din pool (neînceput, care nu e deja pe bilet), păstrând strategia de piață
export function swapSelection(ticket, index, matches, { filters = {}, random = Math.random, now = Date.now() } = {}) {
  const used = new Set(ticket.selections.map(s => s.matchId));
  const pool = buildPool(matches, ticket.mode, filters, now).filter(p => !used.has(p.match.matchId));
  if (!pool.length) return { error: 'no_replacement', ticket };
  const p = pool[Math.floor(random() * pool.length)], m = p.match;
  const selections = ticket.selections.slice();
  selections[index] = { matchId: m.matchId, kickoff: m.kickoff, league: m.league, home: m.home, away: m.away, type: p.market.type, odds: p.market.odds, hitHome: p.market.hitHome, hitAway: p.market.hitAway, sampleSize: p.market.sampleSize, percentage: p.market.percentage, model: p.market.model || null };
  const totalOdds = r2(selections.reduce((x, s) => x * s.odds, 1));
  return { ...ticket, selections, totalOdds, signature: selections.map(s => s.matchId + ':' + s.type).sort().join('|') };
}

// ---- decontare: scor final -> won/lost/void pe selecție și pe bilet ----
export function judgeSelection(sel, res) {
  if (!res) return null;
  if (isCornerType(sel.type)) return res.corners == null ? null : (res.corners > parseFloat(sel.type.replace('corners_over_', '').replace('_', '.')) ? 'won' : 'lost');
  if (res.void) return 'void';
  const def = MARKETS[sel.type]; if (!def) return null; return def.hit(res) ? 'won' : 'lost';
}
export function judgeTicket(sels) { // sels: [{res}] cu res in won/lost/void/null
  if (sels.some(s => s.res === 'lost')) return 'lost';
  if (sels.some(s => s.res == null)) return null;
  const live = sels.filter(s => s.res !== 'void'); return live.length ? 'won' : 'void';
}
export const ticketOdds = sels => r2(sels.filter(s => s.res !== 'void').reduce((p, s) => p * s.odds, 1));
