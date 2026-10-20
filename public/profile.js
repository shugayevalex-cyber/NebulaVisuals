// Nebula Visuals — Profile page logic
// Users stored in localStorage; session in localStorage. No backend.

(function () {
  'use strict';

  const USERS_KEY = 'nebula_users';
  const AUTH_KEY = 'nebula_auth';
  const ADMIN_USER = { username: 'qqc0d', email: 'shugayevalex@gmail.com' };
  const ADMIN_USERNAMES = ['qqc0d', 'k1ekks'];
  const CODER_USERNAMES = ['qqc0d'];
  const TESTER_USERNAMES = ['k1ekks'];

  /* EmailJS config — заполни своими данными (https://www.emailjs.com) */
  const EMAILJS = {
    enabled: false,          // включи true, когда заполнишь данные
    publicKey: '',           // Public Key
    serviceId: '',           // Service ID (Gmail и т.п.)
    templateId: ''           // Template ID
  };

  /* ---------- storage helpers ---------- */
  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch (e) { return []; }
  }
  function saveUsers(u) {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); return true; }
    catch (e) { console.warn('saveUsers quota error', e); return false; }
  }
  function loadAuth() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; }
  }
  function saveAuth(a) {
    try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); return true; }
    catch (e) { console.warn('saveAuth quota error', e); return false; }
  }
  function clearAuth() { try { localStorage.removeItem(AUTH_KEY); } catch (e) {} }

  function rolesOf(user) {
    if (!user) return [];
    const r = [];
    if (ADMIN_USERNAMES.indexOf(user.username) !== -1) r.push('admin');
    else if (user.username === ADMIN_USER.username && String(user.email).toLowerCase() === ADMIN_USER.email) r.push('admin');
    if (CODER_USERNAMES.indexOf(user.username) !== -1) r.push('coder');
    if (TESTER_USERNAMES.indexOf(user.username) !== -1) r.push('tester');
    return r;
  }
  function roleOf(user) { return rolesOf(user).indexOf('admin') !== -1 ? 'admin' : 'user'; }

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
    setText('user-email', user.email);
    setStatus(role);
    const avatar = user.avatar || '';
    const avatarImg = document.getElementById('avatar-img');
    if (avatarImg) avatarImg.src = avatar || '/logo-icon.png';

    // role icon
    const roleIcon = document.getElementById('role-icon');
    if (roleIcon) roleIcon.src = role === 'admin' ? '/icons/admin.png' : '/icons/user.png';

    // home panel
    setText('nick-value', user.username);
    setText('email-value', user.email);
    const roleEl = document.getElementById('role-value');
    if (roleEl) {
      const rs = rolesOf(user);
      roleEl.innerHTML = rs.length ? badgesHtml(rs) : 'Пользователь';
      roleEl.classList.toggle('is-admin', rs.indexOf('admin') !== -1);
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
        if (file.size > 2 * 1024 * 1024) { toast('Картинка больше 2 МБ'); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const full = reader.result;
          const img = new Image();
          img.onload = () => {
            // маленькая копия 40x40 JPEG — для чата и списка онлайн
            let small = '';
            try {
              const c = document.createElement('canvas');
              c.width = 40; c.height = 40;
              const ctx = c.getContext('2d');
              const s = Math.min(img.width, img.height);
              const sx = (img.width - s) / 2, sy = (img.height - s) / 2;
              ctx.drawImage(img, sx, sy, s, s, 0, 0, 40, 40);
              small = c.toDataURL('image/jpeg', 0.5);
              if (small.length > 2600) small = '';
            } catch (e) { small = ''; }

            user.avatar = full;
            user.avatarSmall = small;
            if (!updateUser(user)) {
              // not enough space - keep only the small copy
              user.avatar = small || '';
              if (!updateUser(user)) { toast('Не хватит места для аватара'); return; }
              saveAuth(user);
              if (avatarImg) avatarImg.src = user.avatar;
              toast('Аватар сохранён (уменьшен)');
              return;
            }
            if (!updateUser(user)) { toast('Не удалось сохранить — не хватиет места'); return; }
            saveAuth(user);
            if (avatarImg) avatarImg.src = full;
            toast('Аватар обновлён');
          };
          img.onerror = () => {
            user.avatar = full;
            if (!updateUser(user)) { toast('Не удалось сохранить — не хватит места'); return; }
            saveAuth(user);
            if (avatarImg) avatarImg.src = full;
            toast('Аватар обновлён');
          };
          img.src = full;
        };
        reader.readAsDataURL(file);
      });
    }

    // download button — прямая ссылка, минует страницу превью и скан Google (быстрее)
    const dl = document.getElementById('download-btn');
    if (dl) dl.addEventListener('click', () => {
      const url = 'https://drive.usercontent.google.com/download?id=1vV0IfVQDqHPpjdM_6LInXzrdtpCXWat_&export=download&confirm=t';
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      a.download = 'Nebula Visuals Setup 1.5.0.exe';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
    return saveUsers(users);
  }

  function userStatusEl() { return document.getElementById('user-status'); }
  function setStatus(role) {
    const el = document.getElementById('user-status');
    if (!el) return;
    const rs = rolesOf(AuthStateUser());
    if (rs.length) {
      el.innerHTML = badgesHtml(rs);
    } else {
      el.textContent = 'Пользователь';
    }
  }

  // Текущий пользователь из localStorage
  function AuthStateUser() {
    const a = loadAuth();
    if (!a) return null;
    const users = loadUsers();
    return users.find(u => u.username === a.username) || a;
  }

  // Бейджи ролей: admin (зелёный), кодер (фиолетовый), тестировщик (голубой)
  function badgesHtml(roles) {
    const map = { admin: 'admin', coder: 'кодер', tester: 'тестировщик' };
    const cls = { admin: 'badge-admin', coder: 'badge-coder', tester: 'badge-tester' };
    return roles.map(r => '<span class="' + cls[r] + '">' + map[r] + '</span>').join(' ');
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