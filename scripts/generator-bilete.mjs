// Biletele de test făcute de generator (rubrica separată): Challenge, Cotă 2, Cotă 5, Cotă 10, câte unul pe zi, din meciurile zilei.
// Scrie/actualizează generator/bilete.json și le decontează cu generator/scoruri.json. Piețe fără cornere (se pot deconta automat).
import fs from 'node:fs';
import { generateTicket, pickChallenge, judgeSelection, judgeTicket, ticketOdds } from './generator-lib.mjs';

const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const dayKey = d => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest' }).format(d);
const AUTO_TYPES = ['first_half_over_0_5', 'over_1_5_ft', 'over_2_5_ft', 'btts_yes'];
const PLAN = [['challenge', 'Challenge'], ['cota2', 'Cotă 2'], ['cota5', 'Cotă 5'], ['cota10', 'Cotă 10']];
const MODE = { cota2: 'c2', cota5: '5x', cota10: '10x' };
// meciurile „vulnerabile” au cote mici (1.1–1.4): pentru a atinge țintele alegem a doua / cea mai mare cotă din meci
const OVR = { cota2: { strategy: 'second_lowest' }, cota5: { strategy: 'highest' }, cota10: { strategy: 'highest', preferredLegs: [5, 8], maxLegs: 8 } };

const azi = readJ('generator/azi.json', { matches: [] }), sc = readJ('generator/scoruri.json', {});
const store = readJ('generator/bilete.json', { days: {} });
const now = process.env.GEN_NOW ? Date.parse(process.env.GEN_NOW) : Date.now(), today = dayKey(new Date(now));
const force = process.argv.includes('--force');

// 1. generează ce lipsește pentru azi (meciurile de azi, neîncepute)
const day = store.days[today] = store.days[today] || { day: today, tickets: {} };
const matches = azi.matches.filter(m => dayKey(new Date(m.kickoff)) === today);
const used = {}; for (const t of Object.values(day.tickets)) for (const s of t.selections) used[s.matchId] = (used[s.matchId] || 0) + 1;
for (const [id, label] of PLAN) {
  if (day.tickets[id] && !force) continue;
  const avail = matches.filter(m => (used[m.matchId] || 0) < 2);
  const filters = { marketTypes: AUTO_TYPES };
  const t = id === 'challenge' ? pickChallenge({ matches: avail, filters, now }) : generateTicket({ matches: avail, mode: MODE[id], filters, now, overrides: OVR[id] });
  if (t.error) { console.log(label, 'nu se poate azi:', t.error); continue; }
  day.tickets[id] = { id, label, ...t, selections: t.selections.map(s => ({ ...s, res: null })), status: null };
  for (const s of t.selections) used[s.matchId] = (used[s.matchId] || 0) + 1;
  console.log(label, 'cota', t.totalOdds, t.selections.length, 'selecții');
}

// 2. decontare din scoruri
for (const d of Object.values(store.days)) for (const t of Object.values(d.tickets)) {
  for (const s of t.selections) if (!s.res && sc[s.matchId]) s.res = judgeSelection(s, sc[s.matchId]);
  t.status = judgeTicket(t.selections); t.finalOdds = ticketOdds(t.selections);
}
// 3. păstrăm ultimele 60 de zile
for (const k of Object.keys(store.days).sort().slice(0, -60)) delete store.days[k];
store.updated = new Date(now).toISOString();
fs.writeFileSync('generator/bilete.json', JSON.stringify(store) + '\n');
const all = Object.values(store.days).flatMap(d => Object.values(d.tickets));
console.log('bilete generator:', all.length, 'câștigate', all.filter(t => t.status === 'won').length, 'pierdute', all.filter(t => t.status === 'lost').length);
