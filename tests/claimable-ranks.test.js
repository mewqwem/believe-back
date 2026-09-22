import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAIMABLE_RANKS, generateDeck } from '../src/sockets/cards.js';
import { createRoom, deleteRoom } from '../src/sockets/rooms.js';
import { registerGameHandlers } from '../src/sockets/gameHandlers.js';

test('aces remain in the deck but cannot be declared', () => {
  assert.equal(generateDeck().filter((card) => card.rank === 'A').length, 4);
  assert.equal(CLAIMABLE_RANKS.includes('A'), false);

  const room = createRoom();
  const ace = generateDeck().find((card) => card.rank === 'A');
  room.status = 'PLAYING';
  room.players.push({ playerId: 'p1', socketId: 's1', name: 'Player', hand: [ace] });

  const handlers = new Map();
  const emitted = [];
  const socket = {
    id: 's1',
    on: (event, handler) => handlers.set(event, handler),
    emit: (event, payload) => emitted.push({ event, payload }),
  };
  registerGameHandlers({}, socket);

  try {
    handlers.get('PLAY_CARDS')({ roomId: room.roomId, cardIds: [ace.id], claimedRank: 'A' });
    assert.deepEqual(emitted, [{ event: 'ERROR', payload: { message: 'Некоректний заявлений ранг' } }]);
    assert.deepEqual(room.players[0].hand, [ace]);
    assert.equal(room.tablePile.length, 0);
    assert.equal(room.claimedRank, null);
  } finally {
    deleteRoom(room.roomId);
  }
});
