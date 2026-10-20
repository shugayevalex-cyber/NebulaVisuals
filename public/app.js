// Nebula Visuals — static site logic (Vercel/Netlify ready)
// Video bg, particles, scroll reveal, vertical comparison slider, FAQ, auth modal + profile dropdown

(function () {
  'use strict';

  /* ================= AUTH STATE ================= */
  const USERS_KEY = 'nebula_users';
  const AUTH_KEY = 'nebula_auth';
  const ADMIN = { username: 'qqc0d', email: 'shugayevalex@gmail.com' };

  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch (e) { return []; }
  }
  function saveUsers(u) { try { localStorage.setItem(USERS_KEY, JSON.stringify(u)); } catch (e) {} }
  function roleOf(user) {
    return (user.username === ADMIN.username && user.email.toLowerCase() === ADMIN.email) ? 'admin' : 'user';
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

    save() { try { localStorage.setItem(AUTH_KEY, JSON.stringify(this.user)); } catch (e) {} },

    login(user, remember) {
      this.user = user;
      if (remember !== false) this.save(); else localStorage.removeItem(AUTH_KEY);
      this.updateUI();
    },

    register(user) {
      this.user = user;
      this.save();
      this.updateUI();
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
        if (avImg) avImg.src = u.avatar || '/logo-icon.png';
        setText('nav-profile-name', u.username);
      } else {
        if (navAuth) navAuth.style.display = 'flex';
        if (navProfile) navProfile.style.display = 'none';
      }
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
        const remember = document.getElementById('modal-remember').checked;
        if (!u || !p) { if (err) err.textContent = 'Введите ник/email и пароль'; return; }
        btn.disabled = true; btn.textContent = 'Вход...';
        setTimeout(() => {
          const users = loadUsers();
          const user = users.find(x => x.username.toLowerCase() === u.toLowerCase() || x.email.toLowerCase() === u.toLowerCase());
          if (!user || user.password !== p) { if (err) err.textContent = 'Неверный логин или пароль'; btn.disabled = false; btn.textContent = 'Войти'; return; }
          this.login(user, remember);
          if (ok) ok.textContent = 'Вход выполнен!';
          btn.disabled = false; btn.textContent = 'Войти';
          document.getElementById('modal-login-username').value = '';
          document.getElementById('modal-login-password').value = '';
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
          const user = { username, email, password, ram: 4096, avatar: '', joined: new Date().toISOString() };
          users.push(user);
          saveUsers(users);
          this.register(user);
          if (ok) ok.textContent = 'Регистрация успешна!';
          btn.disabled = false; btn.textContent = 'Зарегистрироваться';
          document.getElementById('modal-reg-username').value = '';
          document.getElementById('modal-reg-email').value = '';
          document.getElementById('modal-reg-password').value = '';
          document.getElementById('modal-reg-password-confirm').value = '';
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

  AuthState.init();
})();