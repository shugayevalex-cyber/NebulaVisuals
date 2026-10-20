// Vercel Serverless Function — прокси к ntfy.sh
// Браузер обращается только к /api/chat на своём хосте (Vercel).
// К ntfy.sh ходит только Vercel — поэтому IP игроков не блокируются.
//
// GET  /api/chat            -> { chat: [...], state: {...}, presence: {...} }
// POST /api/chat  {topic, payload}

const https = require('https');

const NTFY = 'https://ntfy.sh';
const TOPICS = {
  chat: 'nebula-visuals-chat-v1',
  state: 'nebula-visuals-state-v1',
  presence: 'nebula-visuals-presence-v1'
};

function ntfyGet(topic, since) {
  return new Promise((resolve) => {
    const url = NTFY + '/' + topic + '/json?since=' + encodeURIComponent(since);
    https.get(url, { headers: { 'User-Agent': 'NebulaVisuals/1.0' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
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
        resolve(out);
      });
    }).on('error', () => resolve([]));
  });
}

function ntfyPost(topic, body) {
  return new Promise((resolve) => {
    const u = new URL(NTFY + '/' + topic);
    const data = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': data.length }
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve(res.statusCode < 400));
    });
    req.on('error', () => resolve(false));
    req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // ---- публикация ----
  if (req.method === 'POST') {
    let body = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { body = {}; }
    const topic = TOPICS[body.topic] || TOPICS.chat;
    const payload = body.payload || {};
    const ok = await ntfyPost(topic, JSON.stringify(payload));
    return res.status(ok ? 200 : 502).json({ ok: ok });
  }

  // ---- чтение состояния (всё сразу) ----
  if (req.method === 'GET') {
    const since = (req.query && req.query.since) || '10m';
    const [chat, state, presence] = await Promise.all([
      ntfyGet(TOPICS.chat, since),
      ntfyGet(TOPICS.state, '24h'),
      ntfyGet(TOPICS.presence, '3m')
    ]);
    return res.status(200).json({
      ok: true,
      chat: chat,
      state: state.length ? state[state.length - 1] : null,
      presence: presence
    });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
