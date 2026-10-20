// Vercel Serverless Function — отправка кода подтверждения на почту
// POST /api/send-code  { "to_email": "user@gmail.com" }  -> { "ok": true, "code": "1234567890" }

const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = {};
  try { body = req.body || {}; } catch (e) { body = {}; }
  const toEmail = String(body.to_email || '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return res.status(400).json({ ok: false, error: 'Некорректный email' });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;
  if (!gmailUser || !gmailPass) {
    return res.status(500).json({ ok: false, error: 'SMTP не настроен (GMAIL_USER / GMAIL_PASS)' });
  }

  // 10-значный код из цифр
  const code = String(Math.floor(1000000000 + Math.random() * 9000000000));

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass }
  });

  try {
    await transporter.sendMail({
      from: '"Nebula Visuals" <' + gmailUser + '>',
      to: toEmail,
      subject: 'Код подтверждения Nebula Visuals',
      html:
        '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0b0d16;color:#f0f2fa;border-radius:16px;border:1px solid #2a2f45">' +
        '<h2 style="margin:0 0 12px">Nebula Visuals</h2>' +
        '<p>Здравствуйте! Ваш код подтверждения:</p>' +
        '<div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#4a9eff;margin:16px 0">' + code + '</div>' +
        '<p style="color:#9aa4b8">Введите его на сайте в поле «Введите код, который был прислан на вашу почту».</p>' +
        '<p style="color:#6b748c;font-size:12px">Если вы не запрашивали код — проигнорируйте письмо.</p>' +
        '</div>'
    });

    return res.status(200).json({ ok: true, code: code });
  } catch (err) {
    console.error('send-code error', err);
    return res.status(500).json({ ok: false, error: 'Не удалось отправить письмо' });
  }
};