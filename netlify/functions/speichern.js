/* GASTHOF DORRER · Netlify Function "speichern"
   Nimmt vom Admin-Bereich (/admin) die Inhalte (data/inhalt.json) und optional ein
   Speisekarten-PDF entgegen, prüft das Passwort und legt alles in EINEM Commit über
   die GitHub-API im Repo ab. Netlify veröffentlicht danach automatisch (ca. 1 Minute).

   Umgebungsvariablen (Netlify → Project configuration → Environment variables):
     ADMIN_PASSWORD   Passwort für den Admin-Bereich
     GITHUB_TOKEN     Fine-grained Token mit "Contents: Read and write" nur für dieses Repo
     GITHUB_REPO      z. B. "ivohrovat/gasthof-dorrer"
     GITHUB_BRANCH    optional, Standard "main"
*/
const crypto = require('crypto');

const MAX_PDF = 4.5 * 1024 * 1024;
const PDF_PFAD = 'karten/speisekarte.pdf';
const DATEN_PFAD = 'data/inhalt.json';
const TAGE = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
const ZEIT = /^([01]\d|2[0-4]):[0-5]\d$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const ARTEN = ['tank', 'fass', 'flasche', 'dose'];

const antwort = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

function gleich(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const txt = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max);
const zeit = (v) => (ZEIT.test(v || '') ? v : '');

/* Nur erlaubte Felder übernehmen, alles kürzen und prüfen */
function saeubern(d) {
  d = d && typeof d === 'object' ? d : {};
  const u = d.urlaub || {};
  const h = d.hinweis || {};
  const oz = d.oeffnungszeiten || {};
  const tage = {};
  for (const t of TAGE) {
    const x = (oz.tage && oz.tage[t]) || {};
    const von = zeit(x.von), bis = zeit(x.bis);
    tage[t] = { offen: x.offen === true && !!von && !!bis, von, bis, kv: zeit(x.kv), kb: zeit(x.kb) };
  }
  const k = d.speisekarte || {};
  const gruppen = (Array.isArray(k.gruppen) ? k.gruppen : []).slice(0, 20).map((g) => ({
    titel: txt(g && g.titel, 80),
    gerichte: (Array.isArray(g && g.gerichte) ? g.gerichte : []).slice(0, 40)
      .map((x) => ({ name: txt(x && x.name, 220), preis: txt(x && x.preis, 20) }))
      .filter((x) => x.name),
  })).filter((g) => g.titel || g.gerichte.length);
  const biere = (Array.isArray(d.biersorten) ? d.biersorten : []).slice(0, 30)
    .map((b) => ({ art: ARTEN.includes(b && b.art) ? b.art : 'fass', name: txt(b && b.name, 60), text: txt(b && b.text, 200) }))
    .filter((b) => b.name);
  const fb = txt(d.facebook, 200);
  return {
    aktualisiert: new Date().toISOString(),
    urlaub: {
      aktiv: u.aktiv === true && DATUM.test(u.bis || ''),
      von: DATUM.test(u.von || '') ? u.von : '',
      bis: DATUM.test(u.bis || '') ? u.bis : '',
      text: txt(u.text, 400),
    },
    hinweis: { aktiv: h.aktiv === true, titel: txt(h.titel, 80), text: txt(h.text, 600) },
    tagesmenue: { aktiv: !!(d.tagesmenue && d.tagesmenue.aktiv === true), text: txt(d.tagesmenue && d.tagesmenue.text, 160) },
    oeffnungszeiten: { tage, zusatz: txt(oz.zusatz, 160) },
    speisekarte: { einleitung: txt(k.einleitung, 300), pdf: k.pdf === true, gruppen },
    biersorten: biere,
    facebook: /^https:\/\/(www\.|m\.)?facebook\.com\/[^\s"'<>]+$/i.test(fb) ? fb : '',
  };
}

async function gh(token, method, path, body) {
  const res = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dorrer-admin',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  if (!res.ok) throw new Error('GitHub ' + res.status + ': ' + (data.message || text).slice(0, 200));
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return antwort(405, { ok: false, fehler: 'Nur POST.' });

  const { ADMIN_PASSWORD, GITHUB_TOKEN, GITHUB_REPO } = process.env;
  const BRANCH = process.env.GITHUB_BRANCH || 'main';
  if (!ADMIN_PASSWORD || !GITHUB_TOKEN || !GITHUB_REPO) {
    return antwort(500, { ok: false, fehler: 'Server nicht eingerichtet: ADMIN_PASSWORD, GITHUB_TOKEN und GITHUB_REPO fehlen in Netlify.' });
  }

  let p;
  try { p = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body); }
  catch (e) { return antwort(400, { ok: false, fehler: 'Ungültige Anfrage.' }); }

  if (!p || !gleich(p.passwort || '', ADMIN_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 800));
    return antwort(401, { ok: false, fehler: 'Falsches Passwort.' });
  }
  if (p.aktion === 'pruefen') return antwort(200, { ok: true });

  const daten = saeubern(p.daten);
  const dateien = [{ path: DATEN_PFAD, content: JSON.stringify(daten, null, 2) + '\n', encoding: 'utf-8' }];

  if (p.pdf) {
    const buf = Buffer.from(String(p.pdf), 'base64');
    if (!buf.length) return antwort(400, { ok: false, fehler: 'Die PDF-Datei ist leer.' });
    if (buf.length > MAX_PDF) return antwort(413, { ok: false, fehler: 'Das PDF ist größer als 4,5 MB. Bitte kleiner speichern.' });
    if (buf.slice(0, 4).toString() !== '%PDF') return antwort(400, { ok: false, fehler: 'Das ist keine PDF-Datei.' });
    dateien.push({ path: PDF_PFAD, content: buf.toString('base64'), encoding: 'base64' });
    daten.speisekarte.pdf = true;
    dateien[0].content = JSON.stringify(daten, null, 2) + '\n';
  }

  try {
    const R = '/repos/' + GITHUB_REPO;
    const ref = await gh(GITHUB_TOKEN, 'GET', R + '/git/ref/heads/' + BRANCH);
    const kopf = await gh(GITHUB_TOKEN, 'GET', R + '/git/commits/' + ref.object.sha);
    const baum = [];
    for (const f of dateien) {
      const blob = await gh(GITHUB_TOKEN, 'POST', R + '/git/blobs', { content: f.content, encoding: f.encoding });
      baum.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const neu = await gh(GITHUB_TOKEN, 'POST', R + '/git/trees', { base_tree: kopf.tree.sha, tree: baum });
    const commit = await gh(GITHUB_TOKEN, 'POST', R + '/git/commits', {
      message: 'Inhalte aktualisiert' + (p.pdf ? ' inkl. Speisekarte (PDF)' : '') + ' (via /admin)',
      tree: neu.sha,
      parents: [ref.object.sha],
    });
    await gh(GITHUB_TOKEN, 'PATCH', R + '/git/refs/heads/' + BRANCH, { sha: commit.sha, force: false });
    return antwort(200, { ok: true, commit: commit.sha.slice(0, 7) });
  } catch (err) {
    return antwort(502, { ok: false, fehler: 'Speichern fehlgeschlagen: ' + err.message });
  }
};
