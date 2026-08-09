const rooms = new Map();

function generateRoomCode() {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  return rooms.has(code) ? generateRoomCode() : code;
}

export function createRoom() {
  const roomId = generateRoomCode();
  const room = {
    roomId,
    players: [],
    tablePile: [],
    discardPile: [],
    claimedRank: null,
    lastMoveCount: 0,
    lastPlayerId: null,
    currentTurnIndex: 0,
    status: 'LOBBY',
    finishOrder: [], // НОВЕ: playerId у порядку, як гравці спорожнили руку
  };
  rooms.set(roomId, room);
  return room;
}

export function getRoom(roomId) {
  return rooms.get(roomId);
}

export function deleteRoom(roomId) {
  return rooms.delete(roomId);
}

export function findRoomBySocketId(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.socketId === socketId)) return room; // ЗМІНА: socketId замість id
  }
  return undefined;
}
