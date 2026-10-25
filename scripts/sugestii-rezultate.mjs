// Judecă sugestiile salvate din zilele încheiate (câmpul "rez": "won" | "lost" | "void")
// și scrie sugestii/index.json cu scorul fiecărei zile, pentru istoricul de pe site.
import fs from 'node:fs';

const SA = 'https://scorealarm-stats.freetls.fastly.net/v2/soccer/fixtures/overview/rosuperbetsport/ro-RO?fixture-id=ax%3Amatch%3A';
const CATS = ['goluri', 'gg', 'cornere', 'cartonase'];
const dayKey = d => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest' }).format(d);
const today = dayKey(new Date());
const getJ = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } }); if (r.ok) return await r.json(); console.log('HTTP', r.status); } catch (e) { console.log('ERR', String(e).slice(0, 100)); } await new Promise(r => setTimeout(r, 1500)); } return null; };
function statOf(j, key) { for (const g of (j.statistics || [])) if (g.period === 0) for (const d of g.data || []) if (d.text && d.text.args && d.text.args[0] === 'stats.football.match.' + key) return (Number(d.team1) || 0) + (Number(d.team2) || 0); return null; }

const cache = {};
async function match(id) {
  if (!(id in cache)) {
    const j = await getJ(SA + id);
    if (!j) cache[id] = null;
    else {
      const sc = (j.scores || []).find(x => x.type === 0);
      cache[id] = { state: j.match_state, status: j.match_status, h: sc ? Number(sc.team1) || 0 : 0, a: sc ? Number(sc.team2) || 0 : 0, corners: statOf(j, 'corner_kicks'), yellow: statOf(j, 'yellow_cards') };
    }
  }
  return cache[id];
}
function judge(z, m) {
  const L = parseFloat((z.sel.match(/(\d+(?:\.\d)?)/) || [])[1]);
  if (z.cat === 'gg') return m.h > 0 && m.a > 0 ? 'won' : 'lost';
  if (z.cat === 'goluri') return m.h + m.a > L ? 'won' : 'lost';
  if (z.cat === 'cornere') return m.corners == null ? null : (m.corners > L ? 'won' : 'lost');
  if (z.cat === 'cartonase') return m.yellow == null ? null : (m.yellow > L ? 'won' : 'lost');
  return null;
}

const files = fs.readdirSync('sugestii').filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const index = [];
for (const f of files) {
  const p = 'sugestii/' + f, d = JSON.parse(fs.readFileSync(p, 'utf8'));
  let changed = false;
  const old = (Date.parse(today) - Date.parse(d.data)) / 864e5;
  for (const c of CATS) for (const z of (d.sugestii[c] || [])) {
    if (z.rez || d.data >= today) continue;
    const m = await match(z.id); if (!m) continue;
    if (m.state === 2) { const r = judge({ ...z, cat: c }, m); if (r) { z.rez = r; z.scor = m.h + '-' + m.a; if (c === 'cornere') z.total = m.corners; if (c === 'cartonase') z.total = m.yellow; changed = true; } }
    else if (old >= 3) { z.rez = 'void'; changed = true; }   // amânat / anulat
  }
  if (changed) { fs.writeFileSync(p, JSON.stringify(d, null, 1) + '\n'); console.log('judecat', f); }
  const row = { data: d.data, w: 0, n: 0, cat: {} };
  for (const c of CATS) { const a = (d.sugestii[c] || []).filter(z => z.rez === 'won' || z.rez === 'lost'); const w = a.filter(z => z.rez === 'won').length; row.cat[c] = [w, a.length]; row.w += w; row.n += a.length; }
  row.total = CATS.reduce((s, c) => s + (d.sugestii[c] || []).length, 0);
  index.push(row);
}
fs.writeFileSync('sugestii/index.json', JSON.stringify(index.reverse(), null, 1) + '\n');
console.log('index', index.length, 'zile');
