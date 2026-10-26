// Вставка кодов подтверждения прав на сайт + автоматический деплой на Vercel.
//
// Как пользоваться:
//   1) Получите коды в Яндекс Вебмастере и Google Search Console
//   2) Запустите:  node set-verification.js
//   3) Вставьте два кода (по одному) и нажмите Enter
//   4) Скрипт сам подставит их в index.html и задеплоит сайт на Vercel
//
// Либо можно сразу передать коды аргументами:
//   node set-verification.js "yandex-код" "google-код"

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const ROOT = __dirname;
const INDEX = path.join(ROOT, 'public', 'index.html');
const Y_PLACEHOLDER = 'ВСТАВЬТЕ_КОД_ИЗ_ЯНДЕКС_ВЕБМАСТЕР';
const G_PLACEHOLDER = 'ВСТАВЬТЕ_КОД_ИЗ_GOOGLE_SEARCH_CONSOLE';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

function clean(code) {
  if (!code) return '';
  // пользователь может вставить целый тег <meta ...> — вытащим только значение
  const m = /content=["']([^"']+)["']/i.exec(code);
  let v = m ? m[1] : code;
  v = v.replace(/^["']|["']$/g, '').trim();
  return v;
}

(async () => {
  let yandex = process.argv[2] || '';
  let google = process.argv[3] || '';

  if (!yandex) {
    console.log('=== Коды подтверждения прав на сайт Nebula Visuals ===\n');
    yandex = clean(await ask('Код из Яндекс Вебмастера (например: 8a1b2c3d4e5f): '));
  }
  if (!google) {
    google = clean(await ask('Код из Google Search Console (например: AbCdEf123...): '));
  }

  if (!yandex || !google) {
    console.error('\nОдин из кодов пустой — ничего не изменено.');
    process.exit(1);
  }

  let html = fs.readFileSync(INDEX, 'utf8');
  const before = html;
  html = html.split(Y_PLACEHOLDER).join(yandex);
  html = html.split(G_PLACEHOLDER).join(google);

  if (html === before) {
    console.log('\nПлейсхолдеры не найдены — возможно, коды уже вставлены. Проверьте index.html.');
  } else {
    fs.writeFileSync(INDEX, html, 'utf8');
    console.log('\n✔ Коды вставлены в public\\index.html');
  }

  console.log('   yandex-verification: ' + yandex);
  console.log('   google-site-verification: ' + google);

  // Проверяем, что файл не побился
  try {
    new (require('vm').Script)(fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8'));
  } catch (e) { /* игнорируем */ }

  console.log('\nДеплой на Vercel...');
  try {
    execSync('npx.cmd vercel deploy --prod --yes', { cwd: ROOT, stdio: 'inherit' });
    console.log('\n✔ Готово! Сайт обновлён: https://nebulavisuals-public.vercel.app');
    console.log('  Проверка: https://nebulavisuals-public.vercel.app/robots.txt');
  } catch (e) {
    console.error('\n✖ Деплой не удался. Запустите вручную:');
    console.error('   cd ' + ROOT);
    console.error('   npx.cmd vercel deploy --prod --yes');
  }
})();
