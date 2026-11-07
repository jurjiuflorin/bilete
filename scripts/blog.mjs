// Construiește articolele de blog (blog/index.json) din bilete.json + candidati/<data>.json.
// Utilizare: node scripts/blog.mjs bilete [YYYY-MM-DD]   (implicit azi, ora României)
//            node scripts/blog.mjs rezumat [YYYY-MM-DD]  (implicit ieri)
// Nu pune coduri de agenție în articole. Datele sunt doar cele din fișiere (nimic inventat).
import fs from 'fs';

const mode = process.argv[2] || 'bilete';
const ro = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const shift = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = ro(new Date());
const day = process.argv[3] || (mode === 'rezumat' ? shift(today, -1) : today);
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const ziRo = k => { const [y, m, d] = k.split('-').map(Number); return d + ' ' + LUNI[m - 1]; };
const f1 = v => (Math.round(v * 10) / 10).toLocaleString('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nrm = x => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const all = JSON.parse(fs.readFileSync('bilete.json', 'utf8'));
const rows = Array.isArray(all) ? all : (all.bilete || []);
const tix = rows.filter(r => r.data === day && (r.sport || 'fotbal') === 'fotbal');
if (!tix.length) { console.log('niciun bilet pe', day); process.exit(0); }
let cand = null; try { cand = JSON.parse(fs.readFileSync(`candidati/${day}.json`, 'utf8')); } catch (e) {}
const infoById = new Map(((cand && cand.info) || []).map(i => [i.id, i]));
const picks = (cand && cand.picks) || [];

const ORDER = ['Pariul zilei', 'Challenge', 'Cotă 2', 'Cotă 5', 'Cotă 10'];
const ord = t => { const i = ORDER.findIndex(o => t.startsWith(o)); return i < 0 ? 50 : i; };
tix.sort((a, b) => ord(a.tip) - ord(b.tip));

const pc = v => v == null ? null : Math.round(v * 100);
function parseMotiv(m) {
  const o = {}; if (!m) return o;
  const a = /piață (\d+)%/.exec(m), b = /formă (\d+)%/.exec(m), c = /H2H (\d+)%/.exec(m), d = /→ p (\d+)%/.exec(m);
  if (a) o.pm = +a[1] / 100; if (b) o.pf = +b[1] / 100; if (c) o.ph = +c[1] / 100; if (d) o.p = +d[1] / 100; return o;
}
function kindOf(sel, h, a) {
  const s = nrm(sel).replace(/^([12]) .+$/, '$1');
  if (/cornere/.test(s)) return 'cor';
  if (/^(1x|x2|12)$/.test(s)) return 'dc';
  if (/^[12]$/.test(s) || /castiga/.test(s)) return '1x2';
  if (/^gg/.test(s)) return 'gg';
  if (/peste [\d.]+ goluri$/.test(s) && !/^peste/.test(s)) return 'tg';
  if (/^peste [\d.]+( goluri)?$/.test(s)) return 'tot';
  return 'alt';
}

function describe(kind, sel, h, a, f, pick) {
  const L = [];
  if (f && f.h) {
    const gH = f1(f.gfH), cH = f1(f.gaH), gA = f1(f.gfA), cA = f1(f.gaA);
    const line = `Ultimele ${Math.min(f.h, f.a)} meciuri (toate competițiile): ${h} dă ${gH} și primește ${cH} goluri pe meci; ${a} dă ${gA} și primește ${cA}.`;
    if (kind === 'tot') L.push(line, `Meciurile ${h} au în medie ${f1(f.gfH + f.gaH)} goluri, cele ale ${a} ${f1(f.gfA + f.gaA)}.`);
    else if (kind === 'gg') L.push(line, `Ambele echipe marchează doar dacă atacurile (${gH} și ${gA}) trec de apărările adverse (${cA} și ${cH}).`);
    else if (kind === 'tg') {
      const home = nrm(sel).startsWith(nrm(h).slice(0, 6));
      L.push(line, home ? `${h} marchează ${gH} pe meci, iar ${a} primește ${cA}.` : `${a} marchează ${gA} pe meci, iar ${h} primește ${cH}.`);
    } else if (kind === '1x2' || kind === 'dc') L.push(line, `Diferența de goluri pe meci: ${h} ${f1(f.gfH - f.gaH)}, ${a} ${f1(f.gfA - f.gaA)}.`);
    else if (kind !== 'cor') L.push(line);
    if (f.h2h >= 3) L.push(`Meciuri directe analizate: ${f.h2h}.`); else L.push('Prea puține meciuri directe (sub 3) ca să conteze în estimare.');
  }
  if (kind === 'cor' && pick && pick.cm) L.push(`Media cornerelor pe meci: ${f1(pick.cm)} cu cele două echipe împreună (din statistica Superbet pe sezon).`);
  return L;
}

const stat = t => t.status === 'câștigat' ? 'câștigat' : t.status === 'pierdut' ? 'pierdut' : 'în așteptare';

function build() {
  const out = [];
  for (const t of tix) {
    const sels = String(t.selectii || '').split(' · ');
    const mot = Array.isArray(t.motive) ? t.motive : [];
    const res = String(t.rezultat || '').split(' · ');
    const ev = [];
    sels.forEach((s, i) => {
      const m = /^(?:\d\d\.\d\d )?(\d\d:\d\d) (.+?): (.+?) \((\d+(?:\.\d+)?)(?: estimat)?\)$/.exec(s);
      if (!m) { ev.push({ ora: '', meci: s, selectie: '', cota: null, linii: [] }); return; }
      const [, ora, meci, sel, od] = m; const [h, a] = meci.split(' – ');
      const id = (t.ids || [])[i]; const info = infoById.get(id); const kind0 = kindOf(sel, h, a);
      const pick = picks.find(p => p.id === id && (nrm(p.sel) === nrm(sel) || nrm(p.ou) === nrm(sel)));
      const mp = parseMotiv(mot[i]);
      const pm = pick ? pick.pm : mp.pm, pf = pick ? pick.pform : mp.pf, ph = pick ? pick.ph : mp.ph, p = pick ? pick.p : mp.p;
      const stats = describe(kind0, sel, h || '', a || '', info && info.form, pick);
      if (mot[i]) stats.push(String(mot[i]));
      const r = res.find(x => nrm(x).startsWith(nrm(h || '').slice(0, 5)));
      const e = { ora, meci, liga: info && info.liga, selectie: sel, cota: +od, linii: stats };
      if (p != null) { e.p = pc(p); e.pm = pc(pm); e.pf = pc(pf); e.ph = pc(ph); e.val = Math.round((p - 1 / +od) * 100); }
      if (r) e.rezultat = r.replace(/\s*\([^)]*\)\s*$/, '').trim();
      ev.push(e);
    });
    out.push({ tip: t.tip, cota: t.cota, sansa: t.sansa != null ? Math.round(t.sansa * 1000) / 10 : null, status: stat(t), evenimente: ev });
  }
  return out;
}

const bilete = build();
const nW = bilete.filter(b => b.status === 'câștigat').length, nL = bilete.filter(b => b.status === 'pierdut').length, nP = bilete.length - nW - nL;
let post;
if (mode === 'bilete') {
  const nev = bilete.reduce((s, b) => s + b.evenimente.length, 0);
  post = { id: day + '-bilete', data: day, tip: 'bilete', titlu: `Biletele zilei de ${ziRo(day)}: ${bilete.length} bilete, ${nev} evenimente analizate`,
    intro: bilete.map(b => `${b.tip} ${b.cota != null ? b.cota.toLocaleString('ro-RO', { minimumFractionDigits: 2 }) : ''}`.trim()).join(' · '),
    sectiuni: [
      { h: 'Cum citești analiza', p: ['Pentru fiecare eveniment vezi trei numere: ce spune piața (cota fără marja casei), ce spune forma pe ultimele 10 meciuri ale ambelor echipe și ce spun meciurile directe (H2H). Estimarea finală e 40% piață, 40% formă și 20% H2H, iar „valoarea” e diferența dintre estimare și probabilitatea din cotă. Cotă 2 are prioritate la alegere, iar meciurile se repetă cât mai puțin între bilete.'] },
      { h: 'Ce trebuie verificat', p: ['Absențele nu sunt verificate. Estimările sunt statistice, nu garanții, iar cotele se pot mișca până la meci. Pune doar o miză mică.'] }],
    bilete };
} else {
  const hit = bilete.flatMap(b => b.evenimente).filter(e => e.p != null);
  const ls = bilete.filter(b => b.status === 'pierdut').map(b => `${b.tip}: ${b.evenimente.filter(e => e.rezultat).map(e => `${e.meci} ${e.rezultat} (${e.selectie})`).join('; ') || 'rezultate incomplete'}`);
  const week = rows.filter(r => r.data >= shift(day, -6) && r.data <= day && (r.sport || 'fotbal') === 'fotbal'); const wW = week.filter(r => r.status === 'câștigat').length, wD = week.filter(r => r.status === 'câștigat' || r.status === 'pierdut').length;
  post = { id: day + '-rezumat', data: day, tip: 'rezumat', titlu: `Rezumatul zilei de ${ziRo(day)}: ${nW} câștigate, ${nL} pierdute${nP ? ', ' + nP + ' nevalidate' : ''}`,
    intro: bilete.map(b => `${b.tip} ${b.status}`).join(' · '),
    sectiuni: [
      { h: 'Ce a picat', p: ls.length ? [] : ['Niciun bilet pierdut.'], li: ls },
      { h: 'Verificări', p: [`Evenimente cu estimare: ${hit.length}.${nP ? ' ' + nP + ' bilete nevalidate încă.' : ''}`] },
      { h: 'Ultimele 7 zile', p: [`${wW} bilete câștigate din ${wD} validate (${wD ? Math.round(wW / wD * 100) : 0}%).`] }],
    bilete };
}

let idx = []; try { idx = JSON.parse(fs.readFileSync('blog/index.json', 'utf8')); } catch (e) {}
idx = [post, ...idx.filter(p => p.id !== post.id)].sort((a, b) => b.data.localeCompare(a.data) || (a.tip === 'rezumat' ? -1 : 1)).slice(0, 60);
fs.mkdirSync('blog', { recursive: true });
fs.writeFileSync('blog/index.json', JSON.stringify(idx, null, 1));
console.log('articol', post.id, bilete.length, 'bilete');
