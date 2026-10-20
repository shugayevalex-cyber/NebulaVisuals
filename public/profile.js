// Nebula Visuals — Profile page logic
// Users stored in localStorage; session in localStorage. No backend.

(function () {
  'use strict';

  const USERS_KEY = 'nebula_users';
  const AUTH_KEY = 'nebula_auth';
  const ADMIN_USER = { username: 'qqc0d', email: 'shugayevalex@gmail.com' };

  /* ---------- storage helpers ---------- */
  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch (e) { return []; }
  }
  function saveUsers(u) {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); } catch (e) {}
  }
  function loadAuth() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; }
  }
  function saveAuth(a) {
    try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); } catch (e) {}
  }
  function clearAuth() { try { localStorage.removeItem(AUTH_KEY); } catch (e) {} }

  function roleOf(user) {
    return (user.username === ADMIN_USER.username && user.email.toLowerCase() === ADMIN_USER.email)
      ? 'admin' : 'user';
  }

  /* ---------- toast ---------- */
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ---------- init ---------- */
  function init() {
    const auth = loadAuth();
    const users = loadUsers();

    if (!auth) {
      // not logged in — go back to site
      window.location.replace('/index.html');
      return;
    }

    // find user in store, else fall back to auth
    let user = users.find(u => u.username === auth.username) || auth;
    const role = roleOf(user);

    // avatar
    setText('user-name', user.username);
    setStatus(userStatusEl(), role);
    const avatar = user.avatar || '';
    const avatarImg = document.getElementById('avatar-img');
    if (avatarImg) avatarImg.src = avatar || '/logo-icon.png';

    // home panel
    setText('hwid-value', '—');
    setText('resets-value', '0');
    const roleEl = document.getElementById('role-value');
    if (roleEl) {
      roleEl.textContent = role === 'admin' ? 'Админ' : 'Пользователь';
      roleEl.classList.toggle('is-admin', role === 'admin');
    }

    // hint
    const hint = document.getElementById('profile-hint');
    if (hint) hint.textContent = role === 'admin'
      ? 'У вас права администратора.'
      : 'Обычный аккаунт. Доступ к скачиванию файлов открыт.';

    // tabs
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        const target = document.getElementById('tab-' + tab);
        if (target) target.classList.add('active');
        const title = document.getElementById('page-title');
        if (title) title.textContent = tab === 'home' ? 'Главная' : 'Безопасность';
      });
    });

    // avatar picker
    const wrap = document.getElementById('avatar-wrap');
    const input = document.getElementById('avatar-input');
    if (wrap && input) {
      wrap.addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { toast('Выберите картинку PNG/JPEG/WebP'); return; }
        if (file.size > 500 * 1024) { toast('Картинка больше 500 КБ'); return; }
        const reader = new FileReader();
        reader.onload = () => {
          user.avatar = reader.result;
          updateUser(user);
          if (avatarImg) avatarImg.src = reader.result;
          toast('Аватар обновлён');
        };
        reader.readAsDataURL(file);
      });
    }

    // download button
    const dl = document.getElementById('download-btn');
    if (dl) dl.addEventListener('click', () => {
      window.open('https://drive.google.com/uc?export=download&id=1vV0IfVQDqHPpjdM_6LInXzrdtpCXWat_', '_blank');
    });

    // change email
    const saveEmail = document.getElementById('save-email');
    if (saveEmail) saveEmail.addEventListener('click', () => {
      const email = document.getElementById('new-email').value.trim().toLowerCase();
      const msg = document.getElementById('email-msg');
      msg.className = 'form-msg';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Некорректный email'; msg.classList.add('err'); return; }
      // duplicate check
      if (loadUsers().some(u => u.email.toLowerCase() === email && u.username !== user.username)) {
        msg.textContent = 'Такая почта уже используется'; msg.classList.add('err'); return;
      }
      user.email = email;
      updateUser(user);
      saveAuth(user);
      msg.textContent = 'Почта обновлена'; msg.classList.add('ok');
      document.getElementById('new-email').value = '';
      toast('Почта сохранена');
    });

    // change password
    const savePass = document.getElementById('save-pass');
    if (savePass) savePass.addEventListener('click', () => {
      const cur = document.getElementById('cur-pass').value;
      const next = document.getElementById('new-pass').value;
      const conf = document.getElementById('conf-pass').value;
      const msg = document.getElementById('pass-msg');
      msg.className = 'form-msg';
      if (!cur || !next || !conf) { msg.textContent = 'Заполните все поля'; msg.classList.add('err'); return; }
      if (cur !== user.password) { msg.textContent = 'Текущий пароль неверен'; msg.classList.add('err'); return; }
      if (next.length < 6) { msg.textContent = 'Новый пароль минимум 6 символов'; msg.classList.add('err'); return; }
      if (next !== conf) { msg.textContent = 'Пароли не совпадают'; msg.classList.add('err'); return; }
      user.password = next;
      updateUser(user);
      saveAuth(user);
      msg.textContent = 'Пароль обновлён'; msg.classList.add('ok');
      ['cur-pass', 'new-pass', 'conf-pass'].forEach(id => { document.getElementById(id).value = ''; });
      toast('Пароль сохранён');
    });

    // logout
    const logout = document.getElementById('logout-btn');
    if (logout) logout.addEventListener('click', () => {
      clearAuth();
      toast('Вы вышли из аккаунта');
      setTimeout(() => { window.location.replace('/index.html'); }, 500);
    });

    /* particles */
    startParticles();
  }

  function updateUser(user) {
    const users = loadUsers();
    const idx = users.findIndex(u => u.username === user.username);
    if (idx >= 0) users[idx] = user; else users.push(user);
    saveUsers(users);
  }

  function userStatusEl() { return document.getElementById('user-status'); }
  function setStatus(el, role) {
    if (!el) return;
    el.textContent = role === 'admin' ? 'Админ' : 'Пользователь';
    el.style.color = role === 'admin' ? 'var(--accent-green)' : 'var(--accent-blue)';
  }
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ---------- particles ---------- */
  function startParticles() {
    const canvas = document.getElementById('particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, dpr = window.devicePixelRatio || 1;
    const resize = () => { w = canvas.width = window.innerWidth * dpr; h = canvas.height = window.innerHeight * dpr; canvas.style.width = window.innerWidth + 'px'; canvas.style.height = window.innerHeight + 'px'; };
    window.addEventListener('resize', resize); resize();
    const parts = [];
    for (let i = 0; i < 40; i++) parts.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0005, vy: (Math.random() - .5) * .0005, r: Math.random() * 1.4 + .4, a: Math.random() * .3 + .1, c: Math.random() > .5 ? '#4a9eff' : '#a86bff' });
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      parts.forEach(p => { p.x += p.vx; p.y += p.vy; if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0; if (p.y < 0) p.y = 1; if (p.y > 1) p.y = 0; ctx.beginPath(); ctx.arc(p.x * w, p.y * h, p.r * dpr, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.globalAlpha = p.a; ctx.fill(); ctx.globalAlpha = 1; });
      requestAnimationFrame(tick);
    };
    tick();
  }

  /* ---------- video bg ---------- */
  const bgVideo = document.getElementById('bg-video');
  if (bgVideo) { bgVideo.muted = true; bgVideo.playsInline = true; bgVideo.play().catch(() => { bgVideo.style.display = 'none'; }); }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();