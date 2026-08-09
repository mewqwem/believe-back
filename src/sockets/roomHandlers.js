import {
  createRoom,
  getRoom,
  findRoomBySocketId,
  deleteRoom,
} from './rooms.js';
import { generateDeck, shuffleDeck, dealCards } from './cards.js';
import {
  toPublicRoom,
  checkGameOver,
  removePlayerFromGame,
  removePlayerCompletely,
} from './gameHelpers.js';

const RECONNECT_GRACE_MS = 30000; // 30 секунд на реконект
const disconnectTimers = new Map(); // playerId -> timeoutId

export function registerRoomHandlers(io, socket) {
  socket.on('CREATE_ROOM', ({ playerName, playerId }) => {
    const room = createRoom();
    room.players.push({
      playerId,
      socketId: socket.id,
      name: playerName,
      hand: [],
      isDisconnected: false,
    });
    socket.join(room.roomId);
    socket.emit('ROOM_CREATED', { roomId: room.roomId, myPlayerId: playerId });
    io.to(room.roomId).emit('ROOM_UPDATED', toPublicRoom(room));
  });

  socket.on('JOIN_ROOM', ({ roomId, playerName, playerId }) => {
    const room = getRoom(roomId);
    if (!room) return socket.emit('ERROR', { message: 'Кімната не знайдена' });
    if (room.status !== 'LOBBY')
      return socket.emit('ERROR', { message: 'Гра вже почалась' });

    const alreadyInRoom = room.players.some((p) => p.playerId === playerId);
    if (alreadyInRoom) {
      return socket.emit('ERROR', {
        message:
          'Цей гравець уже в кімнаті (можливо, відкрито в іншій вкладці)',
      });
    }

    room.players.push({
      playerId,
      socketId: socket.id,
      name: playerName,
      hand: [],
      isDisconnected: false,
    });
    socket.join(roomId);
    socket.emit('JOINED', { myPlayerId: playerId });
    io.to(roomId).emit('ROOM_UPDATED', toPublicRoom(room));
  });

  socket.on('REJOIN_ROOM', ({ roomId, playerId }) => {
    const room = getRoom(roomId);
    if (!room)
      return socket.emit('ERROR', {
        message: 'Кімната не знайдена, схоже гру вже завершено',
      });

    const player = room.players.find((p) => p.playerId === playerId);
    if (!player)
      return socket.emit('ERROR', {
        message: 'Тебе не знайдено в цій кімнаті',
      });

    const timer = disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      disconnectTimers.delete(playerId);
    }

    player.socketId = socket.id; // прив'язуємо нове з'єднання до старої особистості
    player.isDisconnected = false;
    socket.join(roomId);

    console.log(`${player.name} повернувся в гру`);

    socket.emit('REJOINED', {
      roomId,
      myPlayerId: player.playerId,
      status: room.status,
    });
    socket.emit('HAND_UPDATED', { hand: player.hand });
    io.to(roomId).emit('ROOM_UPDATED', toPublicRoom(room));
    io.to(roomId).emit('GAME_LOG', {
      message: `${player.name} повернувся в гру`,
    });
  });

  socket.on('LEAVE_ROOM', ({ roomId, playerId }) => {
    const room = getRoom(roomId);
    if (!room) return;

    const player = room.players.find((p) => p.playerId === playerId);
    if (!player) return;

    // Remove player immediately (depending on game state)
    if (room.status === 'LOBBY') {
      room.players = room.players.filter((p) => p.playerId !== playerId);
    } else {
      removePlayerFromGame(room, playerId);
    }

    // Clear any pending disconnect timer
    const timer = disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      disconnectTimers.delete(playerId);
    }

    // Broadcast updates to other sockets in the room, but not to the leaver
    socket.broadcast.to(room.roomId).emit('GAME_LOG', {
      message: `${player.name} вийшов(-ла) з кімнати`,
    });
    socket.broadcast.to(room.roomId).emit('ROOM_UPDATED', toPublicRoom(room));

    if (room.status !== 'LOBBY') {
      const gameOverResult = checkGameOver(room);
      if (gameOverResult) {
        room.status = 'GAME_OVER';
        socket.broadcast.to(room.roomId).emit('GAME_OVER', gameOverResult);
      }
    }

    // If no players remain, remove room from memory
    if (room.players.length === 0) {
      deleteRoom(room.roomId);
      console.log(`Room ${room.roomId} deleted (no players left)`);
    }
  });

  socket.on('START_GAME', ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room) return socket.emit('ERROR', { message: 'Кімната не знайдена' });
    if (room.players.length < 2) {
      return socket.emit('ERROR', { message: 'Потрібно щонайменше 2 гравці' });
    }

    const deck = shuffleDeck(generateDeck());
    const hands = dealCards(deck, room.players.length);

    room.players.forEach((player, index) => {
      player.hand = hands[index];
    });

    room.status = 'PLAYING';
    room.currentTurnIndex = 0;

    console.log(
      'Гру розпочато, роздано карт:',
      hands.map((h) => h.length),
    );

    io.to(roomId).emit('ROOM_UPDATED', toPublicRoom(room));
    room.players.forEach((player) => {
      io.to(player.socketId).emit('HAND_UPDATED', { hand: player.hand }); // ЗМІНА: socketId
    });
  });

  socket.on('disconnect', () => {
    const room = findRoomBySocketId(socket.id);
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    player.isDisconnected = true;
    io.to(room.roomId).emit('ROOM_UPDATED', toPublicRoom(room));
    io.to(room.roomId).emit('GAME_LOG', {
      message: `${player.name} втратив(-ла) з'єднання, чекаємо повернення...`,
    });
    console.log(
      `${player.name} відключився, очікуємо реконект ${RECONNECT_GRACE_MS / 1000}с`,
    );

    const timer = setTimeout(() => {
      disconnectTimers.delete(player.playerId);
      if (!player.isDisconnected) return; // встиг повернутись раніше через REJOIN_ROOM

      if (room.status === 'LOBBY') {
        room.players = room.players.filter(
          (p) => p.playerId !== player.playerId,
        );
      } else {
        removePlayerFromGame(room, player.playerId);
      }

      io.to(room.roomId).emit('GAME_LOG', {
        message: `${player.name} остаточно вийшов`,
      });
      io.to(room.roomId).emit('ROOM_UPDATED', toPublicRoom(room));

      if (room.status !== 'LOBBY') {
        const gameOverResult = checkGameOver(room);
        if (gameOverResult) {
          room.status = 'GAME_OVER';
          io.to(room.roomId).emit('GAME_OVER', gameOverResult);
        }
      }
      // If no players remain, delete room
      if (room.players.length === 0) {
        deleteRoom(room.roomId);
        console.log(
          `Room ${room.roomId} deleted after disconnect (no players left)`,
        );
      }
    }, RECONNECT_GRACE_MS);

    disconnectTimers.set(player.playerId, timer);
  });
}
