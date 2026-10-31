// server.js — Surprise Santa (Vercel KV + Georgian UI + admin hand-off)
import express from 'express';
import crypto from 'node:crypto';
import { kv } from '@vercel/kv';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

/* ---------------- storage (Vercel KV) ---------------- */
let db = { games: {} };

async function loadDb() {
  try {
    const saved = await kv.get('santa:db');
    if (saved) db = saved;
  } catch (e) {
    console.warn('KV load failed:', e.message);
  }
}
async function persist() {
  try {
    await kv.set('santa:db', db);
    return true;
  } catch (e) {
    console.error('KV persist failed:', e.message);
    return false;
  }
}

// Always serve from latest KV state (consistent across serverless instances)
app.use(async (req, res, next) => {
  await loadDb();
  next();
});

/* ---------------- helpers ---------------- */
const newToken = () => crypto.randomBytes(16).toString('base64url');
const esc = (s) => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function makeAssignments(people) {
  const n = people.length;
  if (n < 2) throw new Error('საჭიროა მინიმუმ 2 მონაწილე');

  const shuffled = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const posOf = new Map(people.map((p, i) => [p.id, i]));

  for (let attempt = 0; attempt < 500; attempt++) {
    const recips = shuffled(people);
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      if (recips[i].id === people[i].id) { ok = false; break; }
      if (n > 2) {
        const j = posOf.get(recips[i].id);
        if (recips[j].id === people[i].id) ok = false;
      }
    }
    if (ok) return people.map((p, i) => ({ giver: p, recipient: recips[i] }));
  }
  throw new Error('ვერ შეიქმნა ვალიდური დავალება — სცადეთ თავიდან');
}

function layout(title, body) {
  return `<!doctype html><html lang="ka"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0a1020">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;
  font:16px/1.55 "Noto Sans Georgian",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:#eaf0ff;
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(120,60,200,.25), transparent 60%),
    radial-gradient(1000px 500px at 110% 110%, rgba(220,40,90,.20), transparent 60%),
    linear-gradient(160deg,#0a1020 0%,#0f1830 45%,#170f24 100%);
  background-attachment:fixed}
main{width:100%;max-width:680px;background:rgba(17,26,46,.85);border:1px solid #1f2b45;
  border-radius:20px;padding:28px;backdrop-filter:blur(8px);
  box-shadow:0 30px 60px rgba(0,0,0,.45)}
h1{margin:0 0 8px;font-size:26px;line-height:1.3}
h1.greet{text-align:center;background:linear-gradient(90deg,#ffd166,#f08a5d,#ffd166);
  -webkit-background-clip:text;background-clip:text;color:transparent}
h2{font-size:18px;margin:0 0 14px}
.muted{color:#a0aec8;margin:0 0 20px}
.banner{display:block;text-align:center;font-size:14px;color:#ffd166;margin:0 0 18px;
  letter-spacing:.4px}
label{display:block;margin:0 0 16px;font-size:14px;color:#b9c5dc}
input,textarea{width:100%;margin-top:6px;padding:12px 14px;border-radius:12px;
  border:1px solid #2a3855;background:#0b1220;color:#eaf0ff;font:inherit}
input:focus,textarea:focus{outline:none;border-color:#e23b3b;
  box-shadow:0 0 0 3px rgba(226,59,59,.15)}
textarea{resize:vertical;min-height:180px}
button{padding:13px 20px;border:0;border-radius:12px;
  background:linear-gradient(180deg,#e23b3b,#b81f2f);color:#fff;font-weight:700;
  font-size:15px;cursor:pointer;font-family:inherit;
  box-shadow:0 6px 18px rgba(226,59,59,.35);transition:transform .05s}
button:hover{filter:brightness(1.08)}
button:active{transform:translateY(1px)}
button.secondary{background:#1f2b45;box-shadow:none;color:#eaf0ff;font-weight:600}
a{color:#7fb0ff;word-break:break-all;text-decoration:none}
a:hover{text-decoration:underline}
.row{display:flex;gap:12px;align-items:center;justify-content:space-between;
  padding:12px 14px;border:1px solid #1f2b45;border-radius:12px;margin-bottom:10px;
  background:rgba(11,18,32,.5);flex-wrap:wrap}
.row .info{flex:1;min-width:0}
.name{font-weight:700;margin-bottom:4px}
.tag{font-size:12px;color:#8b9ab5;margin-top:4px}
.big{font-size:34px;font-weight:800;color:#ffd166;margin:18px 0;text-align:center;
  text-shadow:0 0 30px rgba(255,209,102,.35)}
.center{text-align:center}
.err{background:#3b1620;border:1px solid #6b2436;color:#ffc9d3;padding:12px 16px;
  border-radius:12px;margin-bottom:16px}
.ok{background:#12341f;border:1px solid #1f6b3a;color:#baf5cf;padding:12px 16px;
  border-radius:12px;margin-bottom:16px}
.url{display:block;padding:10px 12px;background:#0b1220;border:1px dashed #2a3855;
  border-radius:10px;word-break:break-all;font-family:ui-monospace,monospace;
  font-size:13px;color:#9fc2ff;margin:8px 0}
hr{border:0;border-top:1px solid #1f2b45;margin:22px 0}
</style></head><body><main>${body}</main></body></html>`;
}

function findGameByAdminToken(token) {
  return Object.values(db.games).find(g => g.adminToken === token) || null;
}
function findParticipantByToken(token) {
  for (const game of Object.values(db.games)) {
    const p = game.participants.find(x => x.token === token);
    if (p) return { game, participant: p };
  }
  return null;
}

/* ---------------- routes ---------------- */

// Home — create a game
app.get('/', (req, res) => {
  res.send(layout('საიდუმლო სანტა', `
    <div class="banner">🎄 გილოცავთ ახალ წელს! 🎁</div>
    <h1 class="greet">საიდუმლო სანტა</h1>
    <p class="muted">დაამატეთ მონაწილეები, შემდეგ გაუგზავნეთ თითოეულ მათგანს მისი პირადი ბმული.
    ბმულის გახსნისას ისინი ნახავენ ვის უნდა აჩუქონ საჩუქარი.</p>
    <form method="post" action="/create">
      <label>თამაშის სახელი (არასავალდებულო)
        <input name="title" maxlength="80" placeholder="საოჯახო ახალი წელი 2026">
      </label>
      <label>მონაწილეები — თითო სახელი ცალკე ხაზზე
        <textarea name="names" required placeholder="ანა&#10;ბექა&#10;გიორგი"></textarea>
      </label>
      <button type="submit">თამაშის შექმნა და ბმულების მიღება</button>
    </form>`));
});

// Create game
app.post('/create', async (req, res) => {
  const title = (req.body.title || '').trim().slice(0, 80) || 'საიდუმლო სანტა';
  const raw = String(req.body.names || '').split('\n').map(s => s.trim()).filter(Boolean);

  const seen = new Set();
  const names = [];
  for (const n of raw) {
    const key = n.toLowerCase();
    if (seen.has(key)) {
      return res.status(400).send(layout('დუბლირებული სახელი', `
        <div class="err">სახელი „${esc(n)}" უკვე არსებობს სიაში.</div>
        <p><a href="/">← უკან</a></p>`));
    }
    seen.add(key);
    names.push(n.slice(0, 60));
  }
  if (names.length < 2) {
    return res.status(400).send(layout('არასაკმარისი მონაწილეები', `
      <div class="err">საჭიროა მინიმუმ 2 მონაწილე.</div>
      <p><a href="/">← უკან</a></p>`));
  }

  const participants = names.map(name => ({
    id: newToken(), name, token: newToken(), viewedAt: null,
  }));
  const pairs = makeAssignments(participants);

  const game = {
    id: newToken(),
    title,
    adminToken: newToken(),
    createdAt: new Date().toISOString(),
    participants,
    assignments: Object.fromEntries(pairs.map(p => [p.giver.id, p.recipient.id])),
  };
  db.games[game.id] = game;

  const ok = await persist();
  if (!ok) {
    delete db.games[game.id];
    return res.status(500).send(layout('შეცდომა', `
      <div class="err">მონაცემების შენახვა ვერ მოხერხდა. სცადეთ თავიდან.</div>
      <p><a href="/">← მთავარი</a></p>`));
  }

  res.redirect(`/admin/${game.adminToken}?created=1`);
});

// Admin page
app.get('/admin/:adminToken', (req, res) => {
  const game = findGameByAdminToken(req.params.adminToken);
  if (!game) return res.status(404).send(layout('ვერ მოიძებნა', `
    <div class="err">არასწორი ადმინისტრატორის ბმული.</div>
    <p><a href="/">← მთავარი</a></p>`));

  const adminUrl = `${BASE_URL}/admin/${game.adminToken}`;

  const rows = game.participants.map(p => `
    <div class="row">
      <div class="info">
        <div class="name">${esc(p.name)}</div>
        <a href="${BASE_URL}/r/${p.token}">${BASE_URL}/r/${p.token}</a>
        <div class="tag">${p.viewedAt ? '👀 ნანახია' : 'ჯერ არ გახსნილა'}</div>
      </div>
      <button type="button" class="secondary"
        onclick="navigator.clipboard.writeText('${BASE_URL}/r/${p.token}');this.textContent='დაკოპირდა ✓'">
        კოპირება
      </button>
    </div>`).join('');

  let banner = '';
  if (req.query.transferred === '1') {
    banner = `<div class="ok">
      ადმინისტრაცია წარმატებით გადაეცა. გაუგზავნეთ ეს ახალი ბმული ახალ ადმინისტრატორს:
      <span class="url">${esc(adminUrl)}</span>
      თქვენი წინა ადმინ ბმული აღარ მუშაობს.
    </div>`;
  } else if (req.query.created === '1') {
    banner = `<div class="ok">თამაში შეიქმნა! შეინახეთ ეს გვერდი — ეს ერთადერთი გზაა ბმულებთან დასაბრუნებლად.</div>`;
  }

  res.send(layout('ბმულები — ' + game.title, `
    <div class="banner">🎄 გილოცავთ ახალ წელს! 🎁</div>
    <h1>${esc(game.title)}</h1>
    <p class="muted">გაუგზავნეთ თითოეულ მონაწილეს <strong>მხოლოდ მისი</strong> პირადი ბმული.</p>
    ${banner}

    <label style="font-size:13px;color:#b9c5dc">ადმინისტრატორის ბმული
      <span class="url">${esc(adminUrl)}</span>
    </label>
    <button type="button" class="secondary"
      onclick="navigator.clipboard.writeText('${adminUrl}');this.textContent='დაკოპირდა ✓'">
      ადმინ ბმულის კოპირება
    </button>

    <hr>
    <h2>მონაწილეები (${game.participants.length})</h2>
    ${rows}

    <hr>
    <h2>ადმინისტრაციის გადაცემა</h2>
    <p class="muted" style="margin-bottom:12px">
      ქვემოთ ღილაკზე დაჭერით შეიქმნება ახალი ადმინ ბმული და თქვენი ახლანდელი ბმული გაუქმდება.
      შემდეგ ახალი ბმული გაუგზავნეთ ახალ ადმინისტრატორს.
    </p>
    <form method="post" action="/admin/${game.adminToken}/transfer"
      onsubmit="return confirm('ნამდვილად გსურთ ადმინისტრაციის გადაცემა? თქვენი მიმდინარე ბმული გაუქმდება.')">
      <button type="submit">ადმინისტრაციის გადაცემა (ახალი ბმულის გენერაცია)</button>
    </form>`));
});

// Transfer admin (rotates token, invalidates old link)
app.post('/admin/:adminToken/transfer', async (req, res) => {
  const game = findGameByAdminToken(req.params.adminToken);
  if (!game) return res.status(404).send(layout('ვერ მოიძებნა', `
    <div class="err">არასწორი ადმინისტრატორის ბმული.</div>`));

  const oldToken = game.adminToken;
  game.adminToken = newToken();

  const ok = await persist();
  if (!ok) {
    game.adminToken = oldToken;
    return res.status(500).send(layout('შეცდომა', `
      <div class="err">გადაცემა ვერ მოხერხდა. სცადეთ თავიდან.</div>`));
  }

  res.redirect(`/admin/${game.adminToken}?transferred=1`);
});

// Participant reveal
app.get('/r/:token', async (req, res) => {
  const found = findParticipantByToken(req.params.token);
  if (!found) return res.status(404).send(layout('ვერ მოიძებნა', `
    <div class="err">ეს ბმული არ არის ვალიდური.</div>
    <p><a href="/">← მთავარი</a></p>`));

  const { game, participant } = found;
  const recipient = game.participants.find(p => p.id === game.assignments[participant.id]);

  if (req.query.reveal !== '1') {
    return res.send(layout('თქვენი დავალება', `
      <div class="banner">🎄 გილოცავთ ახალ წელს! 🎁</div>
      <h1 class="greet">${esc(game.title)}</h1>
      <p class="muted center">
        გამარჯობა, <strong>${esc(participant.name)}</strong>! მზად ხართ გაიგოთ ვის უნდა აჩუქოთ საჩუქარი?
      </p>
      <p class="center">
        <a href="/r/${participant.token}?reveal=1" style="font-size:18px;font-weight:700">
          ჩემი დავალების ნახვა →
        </a>
      </p>`));
  }

  const alreadyViewed = !!participant.viewedAt;
  if (!alreadyViewed) {
    participant.viewedAt = new Date().toISOString();
    await persist(); // mark as viewed; failure is non-critical
  }

  res.send(layout('თქვენი დავალება', `
    <div class="banner">🎄 გილოცავთ ახალ წელს! 🎁</div>
    <h1 class="greet">${esc(game.title)}</h1>
    <p class="muted center">
      <strong>${esc(participant.name)}</strong>, თქვენ საჩუქარს აძლევთ:
    </p>
    <div class="big">${esc(recipient.name)}</div>
    ${alreadyViewed ? '<p class="tag center">თქვენ უკვე გახსენით ეს ბმული ადრე.</p>' : ''}
    <p class="muted center">🤫 საიდუმლოდ შეინახეთ — და ნუ გახსნით ამ ბმულს მის თანდასწრებით.</p>
    <p class="muted center" style="margin-top:18px;font-size:14px">
      ბედნიერებას გისურვებთ ახალ წელს! ✨
    </p>`));
});

// Fallback
app.use((req, res) => res.status(404).send(layout('ვერ მოიძებნა', `
  <div class="err">გვერდი ვერ მოიძებნა.</div>
  <p><a href="/">← მთავარი</a></p>`)));

app.listen(PORT, () => console.log(`საიდუმლო სანტა მუშაობს: ${BASE_URL}`));