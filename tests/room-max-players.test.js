import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_MAX_PLAYERS,
  normalizeMaxPlayers,
  createRoom,
  getRoom,
  deleteRoom,
} from '../src/sockets/rooms.js';
import { generateDeck, dealCards } from '../src/sockets/cards.js';
import { toPublicRoom } from '../src/sockets/gameHelpers.js';
import { registerRoomHandlers } from '../src/sockets/roomHandlers.js';

test('normalizeMaxPlayers validates inputs strictly without auto-conversion or clamping', () => {
  assert.equal(normalizeMaxPlayers(2), 2);
  assert.equal(normalizeMaxPlayers(4), 4);
  assert.equal(normalizeMaxPlayers(10), 10);
  assert.equal(normalizeMaxPlayers(7), 7);

  // Non-number or invalid values must return DEFAULT_MAX_PLAYERS (4)
  assert.equal(normalizeMaxPlayers(undefined), 4);
  assert.equal(normalizeMaxPlayers(null), 4);
  assert.equal(normalizeMaxPlayers('6'), 4);
  assert.equal(normalizeMaxPlayers('4'), 4);
  assert.equal(normalizeMaxPlayers(NaN), 4);
  assert.equal(normalizeMaxPlayers(Infinity), 4);
  assert.equal(normalizeMaxPlayers(-Infinity), 4);
  assert.equal(normalizeMaxPlayers(3.5), 4);
  assert.equal(normalizeMaxPlayers({}), 4);
  assert.equal(normalizeMaxPlayers([]), 4);

  // Out of range numbers must return DEFAULT_MAX_PLAYERS (4), not clamped
  assert.equal(normalizeMaxPlayers(1), 4);
  assert.equal(normalizeMaxPlayers(0), 4);
  assert.equal(normalizeMaxPlayers(-5), 4);
  assert.equal(normalizeMaxPlayers(11), 4);
  assert.equal(normalizeMaxPlayers(100), 4);
});

test('createRoom sets normalized maxPlayers and toPublicRoom returns it without mutation', () => {
  const room1 = createRoom({ maxPlayers: 6 });
  assert.equal(room1.maxPlayers, 6);
  const publicSnapshot = toPublicRoom(room1);
  assert.equal(publicSnapshot.maxPlayers, 6);
  deleteRoom(room1.roomId);

  // Old/legacy room without maxPlayers field
  const legacyRoom = {
    roomId: 'LEGACY',
    status: 'LOBBY',
    tablePile: [],
    discardPile: [],
    claimedRank: null,
    lastMoveCount: 0,
    lastPlayerId: null,
    currentTurnIndex: 0,
    finishOrder: [],
    players: [],
  };
  assert.equal(toPublicRoom(legacyRoom).maxPlayers, DEFAULT_MAX_PLAYERS);
  assert.equal('maxPlayers' in legacyRoom, false); // must not mutate original object
});

test('dealCards distributes 52 cards fairly and randomly for 2 to 10 players', () => {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const deck = generateDeck();
    assert.equal(deck.length, 52);

    const hands = dealCards(deck, n);
    assert.equal(hands.length, n);

    // All 52 cards dealt
    const totalCards = hands.reduce((sum, h) => sum + h.length, 0);
    assert.equal(totalCards, 52, `Total cards for ${n} players must be 52`);

    // No duplicated cards
    const allCardIds = hands.flatMap((h) => h.map((c) => c.id));
    const uniqueCardIds = new Set(allCardIds);
    assert.equal(uniqueCardIds.size, 52, `Every card must be unique for ${n} players`);

    // Hand size difference <= 1
    const handSizes = hands.map((h) => h.length);
    const maxHand = Math.max(...handSizes);
    const minHand = Math.min(...handSizes);
    assert.ok(maxHand - minHand <= 1, `Max hand (${maxHand}) and min hand (${minHand}) difference must be <= 1`);

    // Number of players receiving remainder card
    const baseCards = Math.floor(52 / n);
    const remainder = 52 % n;
    const countWithExtra = handSizes.filter((s) => s === baseCards + 1).length;
    const countBase = handSizes.filter((s) => s === baseCards).length;
    assert.equal(countWithExtra, remainder, `Exactly ${remainder} players should get an extra card`);
    assert.equal(countBase, n - remainder, `Exactly ${n - remainder} players should get base cards`);

    if (n === 10) {
      assert.equal(countWithExtra, 2, 'For 10 players, exactly 2 players get 6 cards');
      assert.equal(countBase, 8, 'For 10 players, exactly 8 players get 5 cards');
    }
  }

  // Verify remainder cards are not always given to the same players (e.g. at 5 players, remainder is 2)
  const deck = generateDeck();
  const luckyPlayerCounts = Array(5).fill(0);
  for (let trial = 0; trial < 100; trial++) {
    const hands = dealCards(deck, 5);
    hands.forEach((hand, idx) => {
      if (hand.length === 11) luckyPlayerCounts[idx]++;
    });
  }
  // All 5 players should receive an extra card in at least one of the 100 trials
  luckyPlayerCounts.forEach((count, idx) => {
    assert.ok(count > 0, `Player ${idx} should have received a remainder card across 100 trials (got ${count})`);
  });

  // Deterministic randomFn test
  let step = 0;
  const mockRandom = () => {
    // Return deterministic pseudo-random values
    step++;
    return (step * 0.17) % 1;
  };
  const deterministicHands = dealCards(deck, 3, mockRandom);
  assert.equal(deterministicHands.length, 3);
  assert.equal(deterministicHands.reduce((s, h) => s + h.length, 0), 52);
});

test('room capacity enforcement, duplicate join prevention, and reconnect in full room', () => {
  const io = {
    to: () => ({
      emit() {},
    }),
  };

  const createMockSocket = (id) => {
    const handlers = {};
    const emitted = [];
    const socket = {
      id,
      on: (name, fn) => {
        handlers[name] = fn;
      },
      join() {},
      leave() {},
      emit: (name, data) => {
        emitted.push({ name, data });
      },
      broadcast: {
        to: () => ({ emit() {} }),
      },
    };
    registerRoomHandlers(io, socket);
    return { socket, handlers, emitted };
  };

  const host = createMockSocket('host-socket');
  const guest1 = createMockSocket('guest1-socket');
  const guest2 = createMockSocket('guest2-socket');
  const extraGuest = createMockSocket('extra-guest-socket');

  let roomId;
  try {
    // 1. Host creates room with maxPlayers = 3
    host.handlers.CREATE_ROOM({
      playerName: 'Host',
      playerId: 'p-host',
      maxPlayers: 3,
    });
    const createdEvent = host.emitted.find((e) => e.name === 'ROOM_CREATED');
    assert.ok(createdEvent);
    roomId = createdEvent.data.roomId;

    const room = getRoom(roomId);
    assert.equal(room.maxPlayers, 3);
    assert.equal(room.players.length, 1);

    // 2. Guest 1 joins (2/3)
    guest1.handlers.JOIN_ROOM({
      roomId,
      playerName: 'Guest 1',
      playerId: 'p-guest1',
    });
    assert.equal(room.players.length, 2);
    assert.ok(guest1.emitted.find((e) => e.name === 'JOINED'));

    // 3. Guest 2 joins (3/3 - full)
    guest2.handlers.JOIN_ROOM({
      roomId,
      playerName: 'Guest 2',
      playerId: 'p-guest2',
    });
    assert.equal(room.players.length, 3);
    assert.ok(guest2.emitted.find((e) => e.name === 'JOINED'));

    // 4. Duplicate JOIN_ROOM from already active guest2
    guest2.emitted.length = 0;
    guest2.handlers.JOIN_ROOM({
      roomId,
      playerName: 'Guest 2 clone',
      playerId: 'p-guest2',
    });
    const dupError = guest2.emitted.find((e) => e.name === 'ERROR');
    assert.ok(dupError);
    assert.equal(dupError.data.code, 'PLAYER_ALREADY_IN_ROOM');
    assert.equal(room.players.length, 3); // no duplicate added

    // 5. 4th player attempts to join -> ROOM_FULL error
    extraGuest.handlers.JOIN_ROOM({
      roomId,
      playerName: 'Extra Guest',
      playerId: 'p-extra',
    });
    const roomFullError = extraGuest.emitted.find((e) => e.name === 'ERROR');
    assert.ok(roomFullError);
    assert.equal(roomFullError.data.code, 'ROOM_FULL');
    assert.equal(roomFullError.data.message, 'lobby.roomFull');
    assert.equal(room.players.length, 3); // player not added

    // 6. Guest 1 disconnects (enters grace period) -> still occupies slot
    guest1.handlers.disconnect();
    const pGuest1 = room.players.find((p) => p.playerId === 'p-guest1');
    assert.equal(pGuest1.isDisconnected, true);
    assert.equal(room.players.length, 3); // slot reserved

    // Another player tries to join while guest 1 is disconnected -> still rejected
    extraGuest.emitted.length = 0;
    extraGuest.handlers.JOIN_ROOM({
      roomId,
      playerName: 'Extra Guest 2',
      playerId: 'p-extra2',
    });
    const roomStillFull = extraGuest.emitted.find((e) => e.name === 'ERROR');
    assert.ok(roomStillFull);
    assert.equal(roomStillFull.data.code, 'ROOM_FULL');

    // 7. Guest 1 reconnects via JOIN_ROOM -> succeeds in full room!
    const reconnectedGuest1 = createMockSocket('guest1-new-socket');
    reconnectedGuest1.handlers.JOIN_ROOM({
      roomId,
      playerName: 'Guest 1',
      playerId: 'p-guest1',
    });
    assert.equal(pGuest1.isDisconnected, false);
    assert.equal(pGuest1.socketId, 'guest1-new-socket');
    assert.equal(room.players.length, 3); // count remains 3
    assert.ok(reconnectedGuest1.emitted.find((e) => e.name === 'JOINED'));

    // 8. Reconnect via REJOIN_ROOM also works in full room
    pGuest1.isDisconnected = true;
    const rejoinGuest1 = createMockSocket('guest1-rejoin-socket');
    rejoinGuest1.handlers.REJOIN_ROOM({
      roomId,
      playerId: 'p-guest1',
    });
    assert.equal(pGuest1.isDisconnected, false);
    assert.ok(rejoinGuest1.emitted.find((e) => e.name === 'REJOINED'));

    // 9. Start game and verify new players cannot join
    host.handlers.START_GAME({ roomId });
    assert.equal(room.status, 'PLAYING');
    extraGuest.emitted.length = 0;
    extraGuest.handlers.JOIN_ROOM({
      roomId,
      playerName: 'Extra Guest',
      playerId: 'p-extra',
    });
    const gameStartedError = extraGuest.emitted.find((e) => e.name === 'ERROR');
    assert.ok(gameStartedError);
    assert.equal(gameStartedError.data.code, 'GAME_ALREADY_STARTED');
  } finally {
    if (roomId) deleteRoom(roomId);
  }
});
