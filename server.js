// server.js — Surprise Santa (Upstash Redis + Georgian UI + admin hand-off + sharing)
import express from 'express';
import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

const redis = Redis.fromEnv();

app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

/* ---------------- storage (Upstash Redis) ---------------- */
let db = { games: {} };

async function loadDb() {
  try {
    const saved = await redis.get('santa:db');
    if (saved) db = saved;
  } catch (e) {
    console.warn('Redis load failed:', e.message);
  }
}
async function persist() {
  try {
    await redis.set('santa:db', db);
    return true;
  } catch (e) {
    console.error('Redis persist failed:', e.message);
    return false;
  }
}

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

function layout(title, body, extra = '') {
  return `<!doctype html><html lang="ka"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#1a0a2e">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;
  font:16px/1.55 "Noto Sans Georgian",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:#f0eaff;
  background:linear-gradient(160deg,#0d0620 0%,#1a0a2e 35%,#2a0d1a 70%,#0d0620 100%);
  background-attachment:fixed;
  overflow-x:hidden}

/* --- New Year atmosphere layers --- */
.bg-glow,.bg-stars,.bg-snow{position:fixed;inset:0;pointer-events:none;z-index:0}
.bg-glow{background:
  radial-gradient(900px 600px at 12% 8%, rgba(255,190,90,.13), transparent 60%),
  radial-gradient(700px 500px at 88% 92%, rgba(230,70,110,.13), transparent 60%),
  radial-gradient(500px 400px at 50% 50%, rgba(160,80,220,.08), transparent 70%)}
.bg-stars{
  background-image:
    radial-gradient(1px 1px at 20px 30px, #fff, transparent),
    radial-gradient(1px 1px at 80px 90px, #fff, transparent),
    radial-gradient(1.5px 1.5px at 140px 40px, #ffd166, transparent),
    radial-gradient(1px 1px at 200px 150px, #fff, transparent),
    radial-gradient(1px 1px at 60px 180px, #fff, transparent),
    radial-gradient(1.5px 1.5px at 250px 60px, #ffd166, transparent),
    radial-gradient(1px 1px at 300px 210px, #fff, transparent);
  background-size:340px 260px;background-repeat:repeat;
  animation:twinkle 4s ease-in-out infinite alternate;opacity:.75}
@keyframes twinkle{from{opacity:.4}to{opacity:.95}}
.bg-snow::before,.bg-snow::after{content:'';position:absolute;inset:0;background-repeat:repeat}
.bg-snow::before{
  background-image:
    radial-gradient(2px 2px at 20px 30px, rgba(255,255,255,.9), transparent),
    radial-gradient(1.5px 1.5px at 60px 80px, rgba(255,255,255,.75), transparent),
    radial-gradient(2px 2px at 100px 50px, rgba(255,255,255,.85), transparent),
    radial-gradient(1px 1px at 150px 120px, rgba(255,255,255,.65), transparent),
    radial-gradient(2.5px 2.5px at 220px 40px, rgba(255,255,255,.8), transparent),
    radial-gradient(1.5px 1.5px at 280px 160px, rgba(255,255,255,.7), transparent);
  background-size:320px 200px;
  animation:snow-fall 12s linear infinite}
.bg-snow::after{
  background-image:
    radial-gradient(1px 1px at 40px 20px, rgba(255,255,255,.6), transparent),
    radial-gradient(1.5px 1.5px at 120px 90px, rgba(255,255,255,.5), transparent),
    radial-gradient(1px 1px at 200px 40px, rgba(255,255,255,.55), transparent),
    radial-gradient(1px 1px at 260px 140px, rgba(255,255,255,.5), transparent),
    radial-gradient(1.5px 1.5px at 340px 100px, rgba(255,255,255,.55), transparent);
  background-size:380px 240px;
  animation:snow-fall 20s linear infinite;opacity:.7}
@keyframes snow-fall{from{background-position:0 0}to{background-position:0 200px}}

/* --- Card --- */
main{position:relative;z-index:1;width:100%;max-width:680px;
  background:rgba(26,14,40,.82);border:1px solid rgba(90,55,105,.55);
  border-radius:20px;padding:28px;
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  box-shadow:0 30px 80px rgba(0,0,0,.55);
  overflow:hidden}
main::before{content:'';position:absolute;top:0;left:20px;right:20px;height:2px;
  background:linear-gradient(90deg,transparent,#ffd166,#e23b3b,#ffd166,transparent);
  border-radius:0 0 2px 2px;opacity:.85}
h1{margin:0 0 8px;font-size:26px;line-height:1.3}
h1.greet{text-align:center;
  background:linear-gradient(90deg,#ffd166,#f08a5d,#ffd166);
  -webkit-background-clip:text;background-clip:text;color:transparent}
h2{font-size:18px;margin:0 0 14px}
h3{margin:0 0 8px;font-size:18px}
.muted{color:#b3a8c9;margin:0 0 20px}
.banner{display:block;text-align:center;font-size:14px;color:#ffd166;
  margin:0 0 18px;letter-spacing:.4px}
label{display:block;margin:0 0 16px;font-size:14px;color:#c3b8d9}
input,textarea{width:100%;margin-top:6px;padding:12px 14px;border-radius:12px;
  border:1px solid #3a2848;background:#140b1f;color:#f0eaff;font:inherit}
input:focus,textarea:focus{outline:none;border-color:#e23b3b;
  box-shadow:0 0 0 3px rgba(226,59,59,.18)}
textarea{resize:vertical;min-height:180px}
button{padding:13px 20px;border:0;border-radius:12px;
  background:linear-gradient(180deg,#e23b3b,#b81f2f);color:#fff;font-weight:700;
  font-size:15px;cursor:pointer;font-family:inherit;
  box-shadow:0 6px 18px rgba(226,59,59,.35);transition:transform .05s}
button:hover{filter:brightness(1.08)}
button:active{transform:translateY(1px)}
button.secondary{background:#2a1d3f;box-shadow:none;color:#f0eaff;font-weight:600}
a{color:#8fbcff;word-break:break-all;text-decoration:none}
a:hover{text-decoration:underline}
.row{display:flex;gap:12px;align-items:center;justify-content:space-between;
  padding:12px 14px;border:1px solid #3a2848;border-radius:12px;margin-bottom:10px;
  background:rgba(20,11,31,.55);flex-wrap:wrap}
.row .info{flex:1;min-width:0}
.row .actions{display:flex;gap:8px;flex-wrap:wrap}
.name{font-weight:700;margin-bottom:4px}
.tag{font-size:12px;color:#9d92b5;margin-top:4px}
.big{font-size:34px;font-weight:800;color:#ffd166;margin:18px 0;text-align:center;
  text-shadow:0 0 30px rgba(255,209,102,.4)}
.center{text-align:center}
.err{background:#3b1620;border:1px solid #6b2436;color:#ffc9d3;padding:12px 16px;
  border-radius:12px;margin-bottom:16px}
.ok{background:#12341f;border:1px solid #1f6b3a;color:#baf5cf;padding:12px 16px;
  border-radius:12px;margin-bottom:16px}
.url{display:block;padding:10px 12px;background:#140b1f;border:1px dashed #3a2848;
  border-radius:10px;word-break:break-all;font-family:ui-monospace,monospace;
  font-size:13px;color:#a8c8ff;margin:8px 0}
hr{border:0;border-top:1px solid #3a2848;margin:22px 0}

/* --- Share modal --- */
.modal{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px}
.modal[hidden]{display:none}
.modal-bg{position:absolute;inset:0;background:rgba(10,4,18,.7);
  backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.modal-card{position:relative;width:100%;max-width:400px;background:#1e1330;
  border:1px solid #3a2848;border-radius:18px;padding:22px;
  box-shadow:0 25px 70px rgba(0,0,0,.6);max-height:calc(100vh - 40px);overflow-y:auto}
.modal-card a,.modal-card button{display:flex;align-items:center;gap:12px;width:100%;
  padding:12px 16px;margin-bottom:8px;border-radius:10px;border:1px solid #3a2848;
  background:#140b1f;color:#f0eaff;text-decoration:none;font-family:inherit;
  font-size:15px;cursor:pointer;text-align:left;font-weight:500}
.modal-card a:hover,.modal-card button:hover{background:#2a1d3f}
.modal-card .close-x{position:absolute;top:14px;right:16px;width:32px;height:32px;
  padding:0;display:grid;place-items:center;background:transparent;border:0;
  font-size:20px;color:#b3a8c9;box-shadow:none;border-radius:50%}
.modal-card .close-x:hover{background:#2a1d3f;color:#f0eaff}

@media (prefers-reduced-motion: reduce){
  .bg-stars,.bg-snow::before,.bg-snow::after{animation:none}
}
@media (max-width:480px){
  main{padding:22px 18px;border-radius:16px}
  h1{font-size:22px}
  .big{font-size:28px}
  .row .actions{width:100%}
  .row .actions button{flex:1}
}
</style></head><body>
<div class="bg-glow"></div>
<div class="bg-stars"></div>
<div class="bg-snow"></div>
<main>${body}</main>
${extra}
</body></html>`;
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

app.get('/admin/:adminToken', (req, res) => {
  const game = findGameByAdminToken(req.params.adminToken);
  if (!game) return res.status(404).send(layout('ვერ მოიძებნა', `
    <div class="err">არასწორი ადმინისტრატორის ბმული.</div>
    <p><a href="/">← მთავარი</a></p>`));

  const adminUrl = `${BASE_URL}/admin/${game.adminToken}`;

  const rows = game.participants.map(p => {
    const url = `${BASE_URL}/r/${p.token}`;
    return `
    <div class="row">
      <div class="info">
        <div class="name">${esc(p.name)}</div>
        <a href="${url}">${url}</a>
        <div class="tag">${p.viewedAt ? '👀 ნანახია' : 'ჯერ არ გახსნილა'}</div>
      </div>
      <div class="actions">
        <button type="button" class="secondary copy-btn" data-url="${url}">კოპირება</button>
        <button type="button" class="share-btn"
          data-name="${esc(p.name)}"
          data-url="${url}"
          data-title="${esc(game.title)}">გაზიარება</button>
      </div>
    </div>`;
  }).join('');

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

  const body = `
    <div class="banner">🎄 გილოცავთ ახალ წელს! 🎁</div>
    <h1>${esc(game.title)}</h1>
    <p class="muted">გაუგზავნეთ თითოეულ მონაწილეს <strong>მხოლოდ მისი</strong> პირადი ბმული.</p>
    ${banner}

    <label style="font-size:13px;color:#c3b8d9">ადმინისტრატორის ბმული
      <span class="url">${esc(adminUrl)}</span>
    </label>
    <button type="button" class="secondary copy-btn" data-url="${adminUrl}">
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
    </form>`;

  const extra = `
<div id="share-modal" class="modal" hidden>
  <div class="modal-bg" data-close></div>
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
    <button type="button" class="close-x" data-close aria-label="დახურვა">✕</button>
    <h3 id="share-modal-title">გაზიარება</h3>
    <p class="muted" style="font-size:14px;margin-bottom:16px">
      გაუგზავნეთ პირადი ბმული <strong id="share-name"></strong>
    </p>
    <a id="share-wa" target="_blank" rel="noopener">📱 WhatsApp</a>
    <a id="share-tg" target="_blank" rel="noopener">✈️ Telegram</a>
    <a id="share-vb">💜 Viber</a>
    <a id="share-sms">💬 SMS</a>
    <a id="share-em">✉️ Email</a>
    <button type="button" class="secondary" id="share-copy">📋 ბმულის კოპირება</button>
  </div>
</div>
<script>
(function(){
  function copyText(text){
    if(navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve,reject){
      var ta=document.createElement('textarea');
      ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.focus();ta.select();
      try{document.execCommand('copy');resolve();}catch(e){reject(e);}
      document.body.removeChild(ta);
    });
  }

  document.querySelectorAll('.copy-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      copyText(btn.dataset.url).then(function(){
        var orig=btn.textContent;
        btn.textContent='დაკოპირდა ✓';
        setTimeout(function(){btn.textContent=orig;},1600);
      }).catch(function(){alert('ბმულის კოპირება ვერ მოხერხდა');});
    });
  });

  var modal=document.getElementById('share-modal');
  var shareName=document.getElementById('share-name');
  var shareWa=document.getElementById('share-wa');
  var shareTg=document.getElementById('share-tg');
  var shareVb=document.getElementById('share-vb');
  var shareSms=document.getElementById('share-sms');
  var shareEm=document.getElementById('share-em');
  var shareCopy=document.getElementById('share-copy');
  var currentUrl='';

  function buildText(name,title){
    return 'გამარჯობა, '+name+'! 🎄 გილოცავთ ახალ წელს! 🎁\\n\\n'+
      'თქვენ ხართ „'+title+'" თამაშის მონაწილე. გთხოვთ გახსენით ეს პირადი ბმული, რომ გაიგოთ ვის უნდა აჩუქოთ საჩუქარი.\\n\\n'+
      '🤫 საიდუმლოდ შეინახეთ — ნუ გახსნით ბმულს სხვების თანდასწრებით!';
  }

  function openModal(name,url,title){
    currentUrl=url;
    shareName.textContent=name;
    var text=buildText(name,title);
    var full=text+'\\n\\n'+url;
    shareWa.href='https://wa.me/?text='+encodeURIComponent(full);
    shareTg.href='https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(text);
    shareVb.href='viber://forward?text='+encodeURIComponent(full);
    shareSms.href='sms:?&body='+encodeURIComponent(full);
    shareEm.href='mailto:?subject='+encodeURIComponent(title+' — საიდუმლო სანტა')+'&body='+encodeURIComponent(full);
    modal.hidden=false;
    document.body.style.overflow='hidden';
  }

  function closeModal(){
    modal.hidden=true;
    document.body.style.overflow='';
  }

  document.querySelectorAll('[data-close]').forEach(function(el){
    el.addEventListener('click',closeModal);
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape' && !modal.hidden) closeModal();
  });

  modal.querySelectorAll('a[href]').forEach(function(a){
    a.addEventListener('click',function(){setTimeout(closeModal,150);});
  });

  shareCopy.addEventListener('click',function(){
    copyText(currentUrl).then(function(){
      var orig=shareCopy.textContent;
      shareCopy.textContent='დაკოპირდა ✓';
      setTimeout(function(){shareCopy.textContent=orig;},1600);
    }).catch(function(){});
  });

  document.querySelectorAll('.share-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      var name=btn.dataset.name, url=btn.dataset.url, title=btn.dataset.title;
      var text=buildText(name,title);
      if(navigator.share){
        navigator.share({title:title,text:text+'\\n\\n'+url}).catch(function(err){
          if(err && err.name==='AbortError') return;
          openModal(name,url,title);
        });
        return;
      }
      openModal(name,url,title);
    });
  });
})();
</script>`;

  res.send(layout('ბმულები — ' + game.title, body, extra));
});

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
        <a href="/r/${participant.token}?reveal=1"
          style="font-size:18px;font-weight:700;display:inline-block;padding:14px 22px;
          background:linear-gradient(180deg,#e23b3b,#b81f2f);color:#fff;border-radius:12px;
          box-shadow:0 6px 18px rgba(226,59,59,.35);text-decoration:none">
          ჩემი დავალების ნახვა →
        </a>
      </p>`));
  }

  const alreadyViewed = !!participant.viewedAt;
  if (!alreadyViewed) {
    participant.viewedAt = new Date().toISOString();
    await persist();
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

app.use((req, res) => res.status(404).send(layout('ვერ მოიძებნა', `
  <div class="err">გვერდი ვერ მოიძებნა.</div>
  <p><a href="/">← მთავარი</a></p>`)));

app.listen(PORT, () => console.log(`საიდუმლო სანტა მუშაობს: ${BASE_URL}`));