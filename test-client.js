// test-client.js
import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3000';

// --- Допоміжні функції ---

function waitForEvent(socket, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(`Таймаут: подія "${eventName}" не прийшла за ${timeoutMs}мс`),
      );
    }, timeoutMs);

    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function connectPlayer(name) {
  return new Promise((resolve) => {
    const socket = io(SERVER_URL);
    socket.on('connect', () => resolve(socket));
  });
}

function check(condition, message) {
  if (condition) {
    console.log(`✅ ${message}`);
  } else {
    console.log(`❌ ${message}`);
    throw new Error(`Перевірка провалена: ${message}`);
  }
}

// --- Сценарій тестування ---

async function runTests() {
  console.log('--- Тест 1: створення кімнати ---');
  const player1 = await connectPlayer('Гравець1');
  player1.emit('CREATE_ROOM', { playerName: 'Олег' });
  const { roomId } = await waitForEvent(player1, 'ROOM_CREATED');
  check(
    typeof roomId === 'string' && roomId.length > 0,
    `Кімната створена, код: ${roomId}`,
  );

  console.log('\n--- Тест 2: приєднання другого гравця ---');
  const player2 = await connectPlayer('Гравець2');
  const room1Updated = waitForEvent(player1, 'ROOM_UPDATED');
  player2.emit('JOIN_ROOM', { roomId, playerName: 'Сергій' });
  const roomAfterJoin = await room1Updated;
  check(
    roomAfterJoin.players.length === 2,
    `У кімнаті 2 гравці (є: ${roomAfterJoin.players.length})`,
  );
  check(
    roomAfterJoin.players.map((p) => p.name).includes('Сергій'),
    'Другий гравець з правильним іменем присутній у списку',
  );

  console.log('\n--- Тест 3: старт гри і роздача карт ---');
  const hand1Promise = waitForEvent(player1, 'HAND_UPDATED');
  const hand2Promise = waitForEvent(player2, 'HAND_UPDATED');
  const roomStartedPromise = waitForEvent(player1, 'ROOM_UPDATED');

  player1.emit('START_GAME', { roomId });

  const [hand1, hand2, roomStarted] = await Promise.all([
    hand1Promise,
    hand2Promise,
    roomStartedPromise,
  ]);

  check(
    hand1.hand.length === 26,
    `Гравець 1 отримав 26 карт (є: ${hand1.hand.length})`,
  );
  check(
    hand2.hand.length === 26,
    `Гравець 2 отримав 26 карт (є: ${hand2.hand.length})`,
  );
  check(
    !JSON.stringify(roomStarted.players).includes('rank'),
    'Публічний ROOM_UPDATED НЕ містить чужих карт (тільки cardCount)',
  );
  check(
    roomStarted.status === 'PLAYING',
    `Статус кімнати змінився на PLAYING (є: ${roomStarted.status})`,
  );

  const allCardIds = new Set([
    ...hand1.hand.map((c) => c.id),
    ...hand2.hand.map((c) => c.id),
  ]);
  check(
    allCardIds.size === 52,
    `Всього унікальних карт між руками — 52 (є: ${allCardIds.size})`,
  );

  console.log('\n--- Тест 4: чесний хід + "Вірю" (правильна віра) ---');
  const cardToPlay = hand1.hand[0]; // беремо реальну карту гравця 1
  const claimedHonestly = cardToPlay.rank; // заявляємо правдивий ранг

  const roomAfterPlay1Promise = waitForEvent(player2, 'ROOM_UPDATED');
  const hand1AfterPlayPromise = waitForEvent(player1, 'HAND_UPDATED');
  player1.emit('PLAY_CARDS', {
    roomId,
    cardIds: [cardToPlay.id],
    claimedRank: claimedHonestly,
  });
  const [roomAfterPlay1, hand1AfterPlay] = await Promise.all([
    roomAfterPlay1Promise,
    hand1AfterPlayPromise,
  ]);

  check(
    hand1AfterPlay.hand.length === hand1.hand.length - 1,
    'У гравця 1 стало на 1 карту менше',
  );
  check(
    roomAfterPlay1.currentTurnIndex === 1,
    'Хід перейшов до гравця 2 (черга відповідати)',
  );

  const roomAfterRespond1Promise = waitForEvent(player1, 'ROOM_UPDATED');
  player2.emit('RESPOND', { roomId, action: 'BELIEVE' });
  const roomAfterRespond1 = await roomAfterRespond1Promise;

  check(
    roomAfterRespond1.currentTurnIndex === 1,
    'Хід лишився у гравця 2 (чесний хід + Вірю = відбій)',
  );
  check(
    roomAfterRespond1.players[1].cardCount === hand2.hand.length,
    'Гравець 2 не отримав жодної карти (правильна віра)',
  );

  console.log('\n--- Тест 5: блеф + "Не вірю" (спіймали на брехні) ---');
  const cardToBluff = hand2.hand[0];
  const fakeRank = cardToBluff.rank === '2' ? '3' : '2'; // свідомо неправдивий ранг

  const roomAfterPlay2Promise = waitForEvent(player1, 'ROOM_UPDATED');
  const hand2AfterPlayPromise = waitForEvent(player2, 'HAND_UPDATED');
  player2.emit('PLAY_CARDS', {
    roomId,
    cardIds: [cardToBluff.id],
    claimedRank: fakeRank,
  });
  const [roomAfterPlay2, hand2AfterPlay] = await Promise.all([
    roomAfterPlay2Promise,
    hand2AfterPlayPromise,
  ]);

  check(
    hand2AfterPlay.hand.length === hand2.hand.length - 1,
    'У гравця 2 стало на 1 карту менше (заблефував)',
  );
  check(
    roomAfterPlay2.currentTurnIndex === 0,
    'Хід перейшов до гравця 1 (черга відповідати на блеф)',
  );

  const roomAfterRespond2Promise = waitForEvent(player2, 'ROOM_UPDATED');
  const hand2ReturnedPromise = waitForEvent(player2, 'HAND_UPDATED');
  player1.emit('RESPOND', { roomId, action: 'DOUBT' });
  const [roomAfterRespond2, hand2Returned] = await Promise.all([
    roomAfterRespond2Promise,
    hand2ReturnedPromise,
  ]);

  check(
    hand2Returned.hand.length === hand2.hand.length,
    'Гравець 2 забрав карту назад (брехню спіймали)',
  );
  check(
    roomAfterRespond2.currentTurnIndex === 0,
    'Хід лишився у гравця 1 (правильно спіймав брехню)',
  );

  console.log('\n--- Тест 6: докидання карт (третя опція) ---');
  const cardA = hand1AfterPlay.hand[0]; // гравець 1 робить нову заявку
  const claimedRank6 = cardA.rank;

  const roomAfterNewClaimPromise = waitForEvent(player2, 'ROOM_UPDATED');
  player1.emit('PLAY_CARDS', {
    roomId,
    cardIds: [cardA.id],
    claimedRank: claimedRank6,
  });
  const roomAfterNewClaim = await roomAfterNewClaimPromise;

  check(
    roomAfterNewClaim.currentTurnIndex === 1,
    'Хід перейшов до гравця 2 (черга реагувати)',
  );
  check(
    roomAfterNewClaim.claimedRank === claimedRank6,
    `Заявлений ранг на столі: ${claimedRank6}`,
  );

  // Гравець 2 замість BELIEVE/DOUBT обирає третю опцію — докидає карту
  const cardB = hand2Returned.hand[0];
  const roomAfterAddPromise = waitForEvent(player1, 'ROOM_UPDATED');
  const hand2AfterAddPromise = waitForEvent(player2, 'HAND_UPDATED');
  player2.emit('PLAY_CARDS', {
    roomId,
    cardIds: [cardB.id],
    claimedRank: null,
  }); // ранг ігнорується сервером
  const [roomAfterAdd, hand2AfterAdd] = await Promise.all([
    roomAfterAddPromise,
    hand2AfterAddPromise,
  ]);

  check(
    hand2AfterAdd.hand.length === hand2Returned.hand.length - 1,
    'У гравця 2 стало на 1 карту менше (докинув)',
  );
  check(
    roomAfterAdd.claimedRank === claimedRank6,
    'Заявлений ранг НЕ змінився після докидання',
  );
  check(
    roomAfterAdd.currentTurnIndex === 0,
    'Хід перейшов назад до гравця 1 (тепер він реагує на 2 карти)',
  );

  // Тепер перевіряємо, що RESPOND рахує чесність по ВСІЙ стопці (обидві карти), а не тільки по останній
  const expectedHonest =
    cardA.rank === claimedRank6 && cardB.rank === claimedRank6;

  const roomAfterFinalRespondPromise = waitForEvent(player2, 'ROOM_UPDATED');
  player1.emit('RESPOND', { roomId, action: 'DOUBT' });
  const roomAfterFinalRespond = await roomAfterFinalRespondPromise;

  if (expectedHonest) {
    check(
      roomAfterFinalRespond.currentTurnIndex === 1,
      'Чесна стопка + Не вірю → відповідач (гравець 1) забирає, гравець 2 ходить далі',
    );
  } else {
    check(
      roomAfterFinalRespond.currentTurnIndex === 0,
      'Блеф у стопці + Не вірю → спіймали, гравець 1 ходить далі',
    );
  }

  console.log('\n🎉 Усі перевірки пройдені!');
  player1.disconnect();
  player2.disconnect();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n💥 Тест впав:', err.message);
  process.exit(1);
});
