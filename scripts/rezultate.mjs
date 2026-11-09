// Validează automat biletele „în așteptare” din bilete.json după scorurile finale (feed Superbet/scorealarm).
// Scrie settle.json: { "<id bilet>": { status: "câștigat"|"pierdut", rezultat: "...", at: ISO } }.
// Nu modifică bilete.json (sursa e dashboardul). Site-ul aplică settle.json peste biletele încă „în așteptare”,
// iar sarcina de sincronizare îl aplică și pe dashboard.
// Reguli prudente: dacă o selecție nu se poate judeca sigur (handicap, SuperAvantaj posibil, statistică lipsă), biletul rămâne deschis.
import fs from 'node:fs';

const SA = 'https://scorealarm-stats.freetls.fastly.net/v2/soccer/fixtures/overview/rosuperbetsport/ro-RO?fixture-id=ax%3Amatch%3A';
const nrm = x => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const getJ = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } }); if (r.ok) return await r.json(); } catch (e) {} await new Promise(r => setTimeout(r, 1200)); } return null; };

const all = JSON.parse(fs.readFileSync('bilete.json', 'utf8'));
const rows = Array.isArray(all) ? all : (all.rows || all.bilete || []);
const TEST = process.argv.includes('--test');   // test: judecă toate biletele din ultimele zile, scrie settle-test.json
let settle = {}; if (!TEST) try { settle = JSON.parse(fs.readFileSync('settle.json', 'utf8')); } catch (e) {}

const cache = {};
function statOf(j, key) { for (const g of (j.statistics || [])) if (g.period === 0) for (const d of g.data || []) if (d.text && d.text.args && d.text.args[0] === 'stats.football.match.' + key) return (Number(d.team1) || 0) + (Number(d.team2) || 0);
  for (const d of (j.match_stats || [])) if (d.text && d.text.args && d.text.args[0] === 'stats.football.match.' + key && (d.period === 0 || d.period == null)) return (Number(d.team1) || 0) + (Number(d.team2) || 0); return null; }
async function match(id) {
  if (!id) return null;
  if (!(id in cache)) {
    const j = await getJ(SA + id);
    if (!j) cache[id] = null;
    else { const sc = (j.scores || []).find(x => x.type === 6) || (j.scores || []).find(x => x.type === 0);
      cache[id] = { state: j.match_state, h: sc ? Number(sc.team1) || 0 : 0, a: sc ? Number(sc.team2) || 0 : 0, corners: statOf(j, 'corner_kicks'), yellow: statOf(j, 'yellow_cards'), sa: false }; }
  }
  return cache[id];
}

// Judecă o selecție pe un meci terminat. Returnează 'won' | 'lost' | null (nu se poate sigur).
function judge(sel, meci, m, inBB) {
  const H = m.h, A = m.a, T = H + A;
  let s = nrm(sel).trim().replace(/^ambele (echipe )?marcheaza( \(gg\))?$/, 'gg');
  if (/^[12x] \S.*$/.test(s)) s = s[0];            // "2 Manchester City" / "2 (City câștigă)" = "2"
  const [hn, an] = (meci || '').split(' – ').map(t => nrm(t));
  const side = t => { t = nrm(t).trim(); const w = x => x.split(/\s+/).filter(y => y.length > 2); if (hn && (hn.includes(t) || t.includes(hn) || w(t).some(y => hn.includes(y)))) return 'h'; if (an && (an.includes(t) || t.includes(an) || w(t).some(y => an.includes(y)))) return 'a'; return null; };
  const R = w => w ? 'won' : 'lost';
  let x;
  if (s === '1' || s === 'x' || s === '2') {
    const win = s === '1' ? H > A : s === 'x' ? H === A : A > H;
    if (!win && s !== 'x' && !inBB) return null;   // poate fi SuperAvantaj (2 goluri avans): îl verifică sarcina cu verificare manuală
    return R(win);
  }
  if (s === '1x') return R(H >= A); if (s === 'x2') return R(A >= H); if (s === '12') return R(H !== A);
  if (s === 'gg') return R(H > 0 && A > 0); if (s === 'ng') return R(!(H > 0 && A > 0));
  if ((x = s.match(/^(peste|sub) (\d+(?:\.\d)?)(?: goluri)?$/))) { const L = +x[2]; return R(x[1] === 'peste' ? T > L : T < L); }
  if ((x = s.match(/^(.+?) peste (\d+(?:\.\d)?) goluri$/))) { const d = side(x[1]); if (!d) return null; const G = d === 'h' ? H : A; return R(G > +x[2]); }
  if ((x = s.match(/(peste|sub) (\d+(?:\.\d)?) cornere/) || s.match(/cornere (peste|sub) (\d+(?:\.\d)?)/))) { if (m.corners == null) return null; return R(x[1] === 'peste' ? m.corners > +x[2] : m.corners < +x[2]); }
  if ((x = s.match(/(peste|sub) (\d+(?:\.\d)?) (?:galbene|cartonase)/))) { if (m.yellow == null) return null; return R(x[1] === 'peste' ? m.yellow > +x[2] : m.yellow < +x[2]); }
  if ((x = s.match(/^(.+?) (?:castiga|victorie)$/))) { const d = side(x[1]); if (!d) return null; const win = d === 'h' ? H > A : A > H; if (!win && !inBB) return null; return R(win); }
  if ((x = s.match(/^(.+?) sau egal/))) { const d = side(x[1]); if (!d) return null; return R(d === 'h' ? H >= A : A >= H); }
  if ((x = s.match(/^(.+?) fara gol primit$/))) { const d = side(x[1]); if (!d) return null; return R((d === 'h' ? A : H) === 0); }
  if (s.startsWith('bet builder')) {
    const parts = String(sel).replace(/^bet builder\s*/i, '').split(/\s*\+\s*/).map(p => judge(p, meci, m, true));
    if (parts.includes('lost')) return 'lost'; if (parts.includes(null)) return null; return 'won';
  }
  return null;
}


// ---- mod --legs: rezultatul fiecărei selecții pentru biletele încheiate (completează statisticile din Istoric) ----
if (process.argv.includes('--legs')) {
  let legs = {}; try { legs = JSON.parse(fs.readFileSync('legs.json', 'utf8')); } catch (e) {}
  let sj = {}; try { sj = JSON.parse(fs.readFileSync('settle.json', 'utf8')); } catch (e) {}
  let n = 0;
  for (const r of rows) {
    const st = r.status !== 'în așteptare' ? r.status : (sj[r.id] && sj[r.id].status);
    if (st !== 'câștigat' && st !== 'pierdut') continue;
    const sels = String(r.selectii || '').split(' · '); const ids = r.ids || [];
    if (legs[r.id] && legs[r.id].length === sels.length && !legs[r.id].some(x => x.res == null) && legs[r.id].every(x => x.sc)) continue;
    const out = [];
    for (let i = 0; i < sels.length; i++) {
      const mt = /^(?:\d\d\.\d\d )?\d\d:\d\d (.+?): (.+?)(?: \(\d+(?:\.\d+)?(?: estimat)?\))?$/.exec(sels[i]);
      const o = { res: st === 'câștigat' ? 'won' : null };
      const m = mt && ids[i] ? await match(ids[i]) : null;
      if (m && m.state === 2) { o.sc = m.h + '-' + m.a; if (m.corners != null) o.cor = m.corners; if (st === 'pierdut') { const v = judge(mt[2], mt[1], m, true); if (v) o.res = v; } }
      out.push(o);
    }
    legs[r.id] = out; n++;
  }
  fs.writeFileSync('legs.json', JSON.stringify(legs));
  console.log('legs actualizate:', n);
  process.exit(0);
}

const out = { ...settle };
let changed = 0;
for (const r of rows) {
  if (TEST ? !(r.data >= '2026-11-05' && r.data <= '2026-11-07') : (r.status !== 'în așteptare' || settle[r.id])) continue;
  const sels = String(r.selectii || '').split(' · ');
  const ids = r.ids || [];
  if (!sels.length || ids.length !== sels.length) continue;
  const verd = [], rez = [];
  for (let i = 0; i < sels.length; i++) {
    const mt = /^(?:\d\d\.\d\d )?\d\d:\d\d (.+?): (.+?)(?: \(\d+(?:\.\d+)?(?: estimat)?\))?$/.exec(sels[i]);
    if (!mt) { verd.push(null); continue; }
    const [, meci, sel] = mt;
    const m = await match(ids[i]);
    if (!m || m.state !== 2) { verd.push(null); continue; }     // meci neterminat
    const v = judge(sel, meci, m, false);
    verd.push(v);
    const [hn, an] = meci.split(' – ');
    rez.push(`${hn}–${an} ${m.h}-${m.a}` + (/cornere/i.test(sel) && m.corners != null ? ` (${m.corners} cornere)` : ''));
  }
  let st = null;
  if (verd.includes('lost')) st = 'pierdut';
  else if (verd.every(v => v === 'won')) st = 'câștigat';
  if (!st) continue;
  out[r.id] = { status: st, rezultat: rez.join(' · '), at: new Date().toISOString() };
  changed++;
  console.log(r.id, st);
}
// păstrează doar ultimele 400 de intrări
const keys = Object.keys(out); if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete out[k];
if (TEST) { for (const k of Object.keys(out)) out[k].dashboard = (rows.find(r => r.id === k) || {}).status; fs.writeFileSync('settle-test.json', JSON.stringify(out, null, 1)); } else fs.writeFileSync('settle.json', JSON.stringify(out, null, 1));
console.log('validate noi:', changed);
