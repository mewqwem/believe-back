# Мапа проєкту Believe / Bluff

Перевірено за кодом: 2026-09-05. Це навігація по поточній реалізації; після структурних змін оновлювати відповідні розділи. Перед змінами також читати локальний `AGENTS.md`, якщо він є.

## Дві частини

- `believe-back` — Node.js, JavaScript ES modules, Express 5, Socket.IO 4. Сервер правил карткової гри «Вірю / не вірю».
- `../believe-front` — Next.js 16 App Router, React 19, TypeScript, Zustand, Tailwind CSS 4. Інтерфейс українською.
- Це два окремі Git-репозиторії зі своїми `package.json` і `package-lock.json`.
- Ігрові дані передаються через Socket.IO. Акаунти мають HTTP-маршрути `/auth/register`, `/auth/login`, `/auth/me`, `/auth/logout`.
- Кімнати, руки й результати зберігаються в пам’яті серверного процесу (`Map`), тому зникають після його перезапуску. MongoDB зберігає користувачів і сесії; збереження гри в БД поки немає.

## Як проходить дія

```text
Сторінка / React-компонент
  → store/useGameStore.ts (дія Zustand)
  → lib/socket.ts (Socket.IO client)
  → back: src/server.js → src/sockets/index.js
  → roomHandlers.js або gameHandlers.js
  → rooms.js + gameHelpers.js + cards.js
  → ROOM_UPDATED усій кімнаті / HAND_UPDATED конкретному гравцю
  → useGameStore.ts → оновлення інтерфейсу
```

Сервер визначає результат ходу. `toPublicRoom()` приховує вміст рук: інші гравці отримують лише кількість карт. Особиста рука надсилається окремою подією.

## Бекенд: де що лежить

| Файл | Відповідальність |
| --- | --- |
| `src/server.js` | Реальна точка входу: Express, HTTP, Socket.IO, CORS, middleware, запуск і фонове підключення БД. Поле `main` у package.json вказує на index.js, але npm-скрипти запускають саме цей файл. |
| `src/sockets/index.js` | Реєстрація обробників кімнат і гри для кожного з’єднання. |
| `src/sockets/rooms.js` | Map кімнат, генерація коду, створення/пошук/видалення кімнати, початковий стан. |
| `src/sockets/roomHandlers.js` | Створення, приєднання, повернення, вихід, старт, нове коло, disconnect і таймери повернення. |
| `src/sockets/gameHandlers.js` | Хід 1–4 картами, скидання сету, «Вірю / не вірю», перевірки дій та розсилання результатів. |
| `src/sockets/gameHelpers.js` | Публічний стан, черга ходу, завершення гравця/гри, передача карт, видалення гравців, перевірка сету; RECONNECT_GRACE_MS = 30000. |
| `src/sockets/cards.js` | Ранги 2–A, 52 карти, перемішування й роздача. |
| `src/db/connectMongoDB.js` | Підключення Mongoose через MONGODB_URI. |
| `src/middleware/logger.js` | HTTP-логування. |
| `src/middleware/notFoundHandler.js` | Обробка невідомих HTTP-маршрутів. |
| `src/middleware/errorHandler.js` | Обробка HTTP-помилок; ігрові ERROR надсилаються окремо через Socket.IO. |
| `test-client.js` | Окремий сценарій перевірки гри через Socket.IO; має застарілі припущення, див. нижче. |

## Фронтенд: де що лежить

Оновлення: власна авторизація реалізована. `src/models/User.js`, `Session.js` — моделі; `src/auth/service.js`, `router.js` — паролі Argon2id, токени сесій, валідація та API. На фронтенді `/api/auth/[action]` записує HttpOnly cookie, `lib/auth/session.ts` перевіряє сесію, `/account` показує профіль. Proxy робить попередню перевірку; layout/page акаунта перевіряють справжню сесію на сервері. Гостьові `/` та `/room/*` відкриті. Зміна профілю, аватара та статистика — наступні етапи. Деталі: [AUTH_SETUP.md](AUTH_SETUP.md).

Усі шляхи цього розділу відносні до `../believe-front`.

| Файл | Відповідальність |
| --- | --- |
| `app/layout.tsx` | Кореневий layout, metadata, українська мова, шрифти Fraunces/Inter, SocketProvider. |
| `app/page.tsx` | Маршрут `/`: Lobby та перехід у кімнату після отримання roomId. |
| `app/room/[roomId]/page.tsx` | Маршрут кімнати: повернення, вихід, запрошення, копіювання коду, старт/нове коло, компонування гри. |
| `app/globals.css` | Глобальні стилі, тема й кольори. |
| `components/SocketProvider.tsx` | Ініціалізація з’єднання через store; з’єднання зберігається між переходами сторінок. |
| `components/Lobby.tsx` | Ім’я, створення/вхід у кімнату, код запрошення з `/?code=...`. |
| `components/GameTable.tsx` | Стіл, гравці, поточний хід, результати й відлік часу відключення. |
| `components/PlayerHand.tsx` | Карти в руці, вибір карт і заявленого рангу, викладання та скидання сету. |
| `components/ActionPanel.tsx` | Дії «Вірю / не вірю». |
| `components/GameLog.tsx` | Історія подій і повідомлення. |
| `components/ui/` | Базові button, badge, card. |
| `store/useGameStore.ts` | Центральний стан UI, socket listeners/emits, особистість гравця, рука, вибрані карти, лог і помилки. |
| `lib/socket.ts` | Спільний Socket.IO-клієнт, URL зі змінної оточення, ручне підключення. |
| `types/game.ts` | Типи Suit, Rank, Card, Player, RoomState. |
| `lib/utils.ts` | `cn()` для об’єднання CSS-класів. |
| `public/` | Стандартні SVG-ресурси Next.js. |
| `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json` | Налаштування Next.js, TypeScript, lint, CSS і UI; alias `@/*` веде в корінь фронтенду. |
| `AGENTS.md` | Правила роботи агента; вимагає читати локальні Next.js guides перед зміною коду. |

`node_modules/` та `.next/` — залежності й згенеровані файли, не вихідний код. Файл `app/room/[roomId]/believe-back.code-workspace` — конфігурація редактора, не сторінка гри.

## Події Socket.IO

| Клієнт → сервер | Payload | Обробник |
| --- | --- | --- |
| CREATE_ROOM | playerName, playerId | roomHandlers.js |
| JOIN_ROOM | roomId, playerName, playerId | roomHandlers.js |
| REJOIN_ROOM / LEAVE_ROOM | roomId, playerId | roomHandlers.js |
| START_GAME / RESTART_GAME | roomId | roomHandlers.js |
| PLAY_CARDS | roomId, cardIds, claimedRank | gameHandlers.js |
| DISCARD_SET | roomId, cardIds | gameHandlers.js |
| RESPOND | roomId, action: BELIEVE або DOUBT | gameHandlers.js |

Сервер → клієнт: `ROOM_CREATED` (roomId, myPlayerId), `JOINED` (myPlayerId), `REJOINED` (roomId, myPlayerId, status), `ROOM_UPDATED` (публічний стан), `HAND_UPDATED` ({ hand }), `GAME_LOG` / `ERROR` ({ message }), `GAME_OVER` (reason і, залежно від результату, loserId, finishOrder).

## Стан і правила, важливі для навігації

- Кімната містить players, tablePile, discardPile, claimedRank, lastMoveCount, lastPlayerId, currentTurnIndex, status, finishOrder.
- Серверний гравець має сталий playerId та поточний socketId; вони виконують різні ролі. У публічному стані playerId називається `id`.
- Браузер зберігає `blefPlayerId` та `blefPlayerName` в localStorage; це клієнтська ідентичність, окремого механізму авторизації в переглянутому коді немає.
- На порожньому столі задається ранг; наступні докидання залишають його незмінним.
- RESPOND перевіряє чесність лише останнього докидання, але передає/скидає всю стопку.
- Сет — рівно 4 карти одного рангу; скидати можна у свій хід на порожньому столі.
- Повернення після disconnect має серверне вікно 30 секунд. Повернення у кімнату обробляється через REJOIN_ROOM.

## Що змінювати — де починати

| Задача | Основні файли |
| --- | --- |
| Правила ходу, блефу, сетів | back: gameHandlers.js, gameHelpers.js; front: PlayerHand.tsx, ActionPanel.tsx |
| Кімнати, старт, нове коло, вихід, reconnect | back: roomHandlers.js, rooms.js; front: useGameStore.ts, room page, SocketProvider.tsx |
| Нове поле стану або нова socket-подія | back: handlers + toPublicRoom(); front: types/game.ts + useGameStore.ts + потрібний компонент |
| Вигляд столу чи карт | front: GameTable.tsx, PlayerHand.tsx, globals.css |
| Лобі та запрошення | front: Lobby.tsx, app/page.tsx, app/room/[roomId]/page.tsx |
| Збереження ігор у БД | back: connectMongoDB.js і rooms.js; моделі/шар збереження ще потрібно реалізувати |
| URL з’єднання / CORS / запуск | front: lib/socket.ts; back: server.js; package.json обох репозиторіїв |

## Локальний запуск і перевірки

- Бекенд: `npm run dev` (nodemon) або `npm start`; типовий порт 3000.
- Для запуску без БД: `SKIP_DB=true npm run dev` у бекенді. `NODE_ENV=test` також пропускає БД.
- Змінні бекенду: PORT, FRONTEND_URL (типово http://localhost:3001), MONGODB_URI, SKIP_DB, NODE_ENV.
- Підключення Atlas: `MONGODB_DB` задає базу (типово `believe_dev`); `MONGODB_DNS_SERVERS` — необов’язковий список DNS через кому для мереж із проблемним SRV-resolution. Він впливає лише на DNS resolver процесу Node.js, не на системні налаштування. Таймаут вибору сервера — 10 секунд; помилка підключення більше не маскується повідомленням про успіх. Гостьова гра запускається незалежно від БД.
- Фронтенд: `NEXT_PUBLIC_SOCKET_URL=http://localhost:3000 npm run dev`; dev-порт явно встановлений на 3001.
- Фронтенд має `npm run lint`, `npm run build`, `npm start`. Production start не задає порт 3001: для одночасного локального запуску з бекендом потрібен відповідний PORT.
- Бекенд: `npm test` — локальні auth-тести, `npm run test:auth` — інтеграція Atlas, `npm run test:auth:frontend` — інтеграція фронтенду й гостьова гра. Старий `node test-client.js` потребує актуалізації.
- Значення наявних `.env` тут не копіюються. Команди вище описують конфігурацію коду, а не підтверджений запуск у цьому сеансі.

## Помічені розбіжності (не виправлені в межах мапування)

1. Сервер використовує LOBBY / PLAYING / GAME_OVER, а `types/game.ts` — LOBBY / IN_PROGRESS / FINISHED. Store приймає ROOM_UPDATED і REJOINED без перетворення статусу; лише GAME_OVER окремо встановлює FINISHED. При змінах стану перевіряти обидві сторони.
2. `test-client.js` не передає playerId при створенні/вході, хоча поточні handlers використовують його для ідентичності; також коментар і очікування описують чесність усієї стопки замість останнього докидання.
3. Максимальна кількість гравців підтримується від 2 до 10 (типово 4): задається хостом, валідується та обмежується сервером при JOIN_ROOM, а залишок карт при роздачі випадково розподіляється між гравцями.
4. Фронтенд README залишається шаблонним: згадує порт 3000 і Geist, тоді як код використовує dev-порт 3001 та Fraunces/Inter.

Це висновки з читання коду, не повний аудит і не результати виконання тестів.
