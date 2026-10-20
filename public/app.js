// Nebula Visuals — static site logic (Vercel/Netlify ready)
// Video bg, particles, scroll reveal, vertical comparison slider, FAQ, auth modal + profile dropdown

(function () {
  'use strict';

  /* ================= AUTH STATE ================= */
  const USERS_KEY = 'nebula_users';
  const AUTH_KEY = 'nebula_auth';
  const ADMIN = { username: 'qqc0d', email: 'shugayevalex@gmail.com' };
  const ADMIN_USERNAMES = ['qqc0d', 'k1ekks', 'qqcoda'];
  const CODER_USERNAMES = ['qqc0d'];
  const TESTER_USERNAMES = ['k1ekks'];

  // Роли пользователя: admin / coder / tester (могут совмещаться)
  function rolesOf(user) {
    if (!user) return [];
    const r = [];
    if (ADMIN_USERNAMES.indexOf(user.username) !== -1) r.push('admin');
    else if (user.username === ADMIN.username && String(user.email).toLowerCase() === ADMIN.email) r.push('admin');
    if (CODER_USERNAMES.indexOf(user.username) !== -1) r.push('coder');
    if (TESTER_USERNAMES.indexOf(user.username) !== -1) r.push('tester');
    return r;
  }

  // CSS-класс ника по ролям (комбо = градиент)
  function nickClass(username, email) {
    const r = rolesOf({ username: username, email: email || '' });
    if (r.length === 0) return 'nick-user';
    if (r.length === 1) return 'nick-' + r[0];
    if (r.indexOf('admin') !== -1 && r.indexOf('coder') !== -1 && r.indexOf('tester') !== -1) return 'nick-grad-all';
    if (r.indexOf('admin') !== -1 && r.indexOf('coder') !== -1) return 'nick-grad';
    if (r.indexOf('admin') !== -1 && r.indexOf('tester') !== -1) return 'nick-grad-admin-tester';
    if (r.indexOf('coder') !== -1 && r.indexOf('tester') !== -1) return 'nick-grad-coder-tester';
    return 'nick-' + r[0];
  }

  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch (e) { return []; }
  }
  // Освободить место в localStorage (аватары в истории чата — самые тяжёлые)
  function freeStorage() {
    try { localStorage.removeItem(CHAT_KEY); } catch (e) {}
    try {
      const users = loadUsers();
      let changed = false;
      users.forEach(function (u) {
        if (u.avatarSmall && u.avatarSmall.length > 3000) { u.avatarSmall = ''; changed = true; }
        if (u.avatar && u.avatar.length > 14000) { u.avatar = u.avatarSmall || ''; changed = true; }
      });
      if (changed) localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (e) {}
  }

  function saveUsers(u) {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); return true; }
    catch (e) {
      console.warn('saveUsers quota error', e);
      freeStorage();
      try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); return true; }
      catch (e3) { return false; }
    }
  }
  function roleOf(user) {
    if (ADMIN_USERNAMES.indexOf(user.username) !== -1) return 'admin';
    if (user.username === ADMIN.username && user.email.toLowerCase() === ADMIN.email) return 'admin';
    return 'user';
  }

  const AuthState = {
    user: null,

    init() {
      try {
        const saved = localStorage.getItem(AUTH_KEY);
        if (saved) this.user = JSON.parse(saved);
      } catch (e) { localStorage.removeItem(AUTH_KEY); }
      this.updateUI();
      this.bindModals();
    },

    save() {
      try { localStorage.setItem(AUTH_KEY, JSON.stringify(this.user)); return true; }
      catch (e) {
        console.warn('saveAuth quota error', e);
        freeStorage();
        try { localStorage.setItem(AUTH_KEY, JSON.stringify(this.user)); return true; }
        catch (e3) {
          // крайний случай — сохраняем сессию без аватара
          try {
            const lite = Object.assign({}, this.user, { avatar: '', avatarSmall: '' });
            localStorage.setItem(AUTH_KEY, JSON.stringify(lite));
            this.user = lite;
            return true;
          } catch (e4) { return false; }
        }
      }
    },

    login(user, remember) {
      this.user = user;
      let ok = true;
      if (remember !== false) ok = this.save();
      else { try { localStorage.removeItem(AUTH_KEY); } catch (e) {} }
      this.updateUI();
      return ok;
    },

    register(user) {
      this.user = user;
      const ok = this.save();
      this.updateUI();
      return ok;
    },

    logout() {
      this.user = null;
      try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
      this.updateUI();
    },

    updateUI() {
      const u = this.user;
      const navAuth = document.getElementById('nav-auth-btn');
      const navProfile = document.getElementById('nav-profile-link');

      if (u) {
        if (navAuth) navAuth.style.display = 'none';
        if (navProfile) navProfile.style.display = 'flex';
        // avatar: show image if set, else logo
        const avImg = document.getElementById('nav-avatar-img');
        if (avImg) avImg.src = myAvatarFull() || '/logo-icon.png';
        setText('nav-profile-name', u.username);
      } else {
        if (navAuth) navAuth.style.display = 'flex';
        if (navProfile) navProfile.style.display = 'none';
      }
      // уведомить чат о смене авторизации
      try { window.dispatchEvent(new CustomEvent('auth-changed')); } catch (e) {}
    },

    bindModals() {
      const modal = document.getElementById('auth-modal');
      const openBtn = document.getElementById('nav-auth-btn');
      const closeBtn = document.getElementById('auth-modal-close');
      const toReg = document.getElementById('switch-to-register');
      const toLogin = document.getElementById('switch-to-login');

      function open() { if (!modal) return; modal.hidden = false; modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; switchTab('login'); }
      function close() { if (!modal) return; modal.hidden = true; modal.style.display = 'none'; document.body.style.overflow = ''; clearErrors(); }

      if (openBtn) openBtn.addEventListener('click', open);
      if (closeBtn) closeBtn.addEventListener('click', close);
      if (toReg) toReg.addEventListener('click', () => switchTab('register'));
      if (toLogin) toLogin.addEventListener('click', () => switchTab('login'));
      if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

      // глобальный доступ к окну входа (из чата и других мест)
      window.openAuthModal = function (tab) { open(); if (tab) switchTab(tab); };

      function switchTab(target) {
        const lt = document.getElementById('auth-login-tab');
        const rt = document.getElementById('auth-register-tab');
        if (!lt || !rt) return;
        if (target === 'register') { lt.hidden = true; rt.hidden = false; }
        else { rt.hidden = true; lt.hidden = false; }
        clearErrors();
      }

      // Login submit
      const lf = document.getElementById('login-form');
      if (lf) lf.addEventListener('submit', (e) => {
        e.preventDefault();
        clearErrors();
        const btn = document.getElementById('modal-login-submit');
        const err = document.getElementById('modal-auth-error');
        const ok = document.getElementById('modal-auth-ok');
        const u = document.getElementById('modal-login-username').value.trim();
        const p = document.getElementById('modal-login-password').value;
        const hwidInput = document.getElementById('modal-login-hwid');
        const hwid = hwidInput ? hwidInput.value.trim().toUpperCase() : '';
        const remember = document.getElementById('modal-remember').checked;
        if (!u || !p) { if (err) err.textContent = 'Введите ник/email и пароль'; return; }
        btn.disabled = true; btn.textContent = 'Вход...';
        setTimeout(() => {
          const users = loadUsers();
          const user = users.find(x => x.username.toLowerCase() === u.toLowerCase() || x.email.toLowerCase() === u.toLowerCase());
          if (!user || user.password !== p) { if (err) err.textContent = 'Неверный логин или пароль'; btn.disabled = false; btn.textContent = 'Войти'; return; }
          // Проверка HWID: аккаунт привязан к устройству
          if (user.hwid) {
            if (!hwid) {
              if (err) err.textContent = 'Аккаунт привязан к устройству — введите HWID';
              btn.disabled = false; btn.textContent = 'Войти';
              return;
            }
            if (hwid !== String(user.hwid).toUpperCase()) {
              if (err) err.textContent = 'Аккаунт привязан к другому устройству (HWID не совпадает)';
              btn.disabled = false; btn.textContent = 'Войти';
              return;
            }
          }
          this.login(user, remember);
          if (ok) ok.textContent = 'Вход выполнен!';
          if (remember && !localStorage.getItem(AUTH_KEY)) {
            if (err) { err.textContent = 'Не удалось сохранить вход — очистите кеш сайта'; err.classList.add('err'); }
            btn.disabled = false; btn.textContent = 'Войти';
            return;
          }
          btn.disabled = false; btn.textContent = 'Войти';
          document.getElementById('modal-login-username').value = '';
          document.getElementById('modal-login-password').value = '';
          if (hwidInput) hwidInput.value = '';
          setTimeout(close, 700);
        }, 600);
      });

      // Register submit
      const rf = document.getElementById('register-form');
      if (rf) rf.addEventListener('submit', (e) => {
        e.preventDefault();
        clearErrors();
        const btn = document.getElementById('modal-register-submit');
        const err = document.getElementById('modal-register-error');
        const ok = document.getElementById('modal-register-ok');
        const username = document.getElementById('modal-reg-username').value.trim();
        const email = document.getElementById('modal-reg-email').value.trim().toLowerCase();
        const password = document.getElementById('modal-reg-password').value;
        const confirm = document.getElementById('modal-reg-password-confirm').value;
        const hwidRegInput = document.getElementById('modal-reg-hwid');
        const hwidReg = hwidRegInput ? hwidRegInput.value.trim().toUpperCase() : '';
        if (!username || !email || !password || !confirm) { if (err) err.textContent = 'Заполните все поля'; return; }
        if (username.length < 3 || username.length > 16) { if (err) err.textContent = 'Ник: 3–16 символов'; return; }
        if (!/^[A-Za-z0-9_]+$/.test(username)) { if (err) err.textContent = 'Ник: только латиница, цифры и _'; return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (err) err.textContent = 'Некорректный email'; return; }
        if (password.length < 6) { if (err) err.textContent = 'Пароль минимум 6 символов'; return; }
        if (password !== confirm) { if (err) err.textContent = 'Пароли не совпадают'; return; }

        const users = loadUsers();
        if (users.some(x => x.username.toLowerCase() === username.toLowerCase())) { if (err) err.textContent = 'Такой ник уже занят'; return; }
        if (users.some(x => x.email.toLowerCase() === email)) { if (err) err.textContent = 'Такая почта уже зарегистрирована'; return; }

        btn.disabled = true; btn.textContent = 'Регистрация...';
        setTimeout(() => {
          const user = { username, email, password, ram: 4096, avatar: '', hwid: hwidReg, hwidResets: 0, joined: new Date().toISOString() };
          users.push(user);
          if (!saveUsers(users)) {
            users.pop();
            if (err) { err.textContent = 'Не хватит места в браузере — очистите историю чата'; err.classList.add('err'); }
            btn.disabled = false; btn.textContent = 'Зарегистрироваться';
            return;
          }
          this.register(user);
          if (ok) ok.textContent = 'Регистрация успешна!';
          if (!localStorage.getItem(AUTH_KEY)) {
            if (err) { err.textContent = 'Не удалось сохранить вход — очистите кеш сайта (F12 → Application → Clear site data)'; err.classList.add('err'); }
            btn.disabled = false; btn.textContent = 'Зарегистрироваться';
            return;
          }
          btn.disabled = false; btn.textContent = 'Зарегистрироваться';
          document.getElementById('modal-reg-username').value = '';
          document.getElementById('modal-reg-email').value = '';
          document.getElementById('modal-reg-password').value = '';
          document.getElementById('modal-reg-password-confirm').value = '';
          if (hwidRegInput) hwidRegInput.value = '';
          setTimeout(() => { switchTab('login'); close(); }, 700);
        }, 600);
      });

      function clearErrors() {
        document.querySelectorAll('.form-error, .form-ok').forEach(el => { el.textContent = ''; });
      }
    }
  };

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ================= VIDEO BG ================= */
  const bgVideo = document.getElementById('bg-video');
  if (bgVideo) {
    bgVideo.muted = true;
    bgVideo.playsInline = true;
    bgVideo.play().catch(() => { bgVideo.style.display = 'none'; });
  }

  /* ================= PARTICLES ================= */
  const canvas = document.getElementById('particles');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let parts = [], w = 0, h = 0, dpr = window.devicePixelRatio || 1;
    function resize() { w = canvas.width = window.innerWidth * dpr; h = canvas.height = window.innerHeight * dpr; canvas.style.width = window.innerWidth + 'px'; canvas.style.height = window.innerHeight + 'px'; }
    window.addEventListener('resize', resize); resize();
    for (let i = 0; i < 45; i++) parts.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0006, vy: (Math.random() - .5) * .0006, r: Math.random() * 1.5 + .5, a: Math.random() * .35 + .1, c: Math.random() > .5 ? '#4a9eff' : '#a86bff' });
    function tick() {
      ctx.clearRect(0, 0, w, h);
      parts.forEach(p => { p.x += p.vx; p.y += p.vy; if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0; if (p.y < 0) p.y = 1; if (p.y > 1) p.y = 0; ctx.beginPath(); ctx.arc(p.x * w, p.y * h, p.r * dpr, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.globalAlpha = p.a; ctx.fill(); ctx.globalAlpha = 1; });
      requestAnimationFrame(tick);
    }
    tick();
  }

  /* ================= SCROLL REVEAL ================= */
  const revealEls = document.querySelectorAll('.section-header, .card, .stat, .faq details, .server-card, .hero-title, .hero-sub, .hero-buttons, .hero-stats, .video-wrapper');
  const obs = new IntersectionObserver((entries) => { entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); if (e.target.parentElement && e.target.parentElement.classList.contains('cards')) { const s = Array.from(e.target.parentElement.children); e.target.style.transitionDelay = (s.indexOf(e.target) * 0.1) + 's'; } if (e.target.parentElement && e.target.parentElement.classList.contains('server-grid')) { const s = Array.from(e.target.parentElement.children); e.target.style.transitionDelay = (s.indexOf(e.target) * 0.1) + 's'; } } }); }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  revealEls.forEach(el => { el.classList.add('reveal'); obs.observe(el); });

  /* ================= NAV SCROLL STATE ================= */
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => { if (window.scrollY > 20) nav.classList.add('scrolled'); else nav.classList.remove('scrolled'); }, { passive: true });

  /* ================= SMOOTH SCROLL ================= */
  document.querySelectorAll('a[href^="#"]').forEach(a => { a.addEventListener('click', e => { const id = a.getAttribute('href'); if (id === '#') return; const t = document.querySelector(id); if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }); });

  /* ================= FEATURES ================= */
  const features = [
    ['✦', 'Визуальные модули', 'Подсветка игроков, информация о здоровье, координаты, таймеры и десятки настроек — всё в одном профиле.'],
    ['⚡', 'Оптимизация FPS', 'Отсечение дальних сущностей, частиц и блок-энтити. Больше FPS на слабых ПК без потери картинки.'],
    ['↓', 'Автоустановка', 'Лаунчер сам скачивает библиотеки, ресурсы и Java. Уже установленные файлы заново не качаются.'],
    ['↻', 'Умные обновления', 'Когда выходит новая версия — лаунчер покажет сообщение и обновит только изменившийся мод.'],
    ['☰', 'Профиль игрока', 'Ник, выделенная память и аватар сохраняются и подтягиваются при каждом запуске.'],
    ['🔒', 'Оффлайн-режим', 'Работает без лицензии, оффлайн-UUID, свой ник — просто запускай и играй.']
  ];
  const cards = document.getElementById('features-cards');
  if (cards) cards.innerHTML = features.map((f, i) => '<article class="card" style="animation-delay:' + (i * 0.1) + 's"><div class="card-icon">' + f[0] + '</div><h3>' + f[1] + '</h3><p>' + f[2] + '</p></article>').join('');

  /* ================= FAQ ================= */
  const faqs = [
    ['Куда устанавливается игра?', 'Файлы игры складываются в <code>C:\\NebulaVisuals\\game\\1.21.4</code>. Лаунчер устанавливается в вашу пользовательскую папку программ.'],
    ['Почему нужны права администратора?', 'Чтобы создать папку игры в корне диска <code>C:</code> и корректно прописать ярлыки и систему обновления.'],
    ['Файлы скачиваются заново каждый запуск?', 'Нет. Лаунчер проверяет установленные файлы и запускает игру сразу. Скачивается только то, чего не хватает, либо обновившийся мод.'],
    ['Это официальный клиент?', 'Нет, Nebula Visuals — неофициальный клиент для лицензионной и пиратской игры в оффлайн-режиме. Не связан с Mojang и Microsoft.'],
    ['Какая версия Minecraft?', '1.21.4 на Fabric. Лаунчер сам тянет нужные библиотеки и моды.'],
    ['Как обновить клиент?', 'При выходе обновления лаунчер покажет уведомление. Нажми «Запустить» — он сам скачает новый мод и заменит старый.'],
    ['Есть ли сервер в моде?', 'Да! В моде есть встроенный сервер: поиск игроков, чат, друзья, голосовой чат, уведомления — всё работает внутри клиента.'],
    ['Откуда скачивается лаунчер?', 'С Google Drive — прямая ссылка, без ожиданий и рекламы. Файл ~77 MB.']
  ];
  const faqList = document.getElementById('faq-list');
  if (faqList) {
    faqList.innerHTML = faqs.map((f, i) => '<details style="animation-delay:' + (i * 0.05) + 's"><summary>' + f[0] + '</summary><div class="faq-answer">' + f[1] + '</div></details>').join('');
    const ds = faqList.querySelectorAll('details');
    ds.forEach(d => { const s = d.querySelector('summary'); const a = d.querySelector('.faq-answer'); if (!a) return; a.style.maxHeight = '0'; a.style.opacity = '0'; a.style.overflow = 'hidden'; a.style.transition = 'max-height .4s cubic-bezier(.25,.46,.45,.94), opacity .3s ease'; d.addEventListener('toggle', () => { if (d.open) { a.style.maxHeight = a.scrollHeight + 'px'; a.style.opacity = '1'; } else { a.style.maxHeight = '0'; a.style.opacity = '0'; } }); s.addEventListener('click', () => { if (!d.open) ds.forEach(o => { if (o !== d && o.open) o.open = false; }); }); });
  }

  /* ================= VERTICAL COMPARISON SLIDER ================= */
  const slider = document.getElementById('comparison-slider');
  if (slider) {
    const topLayer = slider.querySelector('.slider-before');
    const line = slider.querySelector('.slider-track');
    const handle = slider.querySelector('.slider-handle');
    const dot = slider.querySelector('.slider-dot');

    function setPos(clientX) {
      const rect = slider.getBoundingClientRect();
      let p = ((clientX - rect.left) / rect.width) * 100;
      p = Math.max(0, Math.min(100, p));
      topLayer.style.clipPath = 'polygon(0 0, ' + p + '% 0, ' + p + '% 100%, 0 100%)';
      line.style.left = p + '%';
      handle.style.left = p + '%';
      handle.setAttribute('aria-valuenow', Math.round(p));
    }

    let dragging = false;

    function startDrag(e) {
      dragging = true;
      handle.style.transition = 'none';
      document.body.style.userSelect = 'none';
    }
    function moveDrag(e) {
      if (!dragging) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      setPos(x);
    }
    function endDrag() {
      dragging = false;
      handle.style.transition = 'left .12s ease';
      document.body.style.userSelect = '';
    }

    if (handle) {
      handle.addEventListener('mousedown', startDrag);
      handle.addEventListener('touchstart', startDrag, { passive: true });
    }
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('touchmove', moveDrag, { passive: true });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);

    slider.addEventListener('click', (e) => { if (e.target.closest('.slider-handle')) return; setPos(e.clientX); });

    if (handle) handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 5;
      let p = parseFloat(handle.style.left) || 50;
      if (e.key === 'ArrowLeft') p = Math.max(0, p - step);
      else if (e.key === 'ArrowRight') p = Math.min(100, p + step);
      else return;
      e.preventDefault();
      topLayer.style.clipPath = 'polygon(0 0, ' + p + '% 0, ' + p + '% 100%, 0 100%)';
      line.style.left = p + '%';
      handle.style.left = p + '%';
      handle.setAttribute('aria-valuenow', Math.round(p));
    });
  }

  /* ================= PROFILE ================= */
  const navProfileLink = document.getElementById('nav-profile-link');
  if (navProfileLink) {
    navProfileLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/profile.html';
    });
  }

  /* ================= CHAT (ntfy.sh — общий онлайн-чат) ================= */
  const NTFY_BASE = 'https://ntfy.sh';
  // Определяем бэкенд (прокси Vercel / Firebase / ntfy) до подписок
  var backendReady = (window.ChatBackend && window.ChatBackend.detect)
    ? window.ChatBackend.detect()
    : Promise.resolve('ntfy');
          const CHAT_KEY = 'nebula_chat';
  const CHAT_MAX = 80;
  const NICK_KEY = 'nebula_chat_nick';

  const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadChat() {
    try { return JSON.parse(localStorage.getItem(CHAT_KEY)) || []; } catch (e) { return []; }
  }
  function saveChat(list) {
    const data = list.slice(-CHAT_MAX);
    // аватары храним только у последних 20 сообщений — экономим место в localStorage
    const lite = data.map(function (m, i) {
      if (i >= data.length - 20) return m;
      return { id: m.id, n: m.n, x: m.x, ts: m.ts };
    });
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(lite)); return true; }
    catch (e) {
      try { localStorage.setItem(CHAT_KEY, JSON.stringify(lite.slice(-20))); } catch (e2) {}
      return false;
    }
  }

  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function formatDay(ts) {
    const d = new Date(ts);
    let s = d.getDate() + ' ' + MONTHS[d.getMonth()];
    if (d.getFullYear() !== new Date().getFullYear()) s += ' ' + d.getFullYear();
    return s;
  }
  function formatMsgTime(ts) {
    const d = new Date(ts);
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (dayKey(ts) === dayKey(Date.now())) return time;
    return formatDay(ts) + ', ' + time;
  }

  // Аватар: маленькая копия (48x48 JPEG) — чтобы влезало в сообщение
  function makeAvatarSmall(dataUrl) {
    return new Promise(function (resolve) {
      if (!dataUrl) return resolve('');
      const img = new Image();
      img.onload = function () {
        try {
          const c = document.createElement('canvas');
          c.width = 48; c.height = 48;
          const ctx = c.getContext('2d');
          const s = Math.min(img.width, img.height);
          const sx = (img.width - s) / 2, sy = (img.height - s) / 2;
          ctx.drawImage(img, sx, sy, s, s, 0, 0, 48, 48);
          const out = c.toDataURL('image/jpeg', 0.6);
          resolve(out.length < 3000 ? out : '');
        } catch (e) { resolve(''); }
      };
      img.onerror = function () { resolve(''); };
      img.src = dataUrl;
    });
  }

  // Полный аватар (для хедера сайта)
  function myAvatarFull() {
    const a = AuthState.user;
    if (!a) return '';
    const users = loadUsers();
    const u = users.find(function (x) { return x.username === a.username; });
    if (u && u.avatar) return u.avatar;
    return a.avatar || '';
  }

  // Маленький аватар 40x40 (для чата и списка онлайн)
  function myAvatarSmall() {
    const a = AuthState.user;
    if (!a) return Promise.resolve('');
    const users = loadUsers();
    const u = users.find(function (x) { return x.username === a.username; });
    const full = (u && u.avatar) || a.avatar || '';
    const cached = (u && u.avatarSmall) || a.avatarSmall || '';
    if (cached) return Promise.resolve(cached);
    if (!full) return Promise.resolve('');
    // генерируем маленькую копию из полной
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        try {
          const c = document.createElement('canvas');
          c.width = 40; c.height = 40;
          const ctx = c.getContext('2d');
          const s = Math.min(img.width, img.height);
          const sx = (img.width - s) / 2, sy = (img.height - s) / 2;
          ctx.drawImage(img, sx, sy, s, s, 0, 0, 40, 40);
          const small = c.toDataURL('image/jpeg', 0.5);
          resolve(small.length > 2600 ? '' : small);
        } catch (e) { resolve(''); }
      };
      img.onerror = function () { resolve(''); };
      img.src = full;
    });
  }

  // ---------- Рендер чата ----------
  let chatMessages = [];
  let pinnedMessage = null;
  const PINNED_KEY = 'nebula_chat_pinned';
  const PIN_OWNER = 'qqc0d';

  function isPinOwner() {
    return !!(AuthState.user && AuthState.user.username === PIN_OWNER);
  }

  function loadPinned() {
    try { pinnedMessage = JSON.parse(localStorage.getItem(PINNED_KEY)); }
    catch (e) { pinnedMessage = null; }
  }
  function savePinned(m) {
    pinnedMessage = m || null;
    try {
      if (pinnedMessage) localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedMessage));
      else localStorage.removeItem(PINNED_KEY);
    } catch (e) {}
    renderPinned();
  }

  function renderPinned() {
    const box = document.getElementById('chat-pinned');
    const body = document.getElementById('chat-pinned-body');
    if (!box || !body) return;
    if (!pinnedMessage) { box.hidden = true; return; }
    const users = loadUsers();
    const nick = pinnedMessage.n || pinnedMessage.nick || 'Гость';
    const text = pinnedMessage.x != null ? pinnedMessage.x : (pinnedMessage.text || '');
    const u = users.find(function (x) { return x.username === nick; });
    const cls = nickClass(nick, u ? u.email : '');
    body.innerHTML = '<span class="chat-pinned-nick ' + cls + '">' + escHtml(nick) + '</span>' +
      '<span class="chat-pinned-text">' + escHtml(text) + '</span>';
    box.hidden = false;
  }

  function pinMessage(m) {
    const payload = {
      id: m.id, n: m.n || m.nick, x: m.x != null ? m.x : m.text,
      a: m.a || '', ts: m.ts || Date.now()
    };
    // в отдельную тему — хранится для новых посетителей
    publish('state', { t: 'pin', msg: payload });
    // и в чат — чтобы появилось мгновенно у всех, кто онлайн
    publish('chat', { t: 'pin', msg: payload });
    savePinned(payload);
    renderChat();
    toast('Сообщение закреплено');
  }

  function unpinMessage() {
    publish('state', { t: 'unpin' });
    publish('chat', { t: 'unpin' });
    savePinned(null);
    renderChat();
    toast('Сообщение откреплено');
  }

  // Загрузка общего состояния (закреплённое сообщение) — видно всем новым посетителям
  function refreshSharedState() {
    fetchTopic('state', '24h').then(function (items) {
      if (!items.length) return;
      const last = items[items.length - 1];
      if (last && last.t === 'pin' && last.msg) {
        if (!pinnedMessage || pinnedMessage.id !== last.msg.id) {
          savePinned(last.msg);
          renderChat();
        }
      } else if (last && last.t === 'unpin') {
        if (pinnedMessage) { savePinned(null); renderChat(); }
      }
    });
  }

  // Онлайн-список: пинги из отдельной (лёгкой) темы
  function refreshOnlineFromHistory() {
    fetchTopic('presence', '2m').then(function (items) {
      let changed = false;
      items.forEach(function (m) {
        if (m && m.t === 'p' && m.n) {
          if (!onlineMap[m.n] || onlineMap[m.n].ts !== m.ts) {
            onlineMap[m.n] = { ts: m.ts || Date.now(), a: m.a || '' };
            changed = true;
          }
        }
      });
      if (changed) renderOnline();
    });
  }

  function renderChat() {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    if (chatMessages.length === 0) {
      box.innerHTML = '<div class="chat-empty">Сообщений пока нет. Напиши первым!</div>';
      return;
    }
    const users = loadUsers();
    const canPin = isPinOwner();
    const pinId = pinnedMessage ? pinnedMessage.id : null;
    let html = '';
    let lastDay = '';
    chatMessages.forEach(function (m) {
      // поддержка обоих форматов: новый (n/x) и старый (nick/text)
      const nick = m.n || m.nick || 'Гость';
      const text = m.x != null ? m.x : (m.text || '');
      const ts = m.ts || Date.now();
      const dk = dayKey(ts);
      if (dk !== lastDay) {
        lastDay = dk;
        html += '<div class="chat-day"><span>' + escHtml(formatDay(ts)) + '</span></div>';
      }
      const u = users.find(function (x) { return x.username === nick; });
      const cls = nickClass(nick, u ? u.email : '');
      const av = m.a
        ? '<img src="' + m.a + '" alt="" class="chat-avatar-img">'
        : '<span class="chat-avatar-letter">' + escHtml(nick.charAt(0).toUpperCase()) + '</span>';
      const isPinned = pinId && m.id === pinId;
      const pinBtn = canPin
        ? '<button type="button" class="chat-pin-btn' + (isPinned ? ' is-pinned' : '') + '" data-pin-id="' + escHtml(m.id || '') + '" title="' + (isPinned ? 'Открепить' : 'Закрепить') + '">📌</button>'
        : '';
      html += '<div class="chat-msg">' +
        '<div class="chat-avatar">' + av + '</div>' +
        '<div class="chat-body">' +
          '<div class="chat-head">' +
            '<span class="' + cls + '">' + escHtml(nick) + '</span>' +
            '<span class="chat-time">' + escHtml(formatMsgTime(ts)) + '</span>' +
            pinBtn +
          '</div>' +
          '<div class="chat-text">' + escHtml(text) + '</div>' +
        '</div>' +
      '</div>';
    });
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;

    // обработчики кнопок закрепления
    box.querySelectorAll('.chat-pin-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const id = btn.getAttribute('data-pin-id');
        if (pinnedMessage && pinnedMessage.id === id) { unpinMessage(); return; }
        const msg = chatMessages.find(function (x) { return x.id === id; });
        if (msg) pinMessage(msg);
      });
    });
  }

  // ---------- Онлайн ----------
  const onlineMap = {};

  function renderOnline() {
    const list = document.getElementById('online-list');
    const cnt = document.getElementById('online-count');
    if (!list) return;
    const now = Date.now();
    const alive = Object.keys(onlineMap).filter(function (k) { return now - onlineMap[k].ts < 80000; });
    if (cnt) cnt.textContent = alive.length;
    if (alive.length === 0) {
      list.innerHTML = '<li class="online-empty">Никого нет онлайн</li>';
      return;
    }
    const users = loadUsers();
    const me = (AuthState.user && AuthState.user.username) || '';

    // ранг роли: админ > кодер > тестировщик > пользователь
    function rank(nick) {
      const u = users.find(function (x) { return x.username === nick; });
      const r = rolesOf({ username: nick, email: u ? u.email : '' });
      if (r.indexOf('admin') !== -1) return 4;
      if (r.indexOf('coder') !== -1) return 3;
      if (r.indexOf('tester') !== -1) return 2;
      return 1;
    }

    // сначала главные (админы), потом свой ник, потом остальные по свежести
    alive.sort(function (a, b) {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return rb - ra;
      if (a === me) return -1;
      if (b === me) return 1;
      return (onlineMap[b].ts || 0) - (onlineMap[a].ts || 0);
    });
    list.innerHTML = alive.map(function (k) {
      const o = onlineMap[k];
      const u = users.find(function (x) { return x.username === k; });
      const cls = nickClass(k, u ? u.email : '');
      const av = o.a
        ? '<img src="' + o.a + '" alt="" class="online-avatar-img">'
        : '<span class="online-avatar-letter">' + escHtml(k.charAt(0).toUpperCase()) + '</span>';
      return '<li' + (k === me ? ' class="is-me"' : '') + '><span class="online-dot"></span>' + av + '<span class="' + cls + '">' + escHtml(k) + '</span>' + (k === me ? '<span class="online-me-tag">вы</span>' : '') + '</li>';
    }).join('');
  }

  // ---------- Публикация / подписка (ntfy.sh) ----------
  function publish(topic, payload) {
    try {
      fetch(NTFY_BASE + '/' + topic, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) {}
  }

  // Чтение последних сообщений темы (ntfy отдаёт JSON-строки)
  function fetchTopic(topic, since) {
    return fetch(NTFY_BASE + '/' + topic + '/json?since=' + encodeURIComponent(since))
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (txt) {
        const out = [];
        txt.split('\n').forEach(function (line) {
          line = line.trim();
          if (!line) return;
          try {
            const ev = JSON.parse(line);
            if (ev.event !== 'message' || !ev.message) return;
            const data = JSON.parse(ev.message);
            out.push(data);
          } catch (e) { /* ignore */ }
        });
        return out;
      })
      .catch(function () { return []; });
  }

  function subscribe(topic, handler, onStatus) {
    let es = null;
    let closed = false;
    function connect() {
      if (closed) return;
      try {
        // ВАЖНО: /sse отдаёт text/event-stream (EventSource не принимает /json — это x-ndjson)
        es = new EventSource(NTFY_BASE + '/' + topic + '/sse?since=10m');
        es.onopen = function () { if (onStatus) onStatus('online'); };
        es.onmessage = function (ev) {
          if (onStatus) onStatus('online');
          try {
            const data = JSON.parse(ev.data);
            if (data.event && data.event !== 'message') return;
            if (!data.message) return;
            handler(JSON.parse(data.message));
          } catch (e) {}
        };
        es.onerror = function () {
          if (onStatus) onStatus('offline');
          try { es.close(); } catch (e) {}
          setTimeout(connect, 5000);
        };
      } catch (e) {
        if (onStatus) onStatus('offline');
        setTimeout(connect, 5000);
      }
    }
    connect();
    return { close: function () { closed = true; try { es.close(); } catch (e) {} } };
  }

  function addMessage(m) {
    if (!m || !m.n || !m.x) return;
    if (chatMessages.some(function (x) { return x.id === m.id; })) return;
    chatMessages.push(m);
    if (chatMessages.length > CHAT_MAX) chatMessages = chatMessages.slice(-CHAT_MAX);
    saveChat(chatMessages);
    renderChat();
  }

  // ---------- Инициализация чата ----------
  const chatSend = document.getElementById('chat-send');
  if (chatSend) {
   try {
    const textInput = document.getElementById('chat-text');
    const msg = document.getElementById('chat-msg');
    const meEl = document.getElementById('chat-me');
    const meNick = document.getElementById('chat-me-nick');
    const meAvatar = document.getElementById('chat-me-avatar');
    const loginHint = document.getElementById('chat-login-hint');
    const loginBtn = document.getElementById('chat-login-btn');

    // ник — ТОЛЬКО из профиля, изменить нельзя
    function myNick() {
      return (AuthState.user && AuthState.user.username) || '';
    }

    function refreshMe() {
      const nick = myNick();
      if (meNick) {
        meNick.textContent = nick || 'Войдите';
        meNick.className = 'chat-me-nick ' + (nick ? nickClass(nick, (AuthState.user && AuthState.user.email) || '') : '');
      }
      if (meAvatar) meAvatar.src = myAvatarFull() || '/logo-icon.png';
      const logged = !!nick;
      if (loginHint) loginHint.hidden = logged;
      if (textInput) textInput.disabled = !logged;
      if (chatSend) chatSend.disabled = !logged;
      if (textInput) textInput.placeholder = logged ? 'Напиши сообщение...' : 'Войдите, чтобы писать';
    }
    refreshMe();

    if (loginBtn) loginBtn.addEventListener('click', function () {
      if (window.openAuthModal) window.openAuthModal('login');
      else {
        const openBtn = document.getElementById('nav-auth-btn');
        if (openBtn) openBtn.click();
      }
    });

    // история из localStorage + подписка на новые
    chatMessages = loadChat();
    loadPinned();
    renderPinned();

    // кнопка открепления
    const pinClose = document.getElementById('chat-pinned-close');
    if (pinClose) pinClose.addEventListener('click', function () { unpinMessage(); });
    renderChat();

    // одна подписка на всё: сообщения + присутствие
    const statusEl = document.getElementById('chat-status');
    const statusText = document.getElementById('chat-status-text');
    function setStatus(state) {
      if (!statusEl) return;
      statusEl.classList.remove('is-online', 'is-offline');
      statusEl.classList.add(state === 'online' ? 'is-online' : 'is-offline');
      if (statusText) {
        statusText.textContent = state === 'online'
          ? 'подключено'
          : 'нет связи с чатом — переподключение...';
      }
      // при отсутствии связи показываем подсказку
      const hint = document.getElementById('chat-offline-hint');
      if (hint) hint.hidden = (state === 'online');
    }

    subscribe('chat', function (m) {
      if (!m) return;
      // закрепление/открепление — приходит мгновенно в чат-тему
      if (m.t === 'pin' && m.msg) { savePinned(m.msg); renderChat(); return; }
      if (m.t === 'unpin') { savePinned(null); renderChat(); return; }
      if (!m.n) return;
      if (m.t === 'p') {
        onlineMap[m.n] = { ts: m.ts || Date.now(), a: m.a || '' };
        renderOnline();
        return;
      }
      addMessage(m);
    }, setStatus);

    // общее состояние: закреплённое сообщение (видно всем)
    subscribe('state', function (m) {
      if (!m) return;
      if (m.t === 'pin' && m.msg) {
        savePinned(m.msg);
        renderChat();
        return;
      }
      if (m.t === 'unpin') {
        savePinned(null);
        renderChat();
      }
    }, function () { /* тихо */ });

    refreshSharedState();
    refreshOnlineFromHistory();
    setInterval(refreshSharedState, 30000);
    setInterval(refreshOnlineFromHistory, 8000);

    // пинг в онлайн (отдельная лёгкая тема)
    function ping() {
      const nick = myNick();
      if (!nick) return;
      myAvatarSmall().then(function (a) {
        publish('presence', { t: 'p', n: nick, a: a, ts: Date.now() });
        onlineMap[nick] = { ts: Date.now(), a: a };
        renderOnline();
      });
    }
    ping();
    setInterval(ping, 25000);
    setInterval(renderOnline, 5000);
    window.addEventListener('beforeunload', ping);

    // обновляем чат при входе/выходе
    window.addEventListener('auth-changed', function () {
      refreshMe();
      ping();
      renderOnline();
      renderPinned();
      renderChat();
    });

    chatSend.addEventListener('click', function () {
      const nick = myNick();
      const text = (textInput && textInput.value.trim()) || '';
      if (msg) { msg.className = 'form-msg'; }
      if (!nick) { if (msg) { msg.textContent = 'Войдите, чтобы писать в чат'; msg.classList.add('err'); } return; }
      if (!text) { if (msg) { msg.textContent = 'Введите сообщение'; msg.classList.add('err'); } return; }

      myAvatarSmall().then(function (a) {
        const payload = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), n: nick, x: text, a: a, ts: Date.now() };
        publish('chat', payload);
        addMessage(payload);
        if (textInput) textInput.value = '';
      });
    });

    if (textInput) {
      textInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); if (!textInput.disabled) chatSend.click(); }
      });
    }
   } catch (chatErr) {
     console.error('chat init error', chatErr);
   }
  }

  /* ================= TOAST ================= */
  window.toast = function (msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 2600);
  };

  /* ================= YEAR + INIT ================= */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  try { AuthState.init(); }
  catch (initErr) { console.error('init error', initErr); }
})();