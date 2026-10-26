// Vercel Serverless Function — чат + модератор-бот + муты
//
// GET  /api/chat            -> { chat, state, presence, mutes, bot }
// POST /api/chat  {topic, payload}  — публикация
// POST /api/chat  {op:'auth', ...}  — регистрация/вход/привязка HWID
//
// ntfy.sh используется как общее хранилище (его IP не блокируется, в отличие от IP игроков).

const https = require('https');
const crypto = require('crypto');

// Vercel Blob — резервное долговременное хранилище.
// Основное хранилище — ntfy, но оно периодически недоступно,
// поэтому критичные данные (аккаунты, муты) дублируются в Blob.
let blob = null;
try {
  // eslint-disable-next-line global-require
  blob = require('@vercel/blob');
} catch (e) {
  blob = null;
}
const BLOB_PATH = 'nebula/state.json';

async function blobLoad() {
  if (!blob || !process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    // @vercel/blob v2: get(path, { access: 'private' }) -> { stream }
    const res = await blob.get(BLOB_PATH, { access: 'private' });
    if (!res || !res.stream) return null;
    const text = await new Response(res.stream).text();
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

let blobSaveTimer = null;
let blobDirty = false;
let blobSaving = false;

// Слияние списков мутов по времени (последняя запись по нику побеждает)
function mergeMutes(base, extra) {
  const byNick = {};
  (base || []).forEach(function (r) { if (r && r.nick) byNick[r.nick] = r; });
  (extra || []).forEach(function (r) {
    if (!r || !r.nick) return;
    const cur = byNick[r.nick];
    if (!cur || (r.ts || 0) >= (cur.ts || 0)) byNick[r.nick] = r;
  });
  return Object.keys(byNick).map(function (k) { return byNick[k]; });
}
// Слияние сообщений по id
function mergeChat(base, extra) {
  const byId = {};
  (base || []).forEach(function (m) {
    if (!m || !m.n) return;
    byId[m.id || (m.n + ':' + m.ts)] = m;
  });
  (extra || []).forEach(function (m) {
    if (!m || !m.n) return;
    byId[m.id || (m.n + ':' + m.ts)] = m;
  });
  const list = Object.keys(byId).map(function (k) { return byId[k]; });
  list.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
  return list.slice(-300);
}

// Очередь сохранений: пишем строго по очереди, чтобы записи не накладывались
let blobQueue = Promise.resolve();
function blobSaveSoon() {
  blobQueue = blobQueue.then(function () { return blobSaveNow(); }).catch(function () { /* ignore */ });
  return blobQueue;
}

// Сохранение в Blob — ПЕРЕД записью читаем текущий снимок и сливаем,
// иначе инстансы затирают друг друга (последний записавший «побеждает»).
async function blobSaveNow() {
  if (!blob || !process.env.BLOB_READ_WRITE_TOKEN) return;
  blobDirty = false;
  try {
    const snap = await blobLoad();
    const users = Object.assign({}, (snap && snap.users) || {});
    Object.keys(mem.users).forEach(function (k) {
      const cur = users[k];
      if (!cur || (mem.users[k].ut || 0) >= (cur.ut || 0)) users[k] = mem.users[k];
    });
    const mutes = mergeMutes((snap && snap.mutes) || [], mem.mutes);
    const chat = mergeChat((snap && snap.chat) || [], mem.chat);
    const payload = JSON.stringify({ at: Date.now(), users: users, mutes: mutes, chat: chat });
    await blob.put(BLOB_PATH, payload, {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true      // без этого повторная запись падает с ошибкой
    });
    // наши данные теперь в снимке
    mem.users = users;
    mem.mutes = mutes;
    mem.chat = chat;
  } catch (e) {
    console.error('Blob save failed:', e && e.message ? e.message : e);
  }
}

// (реализация выше — через очередь, чтобы запись успела завершиться до ответа)

// Прочитать снимок из Blob в память (основной источник при падении ntfy)
let blobRestoredAt = 0;
async function blobRestore(force) {
  if (!blob || !process.env.BLOB_READ_WRITE_TOKEN) return;
  const now = Date.now();
  if (!force && now - blobRestoredAt < 2500) return;
  blobRestoredAt = now;
  const snap = await blobLoad();
  if (!snap) return;
  if (snap.users) Object.keys(snap.users).forEach(function (k) {
    const cur = mem.users[k];
    if (!cur || (snap.users[k].ut || 0) >= (cur.ut || 0)) mem.users[k] = snap.users[k];
  });
  if (snap.mutes) memMergeMutes(snap.mutes);
  if (snap.chat) memMergeChat(snap.chat);
}

const NTFY = 'https://ntfy.sh';
const TOPICS = {
  chat: 'nebula-visuals-chat-v1',
  state: 'nebula-visuals-state-v1',
  presence: 'nebula-visuals-presence-v1',
  mutes: 'nebula-visuals-mutes-v1',
  users: 'nebula-visuals-users-v1'
};

// ==================== ПРАВИЛА ЧАТА ====================
const RULES = [
  { id: 1, text: 'нельзя оскорблять родителей', ms: 3 * 3600 * 1000, label: '3 часа' },
  { id: 2, text: 'нельзя рекламировать читы', ms: 24 * 3600 * 1000, label: '1 день' },
  { id: 3, text: 'нельзя спамить', ms: 3600 * 1000, label: '1 час' },
  { id: 4, text: 'нельзя рассылать 18+ контент', ms: 3 * 24 * 3600 * 1000, label: '3 дня' }
];

const ADMIN_NICKS = ['qqc0d', 'k1ekks', 'qqcoda'];
const ADMIN_USERNAMES = ['qqc0d', 'k1ekks', 'qqcoda'];
const CODER_USERNAMES = ['qqc0d'];
const TESTER_USERNAMES = ['k1ekks'];
const BOT_NICK = 'FilterBotByqqc0d';
const BOT_AVATAR = '/bot-avatar.jpg';

// Бот пишет в чат ТОЛЬКО когда кого-то мутит. Никаких сообщений по таймеру.
const INSULT = /(бля[дт]?|ху[йия]|пизд|ебан[а-я]*|еб[а-я]*|сука|гандон|долбо[её]б|мудил|уеб|ёбан|дурак|дура|идиот|дебил|кретин|тупой|тупая|лох|чмо|мраз|cunt|asshole|bitch|shit|fuck|idiot|stupid)/i;
const PARENT = /(мам|мат[ьеий]|матер|пап|отц|отец|отчеств|родител|прадед|mother|father|mom|mum|dad|parent)/i;
const CHEAT = /(чит[ыаеу]?|читерск\w*|читерн\w*|взлом\w*|хак\w*|кряк\w*|crack(ed)?|aimbot|autoclick|x-?ray|ксрей|игрокбот|автоклик)/i;
const ADULT = /(18\+|порн\w*|xxx|секс\w*|трах\w*|выеб\w*|вульв\w*|ебать|выеб|интим)/i;

// ==================== NTFY ====================
// Жёсткий таймаут: без него запрос «зависает» и функция отдаёт 504.
const NTFY_TIMEOUT = 3500;
const NTFY_RETRIES = 2;

// Кэш в памяти (инстанс Vercel тёплый между запросами) — экономит round-trip'ы.
const cache = {};   // topic -> { ts, data }
const CACHE_TTL = { chat: 1500, state: 4000, presence: 1500, mutes: 4000, users: 30000 };

// Онлайн 24/7: собственный реестр присутствия на сервере.
// Если ntfy не отдал свежие пинги (задержка/потеря), список всё равно
// живёт за счёт этого реестра. Пользователь считается онлайн 5 минут.
const PRESENCE_TTL = 5 * 60 * 1000;
const presenceReg = {}; // nick -> { n, a, ts }

// Свежие аккаунты этого инстанса: ntfy может отдать список с задержкой,
// поэтому только что зарегистрированные/привязанные аккаунты держим в памяти.
const usersMem = {}; // username -> user

// ============================================================
// УСТОЙЧИВОЕ ХРАНИЛИЩЕ
// ntfy.sh — основное хранилище, но он периодически недоступен.
// Поэтому держим копию данных в памяти инстанса: когда ntfy лежит,
// сайт продолжает работать (аккаунты, чат, муты), а записи, которые
// не удалось отправить в ntfy, досылаем при первом успешном соединении.
// ============================================================
const mem = { users: {}, mutes: [], chat: [], state: null, presence: {} };
const pending = [];   // записи, не отправленные в ntfy

// «Пробка»: если ntfy не отвечает — не тратим время на ожидание,
// сразу отдаём данные из памяти. Через N секунд пробуем ещё раз.
let ntfyDownUntil = 0;
const NTFY_RETRY_MS = 25000;
function ntfyIsDown() { return Date.now() < ntfyDownUntil; }

function memMergeUsers(records) {
  (records || []).forEach(function (r) {
    if (!r || !r.username) return;
    if (r.type === 'deleted') { delete mem.users[r.username]; return; }
    const cur = mem.users[r.username];
    // не затираем более свежую запись (например, из Blob)
    if (!cur || (r.ut || 0) >= (cur.ut || 0)) mem.users[r.username] = r;
  });
}
function memMergeMutes(records) {
  (records || []).forEach(function (r) {
    if (!r || !r.nick) return;
    mem.mutes = mem.mutes.filter(function (x) { return x.nick !== r.nick; });
    mem.mutes.push(r);
  });
  if (mem.mutes.length > 800) mem.mutes = mem.mutes.slice(-800);
}
function memMergeChat(records) {
  (records || []).forEach(function (m) {
    if (!m || !m.n) return;
    const id = m.id || (m.n + ':' + m.ts);
    for (let i = 0; i < mem.chat.length; i++) {
      const x = mem.chat[i];
      if ((x.id || (x.n + ':' + x.ts)) === id) { mem.chat[i] = m; return; }
    }
    mem.chat.push(m);
  });
  if (mem.chat.length > 400) mem.chat = mem.chat.slice(-400);
}
// Отправить накопленные записи, когда ntfy снова доступен
async function flushPending() {
  if (!pending.length) return;
  const list = pending.splice(0, pending.length);
  for (let i = 0; i < list.length; i++) {
    const ok = await ntfyPostRaw(list[i].topic, list[i].body);
    if (!ok) { pending.push(list[i]); return; }   // ntfy всё ещё лежит
  }
}

// Один запрос к ntfy. null = не удалось (таймаут или ошибка сети)
function ntfyRequest(url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (done) return; done = true; resolve(val); };
    let req = null;
    const timer = setTimeout(() => {
      try { if (req) req.destroy(); } catch (e) { /* ignore */ }
      finish(null);
    }, NTFY_TIMEOUT);
    try {
      req = https.get(url, { headers: { 'User-Agent': 'NebulaVisuals/1.0' } }, (res) => {
        let data = '';
        res.on('data', (c2) => { data += c2; });
        res.on('end', () => {
          clearTimeout(timer);
          const out = [];
          data.split('\n').forEach((line) => {
            line = line.trim();
            if (!line) return;
            try {
              const ev = JSON.parse(line);
              if (ev.event !== 'message' || !ev.message) return;
              out.push(JSON.parse(ev.message));
            } catch (e) { /* ignore */ }
          });
          finish(out);
        });
      });
      req.on('error', () => { clearTimeout(timer); finish(null); });
    } catch (e) {
      clearTimeout(timer);
      finish(null);
    }
  });
}

// Чтение с повторами. Если ntfy недоступен — отдаём последние кэшированные данные,
// а НЕ пустой список (иначе аккаунты «пропадают», а сообщения теряются).
async function ntfyGet(topic, since, noCache) {
  const c = cache[topic];
  const ttl = CACHE_TTL[topic] != null ? CACHE_TTL[topic] : 2000;
  if (!noCache && c && (Date.now() - c.ts) < ttl) return c.data;

  // ntfy сейчас лежит — не ждём, отдаём память
  if (ntfyIsDown()) return memFallback(topic, c);

  const url = NTFY + '/' + topic + '/json?since=' + encodeURIComponent(since) + '&poll=1';
  for (let attempt = 0; attempt < NTFY_RETRIES; attempt++) {
    const out = await ntfyRequest(url);
    if (out) {
      ntfyDownUntil = 0;
      cache[topic] = { ts: Date.now(), data: out };
      // ntfy снова доступен — сливаем накопленные записи и обновляем память
      if (topic === TOPICS.users) memMergeUsers(out);
      if (topic === TOPICS.mutes) memMergeMutes(out);
      if (topic === TOPICS.chat) memMergeChat(out);
      flushPending();
      return out;
    }
    if (attempt < NTFY_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  // ntfy недоступен — отдаём данные из памяти (сайт продолжает работать)
  ntfyDownUntil = Date.now() + NTFY_RETRY_MS;
  return memFallback(topic, c);
}

// Данные из памяти — используются, когда ntfy недоступен
function memFallback(topic, c) {
  if (topic === TOPICS.users) return Object.keys(mem.users).map(function (k) { return mem.users[k]; });
  if (topic === TOPICS.mutes) return mem.mutes.slice();
  if (topic === TOPICS.chat) return mem.chat.slice();
  if (topic === TOPICS.state) return mem.state ? [mem.state] : [];
  if (topic === TOPICS.presence) return Object.keys(mem.presence).map(function (k) { return mem.presence[k]; });
  return c && c.data ? c.data : [];
}

function ntfyPostRaw(topic, body) {
  return new Promise((resolve) => {
    const u = new URL(NTFY + '/' + topic);
    const data = Buffer.from(body, 'utf8');
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    const timer = setTimeout(() => finish(false), NTFY_TIMEOUT);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': data.length }
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => { clearTimeout(timer); finish(res.statusCode < 400); });
    });
    req.on('error', () => { clearTimeout(timer); finish(false); });
    req.write(data);
    req.end();
  });
}

// Сохранить аккаунт: ставим метку свежести и пишем в ntfy + память + Blob
async function saveUser(u) {
  if (!u || !u.username) return false;
  u.ut = Date.now();
  usersMem[u.username] = u;
  return ntfyPost(TOPICS.users, JSON.stringify(u));
}

// Запись: сначала в память (чтобы данные не потерялись), затем в ntfy.
// Если ntfy недоступен — запись остаётся в очереди и уйдёт позже.
async function ntfyPost(topic, body) {
  try {
    const rec = JSON.parse(body);
    if (topic === TOPICS.users && rec.username) {
      rec.ut = Date.now();          // метка свежести записи
      mem.users[rec.username] = rec;
    }
    if (topic === TOPICS.mutes && rec.nick) memMergeMutes([rec]);
    if (topic === TOPICS.chat && rec.n) memMergeChat([rec]);
    if (topic === TOPICS.state && rec.t) mem.state = rec;
  } catch (e) { /* ignore */ }
  // дублируем в Blob — переживёт падение ntfy (ждём завершения, иначе
  // функция заморозится до сохранения и данные потеряются)
  if (topic === TOPICS.users || topic === TOPICS.mutes || topic === TOPICS.chat) {
    await blobSaveSoon();
  }
  const ok = await ntfyPostRaw(topic, body);
  if (!ok) {
    // ntfy недоступен, но запись уже сохранена в памяти и в Blob —
    // отдаём успех, чтобы сообщение не потерялось и не показывалось ошибкой
    if (pending.length < 500) pending.push({ topic: topic, body: body });
    return topic === TOPICS.chat || topic === TOPICS.users || topic === TOPICS.mutes;
  }
  return true;
}

// ==================== ПРОВЕРКА ПРАВИЛ ====================
function rolesOf(nick) {
  const r = [];
  if (ADMIN_USERNAMES.indexOf(nick) !== -1) r.push('admin');
  if (CODER_USERNAMES.indexOf(nick) !== -1) r.push('coder');
  if (TESTER_USERNAMES.indexOf(nick) !== -1) r.push('tester');
  return r;
}
function isAdmin(nick) { return rolesOf(nick).indexOf('admin') !== -1; }

function checkMessage(msg, recent) {
  const nick = msg.n || '';
  const text = String(msg.x || '');

  // Админов не мутим НИКОГДА — ни за спам, ни за остальные правила
  if (isAdmin(nick)) return 0;

  // Правило 3 — спам
  if (spamCheck(nick, text)) return 3;

  // Правила 1, 2, 4
  if (PARENT.test(text) && INSULT.test(text)) return 1;
  if (CHEAT.test(text)) return 2;
  if (ADULT.test(text)) return 4;
  return 0;
}

function buildMuteMap(records) {
  // сортируем по времени: последняя запись по нику побеждает
  const sorted = (records || []).slice().sort(function (a, b) { return (a && a.ts || 0) - (b && b.ts || 0); });
  const map = {};
  sorted.forEach(function (r) {
    if (!r || !r.nick) return;
    if (r.type === 'mute') map[r.nick] = { until: r.until, rule: r.rule, label: r.label, ts: r.ts || 0 };
    if (r.type === 'unmute') delete map[r.nick];
  });
  // чистим истёкшие
  const now = Date.now();
  Object.keys(map).forEach(function (k) { if (map[k].until <= now) delete map[k]; });
  return map;
}

function formatLeft(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const parts = [];
  if (d) parts.push(d + ' дн');
  if (h) parts.push(h + ' ч');
  if (m) parts.push(m + ' мин');
  parts.push(s + ' сек');
  return parts.join(' ');
}

// ==================== АНТИСПАМ (в памяти инстанса) ====================
const spamTrack = {};   // nick -> [{ t, hash }]

function spamCheck(nick, text) {
  const now = Date.now();
  const h = String(text).trim().toLowerCase().replace(/\s+/g, ' ');
  const arr = (spamTrack[nick] || []).filter(function (e) { return now - e.t < 60000; });
  const same = arr.filter(function (e) { return e.h === h; }).length;
  // >5 сообщений за 15 сек ИЛИ 3+ одинаковых за минуту
  const fast = arr.filter(function (e) { return now - e.t < 15000; }).length;
  arr.push({ t: now, h: h });
  spamTrack[nick] = arr.slice(-20);
  if (same >= 2) return true;      // текущее — третье одинаковое
  if (fast >= 5) return true;
  return false;
}

// ==================== ПОЛЬЗОВАТЕЛИ ====================
function hashPass(pass) {
  return crypto.createHash('sha256').update('nebula:' + pass).digest('hex');
}
// Код доступа к лаунчеру (задаётся админом, проверяется на сервере)
function hashCode(code) {
  return crypto.createHash('sha256').update('nebulacode:' + String(code || '').trim().toUpperCase()).digest('hex');
}
async function loadUsers() {
  await blobRestore();
  const recs = await ntfyGet(TOPICS.users, '24h');
  const map = {};
  recs.forEach(function (r) {
    if (!r || !r.username) return;
    // запись об удалении убирает аккаунт из списка
    if (r.type === 'deleted') { delete map[r.username]; return; }
    map[r.username] = r;
  });
  // аккаунты из памяти/Blob — приоритетнее, если они свежее ntfy-записи
  Object.keys(mem.users).forEach(function (k) {
    const cur = map[k];
    if (!cur || (mem.users[k].ut || 0) >= (cur.ut || 0)) map[k] = mem.users[k];
  });
  // свежие регистрации/привязки из памяти инстанса — приоритетнее (ntfy может не успеть)
  Object.keys(usersMem).forEach(function (k) {
    const cur = map[k];
    if (!cur || (usersMem[k].ut || 0) >= (cur.ut || 0)) map[k] = usersMem[k];
  });
  return map;
}

// Перечитать список аккаунтов в обход кэша (для входа сразу после регистрации)
async function loadUsersFresh() {
  const recs = await ntfyGet(TOPICS.users, '24h', true);
  const map = {};
  recs.forEach(function (r) {
    if (!r || !r.username) return;
    if (r.type === 'deleted') { delete map[r.username]; return; }
    map[r.username] = r;
  });
  Object.keys(usersMem).forEach(function (k) { map[k] = usersMem[k]; });
  return map;
}
async function opAuth(body) {
  const op = body.op;
  const users = await loadUsers();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const email = String(body.email || '').trim().toLowerCase();

  if (op === 'register') {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return { ok: false, error: 'Ник: 3–16 символов (латиница, цифры, _)' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Некорректный email' };
    if (password.length < 6) return { ok: false, error: 'Пароль минимум 6 символов' };
    if (users[username]) return { ok: false, error: 'Такой ник уже занят' };
    const u = { type: 'user', username: username, email: email, pass: hashPass(password), hwid: '', role: rolesOf(username) };
    await saveUser(u);
    usersMem[username] = u;
    return { ok: true, user: { username: u.username, email: u.email, role: u.role } };
  }

  if (op === 'login') {
    let u = users[username];
    if (!u) {
      // возможна задержка ntfy — перечитываем список без кэша
      const fresh = await loadUsersFresh();
      u = fresh[username];
    }
    if (!u || u.pass !== hashPass(password)) return { ok: false, error: 'Неверный ник или пароль' };
    // Код доступа к лаунчеру: если задан — должен совпасть
    const code = String(body.code || '').trim();
    if (u.code && hashCode(code) !== u.code) {
      return { ok: false, error: 'Неверный код доступа' };
    }
    return {
      ok: true,
      user: {
        username: u.username, email: u.email, role: u.role,
        hwid: u.hwid || '', needCode: !!u.code
      }
    };
  }

  if (op === 'ensure') {
    // Создать аккаунт, если его нет на сервере (миграция со старого localStorage)
    const u = users[username];
    if (u) {
      return {
        ok: true, created: false,
        user: { username: u.username, email: u.email, role: u.role, hwid: u.hwid || '' }
      };
    }
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return { ok: false, error: 'Нужен email' };
    if (password.length < 6) return { ok: false, error: 'Пароль минимум 6 символов' };
    const nu = {
      type: 'user', username: username, email: email,
      pass: hashPass(password), hwid: '', role: rolesOf(username)
    };
    await saveUser(nu);
    return {
      ok: true, created: true,
      user: { username: nu.username, email: nu.email, role: nu.role, hwid: '' }
    };
  }

  if (op === 'removeUser') {
    // Удаление аккаунта (только админ)
    if (!isAdmin(username)) return { ok: false, error: 'Недостаточно прав' };
    const target = String(body.target || '').trim();
    if (!target) return { ok: false, error: 'Укажите ник' };
    if (target === username) return { ok: false, error: 'Нельзя удалить свой аккаунт' };
    if (!users[target]) return { ok: false, error: 'Аккаунт не найден' };
    // Помечаем удаление отдельной записью — ntfy не умеет удалять сообщения
    await ntfyPost(TOPICS.users, JSON.stringify({ type: 'deleted', username: target, ts: Date.now() }));
    delete usersMem[target];
    return { ok: true, target: target };
  }

  if (op === 'setPassword') {
    // Смена пароля: старый пароль проверяется, чтобы лаунчер и сайт
    // всегда использовали одни и те же данные для входа.
    const u = users[username];
    if (!u) return { ok: false, error: 'Аккаунт не найден' };
    const oldPass = String(body.oldPassword || '');
    const newPass = String(body.newPassword || '');
    if (newPass.length < 6) return { ok: false, error: 'Пароль минимум 6 символов' };
    if (!isAdmin(username) && u.pass !== hashPass(oldPass)) {
      return { ok: false, error: 'Текущий пароль неверен' };
    }
    u.pass = hashPass(newPass);
    await saveUser(u);
    return { ok: true, username: username };
  }

  if (op === 'setCode') {
    // Код доступа к лаунчеру: пользователь ставит свой, админ — любому
    const target = String(body.target || '').trim();
    if (target !== username && !isAdmin(username)) return { ok: false, error: 'Недостаточно прав' };
    const tu = users[target];
    if (!tu) return { ok: false, error: 'Аккаунт не найден' };
    const code = String(body.code || '').trim();
    if (code) {
      if (code.length < 4) return { ok: false, error: 'Код: минимум 4 символа' };
      tu.code = hashCode(code);
    } else {
      delete tu.code;
    }
    await saveUser(tu);
    usersMem[target] = tu;
    return { ok: true, target: target, hasCode: !!tu.code };
  }

  if (op === 'resetHwid') {
    // Сброс привязки к устройству: по коду доступа или паролю
    const u = users[username];
    if (!u) return { ok: false, error: 'Аккаунт не найден' };
    const code = String(body.code || '').trim();
    const pass = String(body.password || '');
    const byCode = u.code && hashCode(code) === u.code;
    const byPass = pass && u.pass === hashPass(pass);
    if (!byCode && !byPass) return { ok: false, error: 'Нужен код доступа или пароль' };
    u.hwid = '';
    await saveUser(u);
    usersMem[username] = u;
    return { ok: true, username: username, hwid: '' };
  }

  if (op === 'bind') {
    const u = users[username];
    if (!u) return { ok: false, error: 'Аккаунт не найден' };
    const newHwid = String(body.hwid || '');
    // Если аккаунт уже привязан к ДРУГОМУ устройству — привязка не меняется.
    // Сбросить привязку можно только через resetHwid (код/пароль) или админом.
    if (u.hwid && newHwid && String(u.hwid).toUpperCase() !== newHwid.toUpperCase()) {
      return { ok: false, error: 'Аккаунт привязан к другому устройству', hwid: u.hwid };
    }
    u.hwid = newHwid;
    await saveUser(u);
    return { ok: true, user: { username: u.username, email: u.email, role: u.role, hwid: u.hwid } };
  }

  if (op === 'check') {
    const u = users[username];
    if (!u) return { ok: false, error: 'Аккаунт не найден' };
    const hwid = String(body.hwid || '');
    if (u.hwid && hwid && u.hwid !== hwid) {
      return { ok: false, error: 'Аккаунт привязан к другому устройству', hwid: u.hwid };
    }
    return { ok: true, user: { username: u.username, email: u.email, role: u.role, hwid: u.hwid || '' } };
  }

  if (op === 'unmute') {
    const nick = String(body.nick || '').trim();
    if (!nick) return { ok: false, error: 'Укажите ник' };
    // всегда успешно: пишем снятие мута
    const rec = { type: 'unmute', nick: nick, ts: Date.now() };
    await ntfyPost(TOPICS.mutes, JSON.stringify(rec));
    const cm = cache[TOPICS.mutes] && cache[TOPICS.mutes].data ? cache[TOPICS.mutes].data.slice() : [];
    cm.push(rec);
    cache[TOPICS.mutes] = { ts: Date.now(), data: cm };
    // сразу вычищаем из ответа мутов
    const map = cache[TOPICS.muteMap];
    if (map) delete map[nick];
    return { ok: true, nick: nick };
  }

  if (op === 'unmuteAll') {
    const list = Array.isArray(body.nicks) ? body.nicks : [];
    for (let i = 0; i < list.length; i++) {
      await ntfyPost(TOPICS.mutes, JSON.stringify({ type: 'unmute', nick: String(list[i]), ts: Date.now() }));
    }
    const cm = cache[TOPICS.mutes] && cache[TOPICS.mutes].data ? cache[TOPICS.mutes].data.slice() : [];
    list.forEach(function (n) { cm.push({ type: 'unmute', nick: String(n), ts: Date.now() }); });
    cache[TOPICS.mutes] = { ts: Date.now(), data: cm };
    return { ok: true, nicks: list };
  }

  if (op === 'purge') {
    // очистка истории чата: помечаем «начало заново» (ntfy не удаляет, но мы фильтруем)
    const ts = Date.now();
    await ntfyPost(TOPICS.state, JSON.stringify({ t: 'purge', ts: ts }));
    cache[TOPICS.state] = { ts: Date.now(), data: [{ t: 'purge', ts: ts }] };
    if (cache[TOPICS.chat]) cache[TOPICS.chat].data = [];
    // заодно снимаем все муты — чат начинается с чистого листа
    const mrecs = await ntfyGet(TOPICS.mutes, '48h', true);
    const mm = buildMuteMap(mrecs);
    for (const nk of Object.keys(mm)) {
      await ntfyPost(TOPICS.mutes, JSON.stringify({ type: 'unmute', nick: nk, ts: Date.now() + 1 }));
    }
    cache[TOPICS.mutes] = { ts: Date.now(), data: [] };
    return { ok: true, purgedAt: ts, unmuted: Object.keys(mm) };
  }

  if (op === 'group') {
    const u = users[username];
    const role = u ? u.role : rolesOf(username);
    return { ok: true, role: role };
  }

  return { ok: false, error: 'Неизвестная операция' };
}

// ==================== ОСНОВНОЙ ХЕНДЛЕР ====================
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // ---------- POST ----------
  if (req.method === 'POST') {
    let body = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { body = {}; }

    if (body.op === 'auth' || body.authOp) {
      // поддержка двух форм: {op:'auth', ...} и {authOp:'login', ...}
      const result = await opAuth(body.authOp ? Object.assign({}, body, { op: body.authOp }) : body);
      return res.status(result.ok ? 200 : 400).json(result);
    }

    const topic = TOPICS[body.topic] || TOPICS.chat;
    const payload = body.payload || {};

    // Модерация: если пришло обычное сообщение — проверяем правила
    if (body.topic === 'chat' && payload && payload.n && payload.x) {
      const recent = await ntfyGet(TOPICS.chat, '3m');
      const rule = checkMessage(payload, recent);
      if (rule) {
        const r = RULES[rule - 1];
        const until = Date.now() + r.ms;
        // локально обновляем кэш мутов сразу (иначе в ответе GET мута не видно)
        const cm = cache[TOPICS.mutes] && cache[TOPICS.mutes].data ? cache[TOPICS.mutes].data.slice() : [];
        cm.push({ type: 'mute', nick: payload.n, rule: rule, label: r.label, until: until, ts: Date.now() });
        cache[TOPICS.mutes] = { ts: Date.now(), data: cm };
        await ntfyPost(TOPICS.mutes, JSON.stringify({ type: 'mute', nick: payload.n, rule: rule, label: r.label, until: until, ts: Date.now() }));
        const reply = {
          id: 'mute-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          n: BOT_NICK,
          x: '@' + payload.n + ' был замучен. Причина: нарушение правила номер ' + rule + ' (' + r.text + '). Мут выдан на ' + r.label + '.',
          a: BOT_AVATAR, ts: Date.now()
        };
        await ntfyPost(TOPICS.chat, JSON.stringify(reply));
        return res.status(200).json({ ok: true, muted: true, rule: rule, label: r.label, until: until });
      }
    }

    // если автор замучен — сообщение не публикуем
    if (body.topic === 'chat' && payload && payload.n) {
      const mrecs = await ntfyGet(TOPICS.mutes, '24h', true);
      const mm = buildMuteMap(mrecs);
      if (mm[payload.n]) {
        const left = mm[payload.n].until - Date.now();
        return res.status(403).json({ ok: false, muted: true, rule: mm[payload.n].rule, until: mm[payload.n].until, left: left });
      }
    }

    // онлайн 24/7: каждый пинг присутствия фиксируем в серверном реестре
    if (body.topic === 'presence' && payload && payload.n) {
      presenceReg[payload.n] = { n: payload.n, a: payload.a || '', ts: Date.now() };
    }

    const ok = await ntfyPost(topic, JSON.stringify(payload));
    return res.status(ok ? 200 : 502).json({ ok: ok });
  }

  // ---------- GET ----------
  if (req.method === 'GET') {
    const since = (req.query && req.query.since) || '10m';
    // подтягиваем снимок из Blob (аккаунты/муты/чат), если ntfy недоступен
    await blobRestore();
    const [chatRaw, state, presence, mutes, users] = await Promise.all([
      ntfyGet(TOPICS.chat, since),
      ntfyGet(TOPICS.state, '24h'),
      ntfyGet(TOPICS.presence, '5m', true),
      ntfyGet(TOPICS.mutes, '24h', true),
      loadUsers()
    ]);

    // очистка истории: если была команда purge — показываем только сообщения после неё
    let purgeTs = 0;
    (state || []).forEach(function (s) { if (s && s.t === 'purge' && s.ts > purgeTs) purgeTs = s.ts; });
    const chat = purgeTs ? (chatRaw || []).filter(function (m) { return m && (m.ts || 0) > purgeTs; }) : (chatRaw || []);
    // выкидываем служебный мусор (пробы, диагностика)
    const chatClean = chat.filter(function (m) { return m && m.n && m.x != null; });

    // Бот больше НЕ пишет по таймеру — только при выдаче мута.

    const userList = {};
    Object.keys(users).forEach(function (k) {
      userList[k] = { email: users[k].email, role: users[k].role || rolesOf(k), hwid: users[k].hwid || '' };
    });

    // Онлайн 24/7: объединяем пинги из ntfy и серверный реестр presenceReg.
    // Даже если ntfy подтормаживает/теряет сообщения — залогиненный пользователь
    // остаётся в списке, пока пингует (клиент шлёт пинг каждые 25с).
    const byNick = {};
    const nowTs = Date.now();
    const PRESENCE_TTL = 5 * 60 * 1000; // 5 минут без пинга — считаем оффлайн
    (presence || []).forEach(function (m) {
      if (!m || !m.n || m.n === BOT_NICK) return;
      const cur = byNick[m.n];
      if (!cur || (m.ts || 0) > (cur.ts || 0)) byNick[m.n] = { n: m.n, a: m.a || '', ts: m.ts || 0 };
    });
    Object.keys(presenceReg).forEach(function (k) {
      const r = presenceReg[k];
      if (!r) return;
      if (nowTs - (r.ts || 0) > PRESENCE_TTL) { delete presenceReg[k]; return; }
      const cur = byNick[k];
      if (!cur) { byNick[k] = { n: r.n, a: r.a || '', ts: r.ts }; return; }
      if ((r.ts || 0) >= (cur.ts || 0)) { cur.ts = r.ts; if (r.a) cur.a = r.a; }
    });
    // недавно пинговавшие через реестр считаются «сейчас онлайн» (baseline 24/7)
    Object.keys(byNick).forEach(function (k) {
      const u = byNick[k];
      if (nowTs - (u.ts || 0) < 90 * 1000) u.ts = nowTs;
    });
    const presenceOut = Object.keys(byNick).map(function (k) {
      return { t: 'p', n: byNick[k].n, a: byNick[k].a || '', ts: byNick[k].ts };
    });
    presenceOut.push({ t: 'p', n: BOT_NICK, a: BOT_AVATAR, ts: nowTs, bot: true });

    return res.status(200).json({
      ok: true,
      chat: chatClean,
      purgedAt: purgeTs || 0,
      state: state,
      presence: presenceOut,
      mutes: buildMuteMap(mutes),
      users: userList,
      bot: null
    });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
