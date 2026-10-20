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

  var mode = 'ntfy';   // 'proxy' | 'firebase' | 'ntfy'

  function topicName(path) { return NTFY[path] || path; }

  // ==================== PROXY (Vercel) ====================
  function proxyGet(since) {
    return fetch(PROXY_URL + '?since=' + encodeURIComponent(since || '10m'), { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function proxyPost(topic, payload) {
    return fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: topic, payload: payload })
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
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
  function detect() {
    if (fbEnabled()) { mode = 'firebase'; return Promise.resolve(mode); }
    return proxyGet('10m').then(function (data) {
      if (data && data.ok) { mode = 'proxy'; return mode; }
      mode = 'ntfy';
      return mode;
    });
  }

  // ==================== PROXY: общий поллер ====================
  var proxyListeners = { chat: [], state: [], presence: [] };
  var proxyTimer = null;
  var proxySeen = { chat: {}, state: null };

  function proxyStart() {
    if (proxyTimer) return;
    proxyTimer = setInterval(function () {
      proxyGet('10m').then(function (data) {
        if (!data || !data.ok) {
          proxyListeners.chat.concat(proxyListeners.state, proxyListeners.presence)
            .forEach(function (l) { if (l.onStatus) l.onStatus('offline'); });
          return;
        }
        proxyListeners.chat.concat(proxyListeners.state, proxyListeners.presence)
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
      });
    }, 3000);
  }

  // ==================== ПУБЛИЧНОЕ API ====================
  return {
    detect: detect,
    getMode: function () { return mode; },
    firebaseUrl: FIREBASE_DB_URL,

    // подписка: для proxy — опрос, для firebase/ntfy — SSE
    stream: function (path, onData, onStatus) {
      if (mode === 'firebase') return fbStream(path, onData, onStatus);
      if (mode === 'proxy') {
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
      }
      return ntfyStream(topicName(path), onData, onStatus);
    },

    // публикация
    publish: function (path, payload) {
      if (mode === 'firebase') {
        if (path === 'chat') return fbSet('chat/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), payload);
        if (path === 'state') return fbSet('state', payload);
        if (path === 'presence') return fbSet('presence/' + (payload.n || 'guest'), { ts: payload.ts, a: payload.a || '' });
        return Promise.resolve(false);
      }
      if (mode === 'proxy') return proxyPost(path, payload);
      ntfyPublish(topicName(path), payload);
      return Promise.resolve(true);
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
      if (mode === 'proxy') {
        return proxyGet(since || '24h').then(function (data) {
          if (!data || !data.ok) return [];
          if (path === 'chat') return data.chat || [];
          if (path === 'state') return data.state ? [data.state] : [];
          if (path === 'presence') return data.presence || [];
          return [];
        });
      }
      return ntfyGet(topicName(path), since || '24h');
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ChatBackend;
if (typeof window !== 'undefined') window.ChatBackend = ChatBackend;
