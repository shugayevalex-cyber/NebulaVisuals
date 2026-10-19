// Nebula Visuals — клиентская логика сайта (личный кабинет)
(function () {
  'use strict';

  var state = { user: null };

  function $(id) { return document.getElementById(id); }

  function api(url, opts) {
    opts = opts || {};
    return fetch(url, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'Ответ сервера повреждён' }; });
    });
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function showError(id, msg) { var el = $(id); if (el) el.textContent = msg || ''; }
  function showOk(id, msg) { var el = $(id); if (el) el.textContent = msg || ''; }

  // ---------- Модальные окна ----------
  function openModal(id) { $(id).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal(id) { $(id).hidden = true; document.body.style.overflow = ''; }

  // ---------- Отрисовка состояния входа ----------
  function renderAuthState() {
    var actions = $('nav-actions');
    if (state.user) {
      actions.innerHTML =
        '<button class="btn btn-ghost" id="btn-cabinet">' + esc(state.user.username) + '</button>' +
        '<button class="btn btn-primary" id="btn-logout">Выйти</button>';
      $('btn-cabinet').onclick = openCabinet;
      $('btn-logout').onclick = doLogout;
    } else {
      actions.innerHTML =
        '<button class="btn btn-ghost" id="btn-login">Войти</button>' +
        '<button class="btn btn-primary" id="btn-register">Регистрация</button>';
      $('btn-login').onclick = function () { openLogin(); };
      $('btn-register').onclick = function () { openRegister(); };
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- Вход / регистрация ----------
  function openLogin() {
    $('auth-login-view').hidden = false;
    $('auth-register-view').hidden = true;
    showError('login-error', '');
    openModal('auth-modal');
  }
  function openRegister() {
    $('auth-login-view').hidden = true;
    $('auth-register-view').hidden = false;
    showError('reg-error', '');
    openModal('auth-modal');
  }

  $('auth-close').onclick = function () { closeModal('auth-modal'); };
  $('switch-to-register').onclick = function (e) { e.preventDefault(); openRegister(); };
  $('switch-to-login').onclick = function (e) { e.preventDefault(); openLogin(); };
  $('btn-login').onclick = function () { openLogin(); };
  $('btn-register').onclick = function () { openRegister(); };
  $('hero-account').onclick = function () {
    if (state.user) openCabinet(); else openLogin();
  };
  $('auth-modal').onclick = function (e) { if (e.target === this) closeModal('auth-modal'); };

  $('login-submit').onclick = function () {
    var login = $('login-login').value.trim();
    var password = $('login-password').value;
    if (!login || !password) return showError('login-error', 'Введите ник и пароль');
    this.disabled = true;
    api('/api/login', { method: 'POST', body: { login: login, password: password } })
      .then(function (res) {
        $('login-submit').disabled = false;
        if (!res.ok) return showError('login-error', res.error);
        state.user = res.user;
        $('login-password').value = '';
        renderAuthState();
        closeModal('auth-modal');
        toast('Добро пожаловать, ' + res.user.username + '!');
      });
  };

  $('register-submit').onclick = function () {
    var username = $('reg-username').value.trim();
    var email = $('reg-email').value.trim();
    var password = $('reg-password').value;
    this.disabled = true;
    api('/api/register', { method: 'POST', body: { username: username, email: email, password: password } })
      .then(function (res) {
        $('register-submit').disabled = false;
        if (!res.ok) return showError('reg-error', res.error);
        state.user = res.user;
        $('reg-password').value = '';
        renderAuthState();
        closeModal('auth-modal');
        toast('Аккаунт создан!');
      });
  };

  function doLogout() {
    api('/api/logout', { method: 'POST' }).then(function () {
      state.user = null;
      renderAuthState();
      closeModal('cabinet-modal');
      toast('Вы вышли из аккаунта');
    });
  }
  $('cab-logout').onclick = doLogout;

  // ---------- Личный кабинет ----------
  function openCabinet() {
    if (!state.user) return openLogin();
    var u = state.user;
    $('cab-username').textContent = u.username;
    $('cab-created').textContent = 'На сайте с ' + fmtDate(u.createdAt);
    $('cab-lastlogin').textContent = 'Последний вход: ' + fmtDate(u.lastLogin);
    $('cab-input-username').value = u.username;
    $('cab-input-email').value = u.email;
    $('cab-input-ram').value = u.ram || 4096;
    $('sync-username').textContent = u.username;
    $('sync-ram').textContent = (u.ram || 4096) + ' МБ';
    $('cab-clear-avatar').checked = false;
    $('cab-input-avatar').value = '';
    showError('cab-profile-error', '');
    showOk('cab-profile-ok', '');
    renderAvatar();
    openModal('cabinet-modal');
  }
  $('btn-account').onclick = openCabinet;
  $('cabinet-close').onclick = function () { closeModal('cabinet-modal'); };
  $('cabinet-modal').onclick = function (e) { if (e.target === this) closeModal('cabinet-modal'); };

  function renderAvatar() {
    var el = $('cab-avatar');
    if (state.user && state.user.avatar) {
      el.style.backgroundImage = 'url(' + state.user.avatar + ')';
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = state.user ? state.user.username.charAt(0).toUpperCase() : '?';
    }
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Вкладки
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.onclick = function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      ['profile', 'security', 'sync'].forEach(function (name) {
        $('tab-' + name).hidden = (name !== tab.dataset.tab);
      });
    };
  });

  // Сохранение профиля
  $('cab-save-profile').onclick = function () {
    var body = {
      username: $('cab-input-username').value.trim(),
      email: $('cab-input-email').value.trim()
    };
    if ($('cab-clear-avatar').checked) body.avatar = '__clear__';

    var file = $('cab-input-avatar').files[0];
    var btn = this;
    btn.disabled = true;

    function save() {
      api('/api/profile', { method: 'POST', body: body }).then(function (res) {
        btn.disabled = false;
        if (!res.ok) return showError('cab-profile-error', res.error);
        showOk('cab-profile-ok', 'Профиль сохранён');
        showError('cab-profile-error', '');
        state.user = res.user;
        $('sync-username').textContent = res.user.username;
        $('cab-username').textContent = res.user.username;
        renderAuthState();
        renderAvatar();
        toast('Профиль обновлён');
      });
    }

    if (file) {
      if (file.size > 300 * 1024) {
        btn.disabled = false;
        return showError('cab-profile-error', 'Аватар больше 300 КБ');
      }
      var reader = new FileReader();
      reader.onload = function () { body.avatar = reader.result; save(); };
      reader.onerror = function () { btn.disabled = false; showError('cab-profile-error', 'Не удалось прочитать файл'); };
      reader.readAsDataURL(file);
    } else {
      save();
    }
  };

  // Смена пароля
  $('cab-save-password').onclick = function () {
    var btn = this;
    btn.disabled = true;
    api('/api/password', {
      method: 'POST',
      body: { current: $('cab-input-current').value, next: $('cab-input-next').value }
    }).then(function (res) {
      btn.disabled = false;
      $('cab-input-current').value = '';
      $('cab-input-next').value = '';
      if (!res.ok) return showError('cab-pass-error', res.error);
      showError('cab-pass-error', '');
      showOk('cab-pass-ok', 'Пароль изменён');
      toast('Пароль изменён');
    });
  };

  // Синхронизация RAM
  $('cab-save-ram').onclick = function () {
    var ram = parseInt($('cab-input-ram').value, 10) || 4096;
    api('/api/profile', {
      method: 'POST',
      body: { username: state.user.username, email: state.user.email, ram: ram }
    }).then(function (res) {
      if (!res.ok) return showOk('cab-ram-ok', res.error);
      state.user = res.user;
      $('sync-ram').textContent = res.user.ram + ' МБ';
      showOk('cab-ram-ok', 'Память сохранена');
      toast('Настройки синхронизированы');
    });
  };

  // ---------- Скачивание лаунчера ----------
  function loadDownloadInfo() {
    api('/api/download-info').then(function (res) {
      var meta = $('download-meta');
      if (res.available && res.latest) {
        meta.textContent = res.latest.name + ' · ' + (res.latest.size / 1048576).toFixed(1) + ' МБ';
      } else {
        meta.textContent = 'Инсталлер скоро появится';
        $('download-btn').disabled = true;
        $('hero-download').disabled = true;
      }
    });
  }

  function startDownload() {
    toast('Скачивание начинается...');
    window.location.href = '/api/download';
  }
  $('download-btn').onclick = startDownload;
  $('hero-download').onclick = startDownload;

  // ---------- Запуск ----------
  $('year').textContent = new Date().getFullYear();

  api('/api/me').then(function (res) {
    state.user = res.user || null;
    renderAuthState();
    loadDownloadInfo();
  });
})();
