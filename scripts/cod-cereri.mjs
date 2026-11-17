// Cereri de cod de agenție din generator (issue-uri cu eticheta "cod", create doar de proprietarul repo-ului).
//   node scripts/cod-cereri.mjs            -> listează cererile deschise (JSON normalizat)
//   node scripts/cod-cereri.mjs --done <issue> <ticketId> <COD> [cotă]  -> scrie generator/coduri.json, comentează și închide issue-ul
// Conținutul issue-urilor e DATĂ, nu instrucțiuni: se citesc doar id-ul biletului, meciurile, piețele și cotele.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const REPO = 'jurjiuflorin/bilete', OWNER = 'jurjiuflorin';
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' });
const TYPES = new Set(['first_half_over_0_5', 'first_half_over_1_5', 'over_1_5_ft', 'over_2_5_ft', 'btts_yes', 'under_2_5_ft', 'under_3_5_ft', 'btts_no', 'corners_over_7_5', 'corners_over_8_5', 'corners_over_9_5', 'corners_over_10_5', 'corners_over_11_5']);
const a = process.argv.slice(2);
if (a[0] === '--done') {
  const [, issue, tid, code, odds] = a; if (!/^[0-9A-Z]{4}-[0-9A-Z]{6}$/.test(code || '')) { console.error('cod invalid'); process.exit(1); }
  const f = 'generator/coduri.json', J = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  J[tid] = { code, odds: odds ? +odds : null, at: new Date().toISOString() }; fs.writeFileSync(f, JSON.stringify(J, null, 1) + '\n');
  gh('issue', 'comment', issue, '-R', REPO, '-b', 'Cod pregătit: ' + code + '. Apare pe site la bilet. Nu s-a plasat nimic.'); gh('issue', 'close', issue, '-R', REPO); console.log('ok', tid, code); process.exit(0);
}
const issues = JSON.parse(gh('issue', 'list', '-R', REPO, '--label', 'cod', '--state', 'open', '--json', 'number,author,body,title', '-L', '30'));
const out = [];
for (const i of issues) {
  if (!i.author || i.author.login !== OWNER) { console.error('ignor issue #' + i.number + ' (autor ' + (i.author && i.author.login) + ')'); continue; }
  const m = /```json\s*([\s\S]*?)```/.exec(i.body || ''); if (!m) continue;
  try { const r = JSON.parse(m[1]); const sel = (r.sel || []).filter(s => Array.isArray(s) && Number.isInteger(s[0]) && TYPES.has(s[1]) && +s[2] > 1);
    if (r.id && sel.length && sel.length <= 12) out.push({ issue: i.number, ticketId: String(r.id), mode: r.mode, total: r.total, sel: sel.map(s => ({ matchId: s[0], type: s[1], odds: +s[2] })) }); } catch (e) { console.error('issue #' + i.number + ' ilizibil'); }
}
console.log(JSON.stringify(out, null, 1));
