// server.js — Surprise Santa (Local Image + Admin Tools)
import express from 'express';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Redis } from '@upstash/redis';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

const redis = Redis.fromEnv();

app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.get('/bg.jpg', (req, res) => res.sendFile(fileURLToPath(new URL('./bg.jpg', import.meta.url))));

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

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

app.get('/manifest.webmanifest', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/manifest+json').send(JSON.stringify({
    id: '/',
    name: 'საიდუმლო სანტა',
    short_name: 'სანტა',
    description: 'შექმენი გათამაშება და გაიგე, ვის უნდა აჩუქო.',
    start_url: '/?tab=home',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#07152b',
    theme_color: '#07152b',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
  }));
});

app.get('/icon.svg', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#07152b"/><path d="M94 222h324v218H94z" fill="#d6a23f" stroke="#ffe2a0" stroke-width="18"/><path d="M70 176h372v82H70z" fill="#f0c15c" stroke="#ffe2a0" stroke-width="18"/><path d="M235 176h42v264h-42z" fill="#fff0c2"/><path d="M256 176c-95-14-117-91-67-113 42-19 67 44 67 113zm0 0c95-14 117-91 67-113-42-19-67 44-67 113z" fill="none" stroke="#ffe2a0" stroke-width="23" stroke-linecap="round" stroke-linejoin="round"/><path d="M153 324h56m94 0h56" stroke="#fff0c2" stroke-width="16" stroke-linecap="round"/></svg>');
});

app.get('/sw.js', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.set('Service-Worker-Allowed', '/');
  res.type('application/javascript').send(`const CACHE='secret-santa-static-v1';
const ASSETS=['/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(ASSETS.includes(url.pathname)){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
  }
});`);
});

app.use(async (req, res, next) => {
  await loadDb();
  next();
});

/* ---------------- helpers ---------------- */
const newToken = () => crypto.randomBytes(16).toString('base64url');

function organizerCodeMatches(candidate) {
  const configured = process.env.ORGANIZER_ACCESS_CODE;
  if (typeof configured !== 'string' || configured.length === 0) return false;
  if (typeof candidate !== 'string') return false;
  const expected = Buffer.from(configured, 'utf8');
  const supplied = Buffer.from(candidate, 'utf8');
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}
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
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="theme-color" content="#07152b">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon.svg">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
html{background:#1a0f2e url('/bg.jpg') center top / cover no-repeat;background-attachment:scroll}
html,body{margin:0;padding:0;min-height:100vh;
  font:16px/1.55 "Noto Sans Georgian",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:#f0eaff;
  background-color:transparent;
  overflow-x:hidden;
  -webkit-tap-highlight-color: transparent;
}

/* Background: CSS layer is more reliable than a fixed IMG on mobile browsers */
body{position:relative;isolation:isolate}
.bg-image {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  background-image: url('/bg.jpg');
  background-position: center center;
  background-size: cover;
  background-repeat: no-repeat;
  z-index: 0;
  pointer-events: none;
}

/* Overlay sits above the image and below all page content */
.bg-overlay {
  position: fixed;
  inset: 0;
  background: linear-gradient(to bottom, rgba(10,15,30,0.18) 0%, rgba(10,15,30,0.48) 55%, rgba(10,15,30,0.72) 100%);
  z-index: 0;
  pointer-events: none;
}

/* Animated snow */
.snow-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.snow-layer::after {
  content: '';
  position: absolute;
  top: -2000px; left: 0; right: 0; bottom: 0;
  background-image:
    radial-gradient(3px 3px at 20px 30px, #fff, transparent),
    radial-gradient(2px 2px at 80px 90px, rgba(255,255,255,.8), transparent),
    radial-gradient(4px 4px at 140px 40px, #fff, transparent),
    radial-gradient(2px 2px at 200px 150px, rgba(255,255,255,.7), transparent),
    radial-gradient(3px 3px at 260px 60px, #fff, transparent);
  background-size: 300px 300px;
  background-repeat: repeat;
  animation: snow-fall 12s linear infinite;
}
@keyframes snow-fall {
  from { transform: translateY(0); }
  to { transform: translateY(2000px); }
}

/* App Layout */
body{display:grid;place-items:center;padding:20px 20px 110px}
main{position:relative;z-index:1;width:100%;max-width:480px;
  background:rgba(20,25,45,0.85);
  border:1px solid rgba(255,255,255,0.15);
  border-radius:24px;padding:24px;
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  box-shadow:0 25px 50px rgba(0,0,0,.6);
  overflow:hidden;
  margin:auto;
  min-height:85vh;
  display:flex;flex-direction:column;justify-content:center}
main::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,#ffd166,#e23b3b,#ffd166);opacity:.9}

h1{margin:0 0 8px;font-size:26px;line-height:1.3;text-shadow:0 2px 10px rgba(0,0,0,0.5)}
h1.greet{text-align:center;background:linear-gradient(90deg,#ffd166,#f08a5d,#ffd166);
  -webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none}
h2{font-size:18px;margin:0 0 14px}
h3{margin:0 0 8px;font-size:18px}
.muted{color:#cbd5e1;margin:0 0 20px;text-shadow:0 1px 4px rgba(0,0,0,0.5)}
.banner{display:block;text-align:center;font-size:14px;color:#ffd166;
  margin:0 0 18px;letter-spacing:.4px;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.5)}

label{display:block;margin:0 0 16px;font-size:14px;color:#cbd5e1}
input,textarea{width:100%;margin-top:6px;padding:14px;border-radius:14px;
  border:1px solid rgba(255,255,255,0.1);background:rgba(10,15,30,0.6);color:#fff;font:inherit}
input:focus,textarea:focus{outline:none;border-color:#ffd166;
  box-shadow:0 0 0 3px rgba(255,209,102,.2)}
textarea{resize:vertical;min-height:140px}

button{padding:16px 20px;border:0;border-radius:14px;
  background:linear-gradient(180deg,#e23b3b,#b81f2f);color:#fff;font-weight:700;
  font-size:16px;cursor:pointer;font-family:inherit;
  box-shadow:0 8px 20px rgba(226,59,59,.4);transition:transform .05s;width:100%}
button:hover{filter:brightness(1.1)}
button:active{transform:translateY(2px)}
button.secondary{background:rgba(255,255,255,0.1);box-shadow:none;color:#fff;
  border:1px solid rgba(255,255,255,0.2);font-weight:600;padding:12px 20px}
button.secondary:hover{background:rgba(255,255,255,0.15)}
button.danger{background:rgba(226,59,59,0.15);color:#ff8b8b;border:1px solid rgba(226,59,59,0.3)}
button.danger:hover{background:rgba(226,59,59,0.25)}

a{color:#8fbcff;word-break:break-all;text-decoration:none}
a:hover{text-decoration:underline}

.row{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;
  padding:14px;border:1px solid rgba(255,255,255,0.12);border-radius:16px;margin-bottom:12px;
  background:rgba(5,12,28,0.72)}
.row .info{min-width:0}
.row .participant-link{display:inline-flex;align-items:center;margin-top:9px;padding:8px 11px;
  border-radius:9px;background:rgba(143,188,255,0.12);font-size:13px;word-break:normal}
.row .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%}
.row .actions button{width:100%;padding:11px 8px;font-size:13px}
.row .actions form{grid-column:1/-1}
.row .actions form button{background:rgba(226,59,59,0.12);box-shadow:none}
.name{font-weight:700;margin-bottom:4px;font-size:16px}
.tag{font-size:12px;color:#9ca3af;margin-top:4px}
.big{font-size:36px;font-weight:800;color:#ffd166;margin:24px 0;text-align:center;
  text-shadow:0 0 30px rgba(255,209,102,.6)}
.center{text-align:center}
.err{background:rgba(59,22,32,0.8);border:1px solid #6b2436;color:#ffc9d3;padding:14px;
  border-radius:14px;margin-bottom:16px}
.ok{background:rgba(18,52,31,0.8);border:1px solid #1f6b3a;color:#baf5cf;padding:14px;
  border-radius:14px;margin-bottom:16px}
.url{display:block;padding:10px 12px;background:rgba(0,0,0,0.4);border:1px dashed rgba(255,255,255,0.2);
  border-radius:10px;word-break:break-all;font-family:ui-monospace,monospace;
  font-size:13px;color:#a8c8ff;margin:8px 0}
hr{border:0;border-top:1px solid rgba(255,255,255,0.1);margin:24px 0}

/* Share modal */
.modal{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px}
.modal[hidden]{display:none}
.modal-bg{position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)}
.modal-card{position:relative;width:100%;max-width:400px;background:rgba(20,25,45,0.95);
  border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:24px;
  box-shadow:0 25px 70px rgba(0,0,0,.8);max-height:calc(100vh - 40px);overflow-y:auto}
.modal-card a,.modal-card button{display:flex;align-items:center;gap:12px;width:100%;
  padding:14px 16px;margin-bottom:10px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);
  background:rgba(255,255,255,0.05);color:#fff;text-decoration:none;font-family:inherit;
  font-size:15px;cursor:pointer;text-align:left;font-weight:500}
.modal-card a:hover,.modal-card button:hover{background:rgba(255,255,255,0.1)}
.modal-card .close-x{position:absolute;top:14px;right:16px;width:32px;height:32px;padding:0;
  display:grid;place-items:center;background:transparent;border:0;font-size:20px;color:#9ca3af;border-radius:50%;width:auto}

@media (max-width:480px){
  body{padding:0 0 88px;place-items:end center}
  main{border-radius:24px 24px 0 0;padding:28px 20px;min-height:90vh;border-bottom:none}
  h1{font-size:22px}
  .big{font-size:32px}
  .row .actions{width:100%}
  .row .actions button{flex:initial}
}
.bottom-nav{position:fixed;z-index:80;left:50%;bottom:0;transform:translateX(-50%);width:min(100%,520px);display:grid;grid-template-columns:repeat(4,1fr);gap:2px;padding:9px 8px calc(10px + env(safe-area-inset-bottom));background:rgba(5,13,29,.96);border-top:1px solid rgba(255,209,102,.25);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.bottom-nav a{display:flex;flex-direction:column;align-items:center;gap:2px;color:#aebbd0;font-size:11px;line-height:1.3;word-break:normal;text-decoration:none;padding:4px 2px}
.bottom-nav a span{font-size:20px;line-height:1.2}
.bottom-nav a.active{color:#ffd166}
.app-heading{font-size:30px;text-align:center;margin:8px 0 10px;color:#ffd166}
.app-intro{text-align:center;color:#cbd5e1;margin:0 0 20px}
.app-card{background:rgba(5,15,34,.72);border:1px solid rgba(255,209,102,.24);border-radius:18px;padding:18px;margin:14px 0}
.app-card h2{color:#ffd166}
.app-card p{color:#cbd5e1}
.app-cta{display:block;text-align:center;padding:15px 18px;border-radius:14px;background:linear-gradient(180deg,#e7b84d,#c58a22);color:#111827;font-weight:800;text-decoration:none;margin:12px 0}
.app-link-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;margin:10px 0;background:rgba(0,0,0,.22)}
.app-link-row a{display:block;min-width:0;overflow-wrap:anywhere}
.install-btn{background:linear-gradient(180deg,#e7b84d,#c58a22);color:#111827;box-shadow:none;margin-top:10px}
.profile-input{margin:0 0 12px}
</style></head><body>

<!-- THIS LOADS YOUR LOCAL IMAGE -->
<div class="bg-image" aria-hidden="true"></div>
<div class="bg-overlay"></div>
<div class="snow-layer"></div>

<main>${body}</main>
${extra}
<nav class="bottom-nav" aria-label="Main navigation">
  <a href="/?tab=home" data-tab="home"><span>⌂</span>მთავარი</a>
  <a href="/?tab=exchanges" data-tab="exchanges"><span>▦</span>გათამაშებები</a>
</nav>
<script>
(function(){
  var path=window.location.pathname;
  function read(key){try{return JSON.parse(localStorage.getItem(key)||'[]')}catch(e){return []}}
  function save(key,item){
    var items=read(key).filter(function(x){return x.url!==item.url});
    items.unshift(item);
    localStorage.setItem(key,JSON.stringify(items.slice(0,30)));
  }
  if(path.indexOf('/admin/')===0){
    save('ss_exchanges',{title:(document.querySelector('main h1')||{}).textContent||'საიდუმლო სანტა',url:path});
  }
  var tab=new URLSearchParams(window.location.search).get('tab')||'home';
  document.querySelectorAll('.bottom-nav a').forEach(function(a){
    if(a.dataset.tab===tab && path==='/') a.classList.add('active');
    if(path.indexOf('/admin/')===0 && a.dataset.tab==='exchanges') a.classList.add('active');
  });
  function renderList(id,key,empty,label){
    var box=document.getElementById(id); if(!box) return;
    var items=read(key);
    if(!items.length){box.textContent=empty;return;}
    items.forEach(function(item){
      var row=document.createElement('div');row.className='app-link-row';
      var name=document.createElement('strong');name.textContent=item.title||label;
      var link=document.createElement('a');link.href=item.url;link.textContent='გახსნა →';
      row.appendChild(name);row.appendChild(link);box.appendChild(row);
    });
  }
  renderList('saved-exchanges','ss_exchanges','ჯერ გათამაშება არ შეგიქმნია.','საიდუმლო სანტა');
  var profile=document.getElementById('profile-name');
  if(profile) profile.value=localStorage.getItem('ss_profile_name')||'';
  var saveProfile=document.getElementById('save-profile');
  if(saveProfile) saveProfile.addEventListener('click',function(){
    if(profile) localStorage.setItem('ss_profile_name',profile.value.trim());
    saveProfile.textContent='შენახულია ✓';
  });
  var clear=document.getElementById('clear-local-data');
  if(clear) clear.addEventListener('click',function(){
    localStorage.removeItem('ss_exchanges');localStorage.removeItem('ss_gifts');
    var a=document.getElementById('saved-exchanges');var b=document.getElementById('saved-gifts');
    if(a)a.textContent='ჯერ გათამაშება არ შეგიქმნია.';
    if(b)b.textContent='პირადი ბმული ჯერ არ გაგიხსნია.';
  });
  var install=document.getElementById('install-app');
  var deferred=null;
  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();deferred=e;if(install)install.hidden=false;
  });
  if(install){
    var ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
    install.hidden=!ios;
    install.addEventListener('click',async function(){
      if(deferred){deferred.prompt();await deferred.userChoice;deferred=null;}
      else if(ios){alert('Safari-ში დააჭირე გაზიარების ღილაკს და აირჩიე „მთავარ ეკრანზე დამატება“.');}
    });
  }
  if('serviceWorker' in navigator){
    window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});
  }
})();
</script>
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
  const tab = ['home', 'exchanges'].includes(req.query.tab) ? req.query.tab : 'home';
  if (tab === 'exchanges') {
    return res.send(layout('ჩემი გათამაშებები', `
      <div class="banner">🎄 საიდუმლო სანტა</div>
      <h1 class="app-heading">ჩემი გათამაშებები</h1>
      <p class="app-intro">შენ მიერ შექმნილი გათამაშებები.</p>
      <section class="app-card"><h2>შენი გათამაშებები</h2><div id="saved-exchanges">იტვირთება…</div></section>
      <p class="muted center" style="font-size:13px">ბმულები ინახება ამ მოწყობილობაზე.</p>
      <a class="app-cta" href="/">ახალი გათამაშების შექმნა</a>`));
  }
  res.send(layout('საიდუმლო სანტა', `
    <div class="banner">🎄 გაუზიარე სიხარული მეგობრებს 🎁</div>
    <h1 class="app-heading">საიდუმლო სანტა</h1>
    <p class="app-intro">ორგანიზატორი ქმნის გათამაშებას და მონაწილეებს უგზავნის პირად ბმულებს.</p>
    <section class="app-card">
      <h2>ორგანიზატორის წვდომა</h2>
      <form method="post" action="/create">
        <label>ორგანიზატორის კოდი
          <input type="password" name="organizerCode" maxlength="128" required autocomplete="off" placeholder="შეიყვანეთ ორგანიზატორის კოდი">
        </label>
        <label>გათამაშების სახელი
          <input name="title" maxlength="80" placeholder="მაგ. მეგობრების ახალი წელი">
        </label>
        <label>მონაწილეები — თითო სახელი ცალკე ხაზზე
          <textarea name="names" required placeholder="ანა\nდავითი\nსოფო"></textarea>
        </label>
        <button type="submit">გათამაშების შექმნა</button>
      </form>
    </section>
    <p class="muted center" style="font-size:13px">მონაწილეებს კოდი არ სჭირდებათ — მათ მხოლოდ პირადი ბმული უნდა გამოიყენონ.</p>
    `));
});

app.post('/create', async (req, res) => {
  if (typeof process.env.ORGANIZER_ACCESS_CODE !== 'string' || process.env.ORGANIZER_ACCESS_CODE.length === 0) {
    return res.status(503).send(layout('ორგანიზატორის წვდომა მიუწვდომელია', `
      <div class="err">ორგანიზატორის კოდი ჯერ არ არის დაყენებული. გთხოვთ, დაუკავშირდეთ აპლიკაციის ადმინისტრატორს.</div>
      <p><a href="/">← მთავარი</a></p>`));
  }
  if (!organizerCodeMatches(req.body.organizerCode)) {
    return res.status(403).send(layout('წვდომა შეზღუდულია', `
      <div class="err">ორგანიზატორის კოდი არასწორია. გათამაშების შექმნა მხოლოდ ორგანიზატორს შეუძლია.</div>
      <p><a href="/">← სცადეთ თავიდან</a></p>`));
  }
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
    id: newToken(), title, adminToken: newToken(),
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
        <div class="tag">${p.viewedAt ? '👀 ნანახია' : 'ჯერ არ გახსნილა'}</div>
        <a class="participant-link" href="${url}" target="_blank" rel="noopener">პირადი ბმულის გახსნა ↗</a>
      </div>
      <div class="actions">
        <button type="button" class="secondary copy-btn" data-url="${url}">ბმულის კოპირება</button>
        <button type="button" class="share-btn" data-name="${esc(p.name)}" data-url="${url}" data-title="${esc(game.title)}">გაზიარება</button>
        <form method="POST" action="/admin/${game.adminToken}/delete/${p.id}" style="margin:0;" onsubmit="return confirm('ნამდვილად გსურთ ${esc(p.name)}-ის წაშლა? თამაში ავტომატურად გადათამაშდება.')">
          <button type="submit" class="danger">მონაწილის წაშლა</button>
        </form>
      </div>
    </div>`;
  }).join('');

  let banner = '';
  if (req.query.transferred === '1') {
    banner = `<div class="ok">ადმინისტრაცია წარმატებით გადაეცა. გაუგზავნეთ ეს ახალი ბმული ახალ ადმინისტრატორს:<br><span class="url">${esc(adminUrl)}</span>თქვენი წინა ადმინ ბმული აღარ მუშაობს.</div>`;
  } else if (req.query.created === '1') {
    banner = `<div class="ok">თამაში შეიქმნა! შეინახეთ ეს გვერდი — ეს ერთადერთი გზაა ბმულებთან დასაბრუნებლად.</div>`;
  } else if (req.query.regenerated === '1') {
    banner = `<div class="ok">ყველა ბმული წარმატებით განახლდა! ძველი ბმულები აღარ მუშაობს.</div>`;
  }

  const body = `
    <div class="banner">🎄 გილოცავთ ახალ წელს! 🎁</div>
    <h1>${esc(game.title)}</h1>
    <p class="muted">გაუგზავნეთ თითოეულ მონაწილეს <strong>მხოლოდ მისი</strong> პირადი ბმული.</p>
    ${banner}

    <label style="font-size:13px;color:#c3b8d9">ადმინისტრატორის ბმული
      <span class="url">${esc(adminUrl)}</span>
    </label>
    <button type="button" class="secondary copy-btn" data-url="${adminUrl}">ადმინ ბმულის კოპირება</button>

    <hr>
    <h2>მონაწილეები (${game.participants.length})</h2>
    ${rows}

    <hr>
    <h2>მართვა</h2>
    <p class="muted" style="margin-bottom:12px;font-size:14px">
      თუ ტესტირების დროს ბმულები გააზიარეთ ან რაღაც შეიცვალა, შეგიძლიათ ყველა ბმული ერთდროულად განაახლოთ.
    </p>
    <form method="post" action="/admin/${game.adminToken}/regenerate" onsubmit="return confirm('ნამდვილად გსურთ ყველა ბმულის განახლება? ძველი ბმულები გაუქმდება.')" style="margin-bottom:16px;">
      <button type="submit" class="secondary">ყველა ბმულის განახლება (გადათამაშება)</button>
    </form>

    <h2>ადმინისტრაციის გადაცემა</h2>
    <p class="muted" style="margin-bottom:12px;font-size:14px">
      შეიქმნება ახალი ადმინ ბმული და თქვენი ახლანდელი ბმული გაუქმდება.
    </p>
    <form method="post" action="/admin/${game.adminToken}/transfer" onsubmit="return confirm('ნამდვილად გსურთ ადმინისტრაციის გადაცემა?')">
      <button type="submit" class="secondary">ადმინისტრაციის გადაცემა</button>
    </form>`;

  const extra = `
<div id="share-modal" class="modal" hidden>
  <div class="modal-bg" data-close></div>
  <div class="modal-card" role="dialog" aria-modal="true">
    <button type="button" class="close-x" data-close aria-label="დახურვა">✕</button>
    <h3>გაზიარება</h3>
    <p class="muted" style="font-size:14px;margin-bottom:16px">გაუგზავნეთ პირადი ბმული <strong id="share-name"></strong></p>
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
    if(navigator.clipboard && window.isSecureContext){ return navigator.clipboard.writeText(text); }
    return new Promise(function(resolve,reject){
      var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.focus();ta.select();
      try{document.execCommand('copy');resolve();}catch(e){reject(e);}
      document.body.removeChild(ta);
    });
  }
  
  document.querySelectorAll('.copy-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      var btnEl = this;
      copyText(btnEl.dataset.url).then(function(){
        var orig=btnEl.textContent; btnEl.textContent='დაკოპირდა ✓';
        setTimeout(function(){btnEl.textContent=orig;},1600);
      }).catch(function(){alert('ბმულის კოპირება ვერ მოხერხდა');});
    });
  });

  var modal=document.getElementById('share-modal');
  var shareName=document.getElementById('share-name');
  var currentUrl='';
  function buildText(name,title){
    return 'გამარჯობა, '+name+'! 🎄 გილოცავთ ახალ წელს! 🎁\\n\\n'+
      'თქვენ ხართ „'+title+'" თამაშის მონაწილე. გთხოვთ გახსენით ეს პირადი ბმული, რომ გაიგოთ ვის უნდა აჩუქოთ საჩუქარი.\\n\\n'+
      '🤫 საიდუმლოდ შეინახეთ — ნუ გახსნით ბმულს სხვების თანდასწრებით!';
  }
  function openModal(name,url,title){
    currentUrl=url; shareName.textContent=name;
    var text=buildText(name,title); var full=text+'\\n\\n'+url;
    document.getElementById('share-wa').href='https://wa.me/?text='+encodeURIComponent(full);
    document.getElementById('share-tg').href='https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(text);
    document.getElementById('share-vb').href='viber://forward?text='+encodeURIComponent(full);
    document.getElementById('share-sms').href='sms:?&body='+encodeURIComponent(full);
    document.getElementById('share-em').href='mailto:?subject='+encodeURIComponent(title+' — საიდუმლო სანტა')+'&body='+encodeURIComponent(full);
    modal.hidden=false; document.body.style.overflow='hidden';
  }
  function closeModal(){ modal.hidden=true; document.body.style.overflow=''; }
  document.querySelectorAll('[data-close]').forEach(function(el){ el.addEventListener('click',closeModal); });
  document.querySelectorAll('.share-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      var name=btn.dataset.name, url=btn.dataset.url, title=btn.dataset.title;
      var text=buildText(name,title);
      if(navigator.share){
        navigator.share({title:title,text:text+'\\n\\n'+url}).catch(function(err){
          if(err && err.name==='AbortError') return; openModal(name,url,title);
        }); return;
      }
      openModal(name,url,title);
    });
  });
  
  var copyBtn = document.getElementById('share-copy');
  if(copyBtn) {
    copyBtn.addEventListener('click',function(){
      var btnEl = this;
      copyText(currentUrl).then(function(){
        var orig=btnEl.textContent; btnEl.textContent='დაკოპირდა ✓';
        setTimeout(function(){btnEl.textContent=orig;},1600);
      });
    });
  }
})();
</script>`;

  res.send(layout('ბმულები — ' + game.title, body, extra));
});

app.post('/admin/:adminToken/delete/:participantId', async (req, res) => {
  const game = findGameByAdminToken(req.params.adminToken);
  if (!game) return res.status(404).send('Not found');

  const pid = req.params.participantId;
  game.participants = game.participants.filter(p => p.id !== pid);
  delete game.assignments[pid];

  if (game.participants.length < 2) {
    return res.status(400).send(layout('შეცდომა', `
      <div class="err">თამაშში უნდა დარჩეს მინიმუმ 2 მონაწილე. წაშლა ვერ მოხერხდა.</div>
      <p><a href="/admin/${game.adminToken}">← უკან</a></p>`));
  }

  const pairs = makeAssignments(game.participants);
  game.assignments = Object.fromEntries(pairs.map(p => [p.giver.id, p.recipient.id]));

  await persist();
  res.redirect(`/admin/${game.adminToken}`);
});

app.post('/admin/:adminToken/regenerate', async (req, res) => {
  const game = findGameByAdminToken(req.params.adminToken);
  if (!game) return res.status(404).send('Not found');

  game.participants.forEach(p => {
    p.token = newToken();
    p.viewedAt = null;
  });

  const pairs = makeAssignments(game.participants);
  game.assignments = Object.fromEntries(pairs.map(p => [p.giver.id, p.recipient.id]));

  await persist();
  res.redirect(`/admin/${game.adminToken}?regenerated=1`);
});

app.post('/admin/:adminToken/transfer', async (req, res) => {
  const game = findGameByAdminToken(req.params.adminToken);
  if (!game) return res.status(404).send('Not found');

  game.adminToken = newToken();
  await persist();
  res.redirect(`/admin/${game.adminToken}?transferred=1`);
});

app.post('/r/:token/wishlist', async (req, res) => {
  const found = findParticipantByToken(req.params.token);
  if (!found) return res.status(404).send(layout('ვერ მოიძებნა', '<div class="err">ეს ბმული არ არის ვალიდური (შესაძლოა განახლდა).</div>'));

  const { participant } = found;
  const wishes = String(req.body.wishes || '')
    .split('\n')
    .map(value => value.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 3);
  const interests = String(req.body.interests || '').trim().slice(0, 140);
  const hint = String(req.body.hint || '').trim().slice(0, 140);
  const previousWishlist = participant.wishlist;

  participant.wishlist = { wishes, interests, hint, updatedAt: new Date().toISOString() };
  const ok = await persist();
  if (!ok) {
    if (previousWishlist === undefined) delete participant.wishlist;
    else participant.wishlist = previousWishlist;
    return res.status(500).send(layout('შეცდომა', '<div class="err">სურვილების შენახვა ვერ მოხერხდა. სცადეთ თავიდან.</div>'));
  }

  res.redirect('/r/' + req.params.token + '?saved=1');
});

app.get('/r/:token', async (req, res) => {
  const found = findParticipantByToken(req.params.token);
  if (!found) return res.status(404).send(layout('ვერ მოიძებნა', `
    <div class="err">ეს ბმული არ არის ვალიდური (შესაძლოა განახლდა).</div>
    <p><a href="/">← მთავარი</a></p>`));

  const { game, participant } = found;
  const recipient = game.participants.find(p => p.id === game.assignments[participant.id]);

  if (req.query.reveal !== '1') {
    const wishlist = participant.wishlist || {};
    const wishesText = Array.isArray(wishlist.wishes) ? wishlist.wishes.join('\n') : '';
    const savedBanner = req.query.saved === '1'
      ? '<div class="ok">შენი მინიშნებები შენახულია! 🎁</div>'
      : '';
    return res.send(layout('თქვენი დავალება', `
      <div class="banner">🎄 გილოცავთ ახალ წელს! 🎁</div>
      <h1 class="greet">${esc(game.title)}</h1>
      <p class="muted center" style="margin-bottom:18px">
        გამარჯობა, <strong>${esc(participant.name)}</strong>!<br>სანამ შენს დავალებას ნახავ, შეგიძლია სანტას პატარა მინიშნებები დაუტოვო.
      </p>
      ${savedBanner}
      <section class="app-card">
        <h2>🎁 შენი სურვილების სია</h2>
        <p style="font-size:14px;margin-top:0">დაუტოვე შენს სანტას მაქსიმუმ სამი სურვილი და რამდენიმე მინიშნება. ამას მხოლოდ ის მონაწილე ნახავს, ვისაც შენთვის საჩუქრის ყიდვა შეხვდა.</p>
        <form method="post" action="/r/${participant.token}/wishlist">
          <label>სურვილები — თითო ცალკე ხაზზე, მაქსიმუმ 3
            <textarea name="wishes" rows="3" maxlength="260" placeholder="მაგ. წიგნი, თბილი წინდები, ყავის ჭიქა">${esc(wishesText)}</textarea>
          </label>
          <label>რა გიყვარს ან რა გაინტერესებს?
            <input name="interests" maxlength="140" value="${esc(wishlist.interests || '')}" placeholder="მაგ. წიგნები, ლაშქრობა, ყავა">
          </label>
          <label>პატარა მინიშნება სანტასთვის
            <input name="hint" maxlength="140" value="${esc(wishlist.hint || '')}" placeholder="მაგ. მიყვარს პრაქტიკული საჩუქრები">
          </label>
          <button type="submit" class="secondary">მინიშნებების შენახვა</button>
        </form>
      </section>
      <p class="muted center" style="font-size:14px;margin-bottom:12px">სურვილების შევსება აუცილებელი არ არის — შეგიძლია პირდაპირ გააგრძელო.</p>
      <p class="center">
        <a href="/r/${participant.token}?reveal=1" style="font-size:17px;font-weight:700;display:inline-block;padding:16px 24px;background:linear-gradient(180deg,#e23b3b,#b81f2f);color:#fff;border-radius:14px;box-shadow:0 8px 20px rgba(226,59,59,.4);text-decoration:none;width:100%">
          ჩემი დავალების ნახვა →
        </a>
      </p>`));
  }

  if (!participant.viewedAt) {
    participant.viewedAt = new Date().toISOString();
    await persist();
  }

  const recipientWishlist = recipient.wishlist || {};
  const recipientWishes = Array.isArray(recipientWishlist.wishes) ? recipientWishlist.wishes : [];
  const wishlistDetails =
    (recipientWishlist.interests ? '<p><strong>რა უყვარს:</strong> ' + esc(recipientWishlist.interests) + '</p>' : '') +
    (recipientWishlist.hint ? '<p><strong>მინიშნება:</strong> ' + esc(recipientWishlist.hint) + '</p>' : '');
  const wishlistItemsHtml = recipientWishes.map(wish => '<li>🎁 ' + esc(wish) + '</li>').join('');
  const wishlistCard = recipientWishes.length || wishlistDetails
    ? '<section class="app-card"><h2>✨ პატარა მინიშნებები შენთვის</h2>' +
      '<p style="font-size:14px;margin-top:0">ადამიანმა, რომელსაც საჩუქარს უკეთებ, ეს სურვილები დაგიტოვა:</p>' +
      (wishlistItemsHtml ? '<ul style="padding-left:22px;line-height:1.9">' + wishlistItemsHtml + '</ul>' : '') +
      wishlistDetails + '</section>'
    : '<section class="app-card"><h2>✨ სანტას მინიშნებები</h2>' +
      '<p style="font-size:14px;margin-bottom:0">შენს ადრესატს ჯერ სურვილები არ დაუტოვებია. შეგიძლია თავად მოიფიქრო სიურპრიზი! 🎁</p></section>';

  res.send(layout('თქვენი დავალება', `
    <div class="banner">🎄 გილოცავთ ახალ წელს! 🎁</div>
    <h1 class="greet">${esc(game.title)}</h1>
    <p class="muted center" style="font-size:18px">
      <strong>${esc(participant.name)}</strong>, თქვენ საჩუქარს აძლევთ:
    </p>
    <div class="big">${esc(recipient.name)}</div>
    ${wishlistCard}
    <div style="background:rgba(255,255,255,0.05);padding:16px;border-radius:12px;margin-top:24px">
      <p class="muted center" style="margin:0;font-size:14px">
        🤫 საიდუმლოდ შეინახეთ — და ნუ გახსნით ამ ბმულს მის თანდასწრებით.
      </p>
    </div>
    <p class="center" style="margin-top:18px"><a href="/r/${participant.token}" style="font-size:14px">ჩემი სურვილების შეცვლა</a></p>
    <p class="muted center" style="margin-top:24px;font-size:14px;color:#ffd166">
      ბედნიერებას გისურვებთ ახალ წელს! ✨
    </p>`));
});

app.use((req, res) => res.status(404).send(layout('ვერ მოიძებნა', `
  <div class="err">გვერდი ვერ მოიძებნა.</div>
  <p><a href="/">← მთავარი</a></p>`)));

app.listen(PORT, () => console.log(`საიდუმლო სანტა მუშაობს: ${BASE_URL}`));