## Deploy to Render — пошагово

Ссылка: https://render.com

### 1. Залей код на GitHub
В папке `D:\NebulaVisuals\site` выполни (нужен установленный Git):

```bat
cd /d D:\NebulaVisuals\site
git init
git add .
git commit -m "Nebula Visuals website"
git branch -M main
git remote add origin https://github.com/ТВОЙ_НИК/nebula-visuals-site.git
git push -u origin main
```

Сначала создай пустой репозиторий `nebula-visuals-site` на https://github.com/new
(без README и .gitignore — они уже есть).

### 2. Создай Web Service на Render
1. Зарегистрируйся на https://render.com (можно через GitHub-аккаунт).
2. Нажми **New +** → **Web Service**.
3. Подключи свой GitHub и выбери репозиторий `nebula-visuals-site`.
4. Настройки:
   - **Name:** `nebulavisuals`
   - **Region:** выбери ближайший (Frankfurt для России)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Открой **Advanced** → **Add Environment Variable**:
   - `SESSION_SECRET` = любая длинная случайная строка
6. Нажми **Create Web Service**.

### 3. Получи бесплатный адрес
Через 2–5 минут Render выдаст адрес вида:

```
https://nebulavisuals.onrender.com
```

Это и есть твой бесплатный домен. Он работает как обычный сайт.

### 4. Прикрепи инсталлер
На бесплатном тарифе Render диск сбрасывается при перезапуске, поэтому файл `.exe`
лучше раздавать со **Static Site** или включить **Persistent Disk**:
- **Persistent Disk** (есть на платных тарифах), либо
- положи инсталлер в отдельный Static Site на Render и поменяй ссылку.

### Как зайти на сайт
- **Локально (на своём ПК):** `http://localhost:3000` — запусти `npm start` в папке сайта.
- **В интернете:** адрес, который выдаст Render после выкладки.

### Обновить сайт после правок
```bat
cd /d D:\NebulaVisuals\site
git add .
git commit -m "update"
git push
```
Render сам пересоберёт сайт за пару минут.
