// Nebula Visuals — backend чата
//
// Режимы (выбираются автоматически):
//   1) ПРОКСИ через Vercel — /api/chat  (основной: IP игроков не блокируются ntfy)
//   2) Firebase Realtime Database — впиши FIREBASE_DB_URL
//   3) ntfy.sh напрямую — запасной вариант
//
// Всё работает без регистрации. Firebase — если нужна максимальная надёжность.

var FIREBASE_DB_URL = '';   // напр. https://nebula-visuals-default-rtdb.firebaseio.com
var PROXY_URL = '/api/chat'; // Vercel Serverless Function (если недоступна — ntfy напрямую)

var NTFY = {
  base: 'https://ntfy.sh',
  chat: 'nebula-visuals-chat-v1',
  state: 'nebula-visuals-state-v1',
  presence: 'nebula-visuals-presence-v1'
};

var ChatBackend = (function () {

  var mode = 'proxy';   // 'proxy' | 'firebase' | 'ntfy'
  var modeLocked = false;   // после успешного определения режим больше не понижаем

  function topicName(path) { return NTFY[path] || path; }

  // ==================== PROXY (Vercel) ====================
  function proxyGet(since) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
    return fetch(PROXY_URL + '?since=' + encodeURIComponent(since || '10m'),
      { headers: { 'Accept': 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (to) clearTimeout(to); return r.ok ? r.json() : null; })
      .catch(function () { if (to) clearTimeout(to); return null; });
  }

  function proxyPost(topic, payload) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = ctrl ? setTimeout(function () { ctrl.abort(); }, 12000) : null;
    return fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: topic, payload: payload }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (to) clearTimeout(to);
      return r.json().catch(function () { return { ok: r.ok }; });
    }).catch(function () { if (to) clearTimeout(to); return { ok: false }; });
  }

  // ==================== FIREBASE ====================
  function fbEnabled() { return !!FIREBASE_DB_URL; }
  function fbUrl(path) { return FIREBASE_DB_URL.replace(/\/$/, '') + '/' + path + '.json'; }

  function fbGet(path) {
    return fetch(fbUrl(path), { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function fbSet(path, value) {
    return fetch(fbUrl(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  function fbStream(path, onData, onStatus) {
    var es;
    function connect() {
      if (onStatus) onStatus('online');
      try { es = new EventSource(fbUrl(path)); }
      catch (e) { if (onStatus) onStatus('offline'); setTimeout(connect, 5000); return; }
      es.onmessage = function (ev) {
        try {
          var val = JSON.parse(ev.data);
          if (val && val.node) val = val.node;
          onData(val);
        } catch (e) { /* ignore */ }
      };
      es.onerror = function () {
        if (onStatus) onStatus('offline');
        try { es.close(); } catch (e) {}
        setTimeout(connect, 5000);
      };
    }
    connect();
    return { close: function () { try { es.close(); } catch (e) {} } };
  }

  // ==================== NTFY ====================
  function ntfyPublish(topic, payload) {
    try {
      fetch(NTFY.base + '/' + topic, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) {}
  }

  function ntfyGet(topic, since) {
    return fetch(NTFY.base + '/' + topic + '/json?since=' + encodeURIComponent(since))
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (txt) {
        var out = [];
        txt.split('\n').forEach(function (line) {
          line = line.trim();
          if (!line) return;
          try {
            var ev = JSON.parse(line);
            if (ev.event !== 'message' || !ev.message) return;
            out.push(JSON.parse(ev.message));
          } catch (e) { /* ignore */ }
        });
        return out;
      })
      .catch(function () { return []; });
  }

  function ntfyStream(topic, onData, onStatus) {
    var es;
    function connect() {
      if (onStatus) onStatus('online');
      try { es = new EventSource(NTFY.base + '/' + topic + '/json?since=10m'); }
      catch (e) { if (onStatus) onStatus('offline'); setTimeout(connect, 5000); return; }
      es.onopen = function () { if (onStatus) onStatus('online'); };
      es.onmessage = function (ev) {
        if (onStatus) onStatus('online');
        try {
          var e2 = JSON.parse(ev.data);
          if (e2.event !== 'message' || !e2.message) return;
          onData(JSON.parse(e2.message));
        } catch (e) { /* ignore */ }
      };
      es.onerror = function () {
        if (onStatus) onStatus('offline');
        try { es.close(); } catch (e) {}
        setTimeout(connect, 5000);
      };
    }
    connect();
    return { close: function () { try { es.close(); } catch (e) {} } };
  }

  // ==================== ОПРЕДЕЛЕНИЕ РЕЖИМА ====================
  // Прокси — основной режим. Если первая попытка не удалась (холодный старт),
  // пробуем ещё несколько раз, прежде чем откатиться на ntfy.
  function detectRetry(attempts) {
    if (modeLocked) return Promise.resolve(mode);
    return proxyGet('10m').then(function (data) {
      if (data && data.ok) { mode = 'proxy'; modeLocked = true; return mode; }
      if (attempts > 0) {
        return new Promise(function (res) { setTimeout(res, 1500); })
          .then(function () { return detectRetry(attempts - 1); });
      }
      mode = 'proxy';       // прокси всё равно основной — не уходим в ntfy
      return mode;
    });
  }

  function detect() {
    if (fbEnabled()) { mode = 'firebase'; modeLocked = true; return Promise.resolve(mode); }
    if (modeLocked) return Promise.resolve(mode);
    return detectRetry(5);
  }

  // ==================== АККАУНТЫ (через прокси) ====================
  var authBase = '';

  function authCall(payload) {
    var url = (authBase || '') + PROXY_URL;
    var body = Object.assign({}, payload);
    if (body.op) { body.authOp = body.op; delete body.op; }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (to) clearTimeout(to);
      return r.json().catch(function () { return { ok: false, error: 'Ошибка ответа сервера' }; });
    }).catch(function () {
      if (to) clearTimeout(to);
      return { ok: false, error: 'Нет связи с сервером' };
    });
  }

  // ==================== PROXY: общий поллер ====================
  var proxyListeners = { chat: [], state: [], presence: [], mutes: [] };
  var proxyTimer = null;
  var proxySeen = { chat: {}, state: null };

  function proxyStart() {
    if (proxyTimer) return;
    function poll() {
      proxyGet('10m').then(function (data) {
        if (typeof window !== 'undefined' && data && data.purgedAt) window.__purgedAt = data.purgedAt;
        if (!data || !data.ok) {
          proxyListeners.chat.concat(proxyListeners.state, proxyListeners.presence, proxyListeners.mutes)
            .forEach(function (l) { if (l.onStatus) l.onStatus('offline'); });
          return;
        }
        proxyListeners.chat.concat(proxyListeners.state, proxyListeners.presence, proxyListeners.mutes)
          .forEach(function (l) { if (l.onStatus) l.onStatus('online'); });

        (data.chat || []).forEach(function (m) {
          if (!m || !m.n) return;
          var id = m.id || (m.n + ':' + m.ts);
          if (proxySeen.chat[id]) return;
          proxySeen.chat[id] = 1;
          proxyListeners.chat.forEach(function (l) { l.onData(m); });
        });

        if (data.state) {
          var sid = data.state.t + ':' + ((data.state.msg && data.state.msg.id) || '');
          if (proxySeen.state !== sid) {
            proxySeen.state = sid;
            proxyListeners.state.forEach(function (l) { l.onData(data.state); });
          }
        }

        (data.presence || []).forEach(function (m) {
          if (!m || !m.n) return;
          proxyListeners.presence.forEach(function (l) { l.onData(m); });
        });

        if (data.mutes) {
          proxyListeners.mutes.forEach(function (l) { l.onData(data.mutes); });
        }
      }).catch(function () {
        // неудачный опрос — повторяем быстро, чтобы не терять сообщения
        setTimeout(poll, 1200);
      });
    }
    proxyTimer = setInterval(poll, 3000);
  }

  // ==================== ПУБЛИЧНОЕ API ====================
  return {
    detect: detect,
    getMode: function () { return mode; },
    firebaseUrl: FIREBASE_DB_URL,

    // аккаунты: register / login / bind / check / group / unmute
    auth: function (payload) {
      if (mode === 'firebase' || mode === 'ntfy') {
        // серверные аккаунты доступны только через прокси
        return authCall(payload);
      }
      return authCall(payload);
    },

    // подписка: прокси (опрос) — основной режим
    stream: function (path, onData, onStatus) {
      if (mode === 'firebase') return fbStream(path, onData, onStatus);
      proxyStart();
      var listener = { onData: onData, onStatus: onStatus };
      proxyListeners[path] = proxyListeners[path] || [];
      proxyListeners[path].push(listener);
      return {
        close: function () {
          var arr = proxyListeners[path] || [];
          var i = arr.indexOf(listener);
          if (i !== -1) arr.splice(i, 1);
        }
      };
    },

    // публикация — всегда через прокси (кроме firebase)
    publish: function (path, payload) {
      if (mode === 'firebase') {
        if (path === 'chat') return fbSet('chat/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), payload);
        if (path === 'state') return fbSet('state', payload);
        if (path === 'presence') return fbSet('presence/' + (payload.n || 'guest'), { ts: payload.ts, a: payload.a || '' });
        return Promise.resolve(false);
      }
      return proxyPost(path, payload);
    },

    // чтение истории
    read: function (path, since) {
      if (mode === 'firebase') {
        if (path === 'chat') {
          return fbGet('chat').then(function (obj) {
            var out = [];
            if (obj) Object.keys(obj).sort().forEach(function (k) { out.push(obj[k]); });
            return out;
          });
        }
        if (path === 'state') return fbGet('state').then(function (v) { return v ? [v] : []; });
        if (path === 'presence') {
          return fbGet('presence').then(function (obj) {
            var out = [];
            if (obj) Object.keys(obj).forEach(function (k) {
              out.push({ t: 'p', n: k, ts: obj[k] && obj[k].ts, a: obj[k] && obj[k].a });
            });
            return out;
          });
        }
        return Promise.resolve([]);
      }
      // всегда читаем через прокси: ntfy напрямую из региона недоступен
      return proxyGet(since || '24h').then(function (data) {
        if (!data || !data.ok) return [];
        if (typeof window !== 'undefined' && data.purgedAt) window.__purgedAt = data.purgedAt;
        if (path === 'chat') return data.chat || [];
        if (path === 'state') return data.state ? [data.state] : [];
        if (path === 'presence') return data.presence || [];
        if (path === 'mutes') return data.mutes ? [data.mutes] : [];
        return [];
      });
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ChatBackend;
if (typeof window !== 'undefined') window.ChatBackend = ChatBackend;
