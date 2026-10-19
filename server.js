// Nebula Visuals — сервер сайта с личным кабинетом
// Стек: Node.js + Express + SQLite (better-sqlite3) + сессии
// Полностью бесплатный хостинг: Render / Railway / Fly.io, либо локально.

const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DOWNLOADS_DIR = path.join(ROOT, 'downloads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// ---------- База данных ----------
const db = new Database(path.join(DATA_DIR, 'nebula.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    email      TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    avatar     TEXT    DEFAULT '',
    ram        INTEGER DEFAULT 4096,
    last_login TEXT    DEFAULT '',
    created_at TEXT    NOT NULL
  );
`);
// Пользователь, который зарегистрировался раньше — добавим недостающие колонки
for (const col of [
  "ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN ram INTEGER DEFAULT 4096",
  "ALTER TABLE users ADD COLUMN last_login TEXT DEFAULT ''"
]) {
  try { db.exec(col); } catch (e) { /* колонка уже есть */ }
}

// ---------- Настройка Express ----------
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || 'nebula-visuals-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 дней
  }
}));
app.use(express.static(PUBLIC_DIR));

// ---------- Валидация ----------
const NICK_RE = /^[A-Za-z0-9_]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    avatar: row.avatar || '',
    ram: row.ram || 4096,
    lastLogin: row.last_login || '',
    createdAt: row.created_at
  };
}

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ ok: false, error: 'Нужно войти в аккаунт' });
}

// ---------- API: регистрация ----------
app.post('/api/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!NICK_RE.test(username)) {
      return res.status(400).json({ ok: false, error: 'Ник: 3–16 символов, латиница, цифры и «_»' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Некорректная почта' });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Пароль минимум 6 символов' });
    }

    const existsNick = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existsNick) return res.status(409).json({ ok: false, error: 'Такой ник уже занят' });
    const existsMail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existsMail) return res.status(409).json({ ok: false, error: 'Такая почта уже зарегистрирована' });

    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const info = db.prepare(
      'INSERT INTO users (username, email, password, created_at, last_login) VALUES (?, ?, ?, ?, ?)'
    ).run(username, email, hash, now, now);

    req.session.userId = info.lastInsertRowid;
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.json({ ok: true, user: publicUser(row) });
  } catch (e) {
    console.error('register error', e);
    res.status(500).json({ ok: false, error: 'Ошибка сервера' });
  }
});

// ---------- API: вход ----------
app.post('/api/login', async (req, res) => {
  try {
    const login = String(req.body.login || '').trim();
    const password = String(req.body.password || '');
    if (!login || !password) {
      return res.status(400).json({ ok: false, error: 'Введите ник и пароль' });
    }

    const row = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?')
      .get(login, login.toLowerCase());
    if (!row) return res.status(401).json({ ok: false, error: 'Неверный ник или пароль' });

    const match = await bcrypt.compare(password, row.password);
    if (!match) return res.status(401).json({ ok: false, error: 'Неверный ник или пароль' });

    const now = new Date().toISOString();
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now, row.id);
    req.session.userId = row.id;
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
    res.json({ ok: true, user: publicUser(fresh) });
  } catch (e) {
    console.error('login error', e);
    res.status(500).json({ ok: false, error: 'Ошибка сервера' });
  }
});

// ---------- API: выход ----------
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---------- API: текущий пользователь ----------
app.get('/api/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.json({ ok: true, user: null });
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  res.json({ ok: true, user: row ? publicUser(row) : null });
});

// ---------- API: обновление профиля ----------
app.post('/api/profile', requireAuth, async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (!row) return res.status(404).json({ ok: false, error: 'Аккаунт не найден' });

    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const ram = parseInt(req.body.ram, 10);
    const avatar = String(req.body.avatar || '').trim();

    if (!NICK_RE.test(username)) {
      return res.status(400).json({ ok: false, error: 'Ник: 3–16 символов, латиница, цифры и «_»' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Некорректная почта' });
    }
    const clashNick = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, row.id);
    if (clashNick) return res.status(409).json({ ok: false, error: 'Такой ник уже занят' });
    const clashMail = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, row.id);
    if (clashMail) return res.status(409).json({ ok: false, error: 'Такая почта уже зарегистрирована' });

    let avatarValue = row.avatar || '';
    if (avatar === '__clear__') {
      avatarValue = '';
    } else if (avatar && !/^data:image\/(png|jpe?g|webp);base64,/.test(avatar)) {
      return res.status(400).json({ ok: false, error: 'Аватар должен быть изображением (PNG/JPEG/WebP)' });
    } else if (avatar) {
      if (avatar.length > 400000) {
        return res.status(400).json({ ok: false, error: 'Аватар слишком большой (макс ~300 КБ)' });
      }
      avatarValue = avatar;
    }

    db.prepare('UPDATE users SET username = ?, email = ?, ram = ?, avatar = ? WHERE id = ?')
      .run(username, email, (ram >= 1024 && ram <= 32768) ? ram : 4096, avatarValue, row.id);

    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id);
    res.json({ ok: true, user: publicUser(fresh) });
  } catch (e) {
    console.error('profile error', e);
    res.status(500).json({ ok: false, error: 'Ошибка сервера' });
  }
});

// ---------- API: смена пароля ----------
app.post('/api/password', requireAuth, async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (!row) return res.status(404).json({ ok: false, error: 'Аккаунт не найден' });

    const current = String(req.body.current || '');
    const next = String(req.body.next || '');
    if (!(await bcrypt.compare(current, row.password))) {
      return res.status(401).json({ ok: false, error: 'Текущий пароль неверен' });
    }
    if (next.length < 6) {
      return res.status(400).json({ ok: false, error: 'Новый пароль минимум 6 символов' });
    }
    const hash = await bcrypt.hash(next, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, row.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('password error', e);
    res.status(500).json({ ok: false, error: 'Ошибка сервера' });
  }
});

// ---------- API: скачивание лаунчера ----------
app.get('/api/download', (req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(DOWNLOADS_DIR)
      .filter(f => f.toLowerCase().endsWith('.exe'))
      .map(f => ({
        name: f,
        size: fs.statSync(path.join(DOWNLOADS_DIR, f)).size,
        mtime: fs.statSync(path.join(DOWNLOADS_DIR, f)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch (e) { files = []; }

  if (files.length === 0) {
    return res.status(404).json({ ok: false, error: 'Инсталлер ещё не выложен' });
  }
  const file = files[0];
  res.download(path.join(DOWNLOADS_DIR, file.name), file.name);
});

app.get('/api/download-info', (req, res) => {
  let count = 0, latest = null;
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR)
      .filter(f => f.toLowerCase().endsWith('.exe'))
      .sort();
    count = files.length;
    if (files.length) {
      const p = path.join(DOWNLOADS_DIR, files[files.length - 1]);
      const st = fs.statSync(p);
      latest = { name: files[files.length - 1], size: st.size, mtime: st.mtimeMs };
    }
  } catch (e) { /* пусто */ }
  res.json({ ok: true, available: count > 0, latest });
});

// ---------- SPA-фолбэк ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log('Nebula Visuals сайт запущен: http://localhost:' + PORT);
});
