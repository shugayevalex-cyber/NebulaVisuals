# Nebula Visuals — сайт с личным кабинетом

Сайт для клиента Nebula Visuals (Minecraft 1.21.4): презентация, скачивание лаунчера
и личный кабинет игрока (ник, почта, пароль, аватар, синхронизация настроек).

## Стек
- Node.js + Express
- SQLite (better-sqlite3) — база пользователей
- Сессии в SQLite (connect-sqlite3)
- Пароли хешируются bcrypt

## Запуск локально
```bat
cd D:\NebulaVisuals\site
npm install
npm start
```
Сайт откроется на http://localhost:3000

## Бесплатный хостинг

### Render (рекомендую)
1. Залей папку `site` в репозиторий на GitHub.
2. На https://render.com → New → Web Service → подключи репозиторий.
3. Настройки:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Готово — Render даст бесплатный адрес вида `nebula-visuals.onrender.com`.

### Railway
1. https://railway.app → New Project → Deploy from GitHub.
2. Railway сам определит Node.js проект и запустит `npm start`.
3. В разделе Settings → Networking нажми «Generate Domain».

### Переменные окружения
- `SESSION_SECRET` — секрет для сессий (на хостинге задай свой).
- `PORT` — Render/Railway задают автоматически.

## Как выложить инсталлер
Положи файл `Nebula Visuals Setup X.X.X.exe` в папку `site/downloads/`.
Сайт сам покажет последнюю версию и отдаст её по кнопке «Скачать установщик».

## Структура
```
site/
├── server.js            сервер (API + раздача статики)
├── package.json
├── public/
│   ├── index.html       страница сайта
│   ├── style.css        оформление
│   ├── app.js           логика кабинета
│   └── favicon.svg      иконка
├── downloads/           сюда кладётся инсталлер (.exe)
└── data/                база данных (создаётся автоматически)
```

## API
- `POST /api/register` — регистрация (ник, почта, пароль)
- `POST /api/login` — вход по нику или почте
- `POST /api/logout` — выход
- `GET  /api/me` — текущий пользователь
- `POST /api/profile` — обновление профиля (ник, почта, аватар, RAM)
- `POST /api/password` — смена пароля
- `GET  /api/download-info` — информация об инсталлере
- `GET  /api/download` — скачать инсталлер
