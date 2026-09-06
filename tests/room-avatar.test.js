import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRoomHandlers } from '../src/sockets/roomHandlers.js';
import { getRoom, deleteRoom } from '../src/sockets/rooms.js';
import { toPublicRoom } from '../src/sockets/gameHelpers.js';

test('room creation and join share bounded avatars without exposing private player data', () => {
  const handlers = {};
  let roomId;
  const io = { to: () => ({ emit() {} }) };
  const socket = { id: 'test-socket', on: (name, fn) => { handlers[name] = fn; }, join() {}, emit: (name, data) => { if (name === 'ROOM_CREATED') roomId = data.roomId; } };
  registerRoomHandlers(io, socket);
  // Minimal JPEG boundary bytes exercise transport validation without a photo fixture.
  const avatar = 'data:image/jpeg;base64,/9j/2Q==';
  try {
    handlers.CREATE_ROOM({ playerName: 'Host', playerId: 'host', avatar });
    handlers.JOIN_ROOM({ roomId, playerName: 'Guest', playerId: 'guest' });
    handlers.JOIN_ROOM({ roomId, playerName: 'Invalid', playerId: 'invalid', avatar: 'data:image/svg+xml;base64,PHN2Zz4=' });
    const room = getRoom(roomId);
    room.players[0].hand = [{ id: 'private-card' }];
    const snapshot = toPublicRoom(room);
    assert.equal(snapshot.players[0].avatar, avatar);
    assert.equal(snapshot.players[1].avatar, null);
    assert.equal(snapshot.players[2].avatar, null);
    assert.equal(snapshot.players[0].cardCount, 1);
    assert.equal('hand' in snapshot.players[0], false);
    assert.equal('socketId' in snapshot.players[0], false);
    handlers.REJOIN_ROOM({ roomId, playerId: 'host' });
    assert.equal(toPublicRoom(room).players[0].avatar, avatar);
  } finally { if (roomId) deleteRoom(roomId); }
});
