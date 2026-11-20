// Verifică și normalizează câmpul "rezultat" al biletelor, ca site-ul să poată valida fiecare selecție.
// Format canonic (cel citit de site): "Gazdă–Oaspete 2-1 · Gazdă–Oaspete 0-3 (11 cornere)", cu numele din câmpul "selectii".
//   node scripts/verifica-rezultate.mjs                 -> verifică bilete.json, scrie avertizari.json
//   node scripts/verifica-rezultate.mjs --fix fisier    -> rescrie în fișier rezultatele reparabile (folosit de sincronizarea dashboard -> site)
import fs from 'node:fs';
const nrm = x => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const key = w => (w || '').split(/[\s.]+/).filter(t => t.length > 2)[0] || '';
const CANON = /^(.+?)\s*[–-]\s*(.+?)\s+(\d+)\s*-\s*(\d+)/;
const legs = r => (r.selectii || '').split(' · ').filter(Boolean).map(p => { const m = p.match(/^(?:\d{2}\.\d{2} )?\d{2}:\d{2} (.+?): /); return m ? m[1] : null; }).filter(Boolean);
const same = (a, b) => key(nrm(a)) && nrm(b).includes(key(nrm(a)));
// întoarce { part, fixed } pentru o bucată de rezultat
export function normPart(part, meciuri) {
  const m0 = part.match(CANON);
  if (m0) { const [h, a] = [m0[1], m0[2]]; if (meciuri.some(m => { const [mh, ma] = m.split(' – '); return same(mh, h) && same(ma, a); })) return { part, fixed: false, ok: true }; }
  if (part.includes('–')) return { part, fixed: false, ok: false };   // formă canonică pentru ALT meci: nu o atinge
  // "Spania 2-3 Anglia"  ->  "Spania–Anglia 2-3"
  const m1 = part.match(/^(.+?)\s+(\d+)\s*-\s*(\d+)\s+([^\d(].*?)(\s*\(.*)?$/);
  if (m1) { const mt = meciuri.find(m => { const [mh, ma] = m.split(' – '); return same(mh, m1[1]) && same(ma, m1[4]); }); if (mt) { const [mh, ma] = mt.split(' – '); return { part: mh + '–' + ma + ' ' + m1[2] + '-' + m1[3] + (m1[5] || ''), fixed: true, ok: true }; } }
  // "Flamengo 2-1"  ->  "Flamengo–Athletico PR 2-1" (echipa numită primește primul scor)
  const m2 = part.match(/^(.+?)\s+(\d+)\s*-\s*(\d+)(\s*\(.*)?$/);
  if (m2) { for (const m of meciuri) { const [mh, ma] = m.split(' – '); if (same(mh, m2[1])) return { part: mh + '–' + ma + ' ' + m2[2] + '-' + m2[3] + (m2[4] || ''), fixed: true, ok: true }; if (same(ma, m2[1])) return { part: mh + '–' + ma + ' ' + m2[3] + '-' + m2[2] + (m2[4] || ''), fixed: true, ok: true, ghicit: true }; } }
  return { part, fixed: false, ok: false };
}
export function normRezultat(r) {
  if (!r.rezultat) return { rezultat: r.rezultat, changed: false, bad: [] };
  const mc = legs(r); const out = []; const bad = []; let changed = false;
  for (const p of r.rezultat.split(' · ')) { const x = normPart(p, mc); out.push(x.part); if (x.fixed) changed = true; if (!x.ok) bad.push(p); }
  return { rezultat: out.join(' · '), changed, bad };
}
if (import.meta.url === 'file://' + process.argv[1]) {
  const fixI = process.argv.indexOf('--fix'); const file = fixI > 0 ? process.argv[fixI + 1] : 'bilete.json';
  const rows = JSON.parse(fs.readFileSync(file, 'utf8')); let legsJ = {}; try { legsJ = JSON.parse(fs.readFileSync('legs.json', 'utf8')); } catch (e) {}
  const warn = {}; let n = 0;
  for (const r of rows) {
    if (r.data < '2026-11-10') continue;   // istoricul vechi e deja validat
    const x = normRezultat(r);
    if (x.changed && fixI > 0) { r.rezultat = x.rezultat; n++; console.log('reparat', r.id, '->', x.rezultat.slice(0, 120)); }
    if (x.bad.length) warn[r.id] = (warn[r.id] || []).concat('nu se poate citi: ' + x.bad.join(' | ').slice(0, 120));
    if (r.status !== 'în așteptare' && r.data >= '2026-11-10') {
      const L = (r.selectii || '').split(' · ').filter(Boolean); const g = legsJ[r.id] || [];
      const lipsa = L.map((s, i) => [s, i]).filter(([s, i]) => !(g[i] && (g[i].res || g[i].sc)) && !x.rezultat.split(' · ').some(p => normPart(p, [(s.match(/^(?:\d{2}\.\d{2} )?\d{2}:\d{2} (.+?): /) || [])[1] || '']).ok)).map(([s]) => s.slice(0, 50));
      if (lipsa.length && r.status === 'pierdut' && lipsa.length === L.length) continue;
      if (lipsa.length && !/baschet|tenis/i.test(r.sport || '')) warn[r.id] = (warn[r.id] || []).concat('selecții fără scor validat: ' + lipsa.slice(0, 4).join('; '));
    }
  }
  if (fixI > 0) { fs.writeFileSync(file, JSON.stringify(rows)); console.log('reparate', n); }
  else { fs.writeFileSync('avertizari.json', JSON.stringify({ at: new Date().toISOString(), avertizari: warn }, null, 1) + '\n'); console.log('avertizări', Object.keys(warn).length); for (const k in warn) console.log(k, warn[k].join(' ; ')); }
}
