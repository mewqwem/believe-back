const rooms = new Map();

function generateRoomCode() {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  return rooms.has(code) ? generateRoomCode() : code;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const DEFAULT_MAX_PLAYERS = 4;

export function normalizeMaxPlayers(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return DEFAULT_MAX_PLAYERS;
  }
  if (value < MIN_PLAYERS || value > MAX_PLAYERS) {
    return DEFAULT_MAX_PLAYERS;
  }
  return value;
}

export function createRoom({ maxPlayers = DEFAULT_MAX_PLAYERS } = {}) {
  const roomId = generateRoomCode();
  const room = {
    roomId,
    maxPlayers: normalizeMaxPlayers(maxPlayers),
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
