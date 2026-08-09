import { getRoom } from './rooms.js';
import { RANKS } from './cards.js';
import {
  toPublicRoom,
  suitSymbolServer,
  nextActiveIndexFrom,
  checkGameOver,
  giveCards,
  checkPlayerFinished,
} from './gameHelpers.js';

export function registerGameHandlers(io, socket) {
  socket.on('PLAY_CARDS', ({ roomId, cardIds, claimedRank }) => {
    const room = getRoom(roomId);
    if (!room) return socket.emit('ERROR', { message: 'Кімната не знайдена' });
    if (room.status !== 'PLAYING')
      return socket.emit('ERROR', { message: 'Гра ще не почалась' });

    const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
    if (playerIndex !== room.currentTurnIndex) {
      return socket.emit('ERROR', { message: 'Зараз не твій хід' });
    }

    const player = room.players[playerIndex];

    if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 4) {
      return socket.emit('ERROR', { message: 'Можна класти від 1 до 4 карт' });
    }

    const cardsToPlay = player.hand.filter((c) => cardIds.includes(c.id));
    if (cardsToPlay.length !== cardIds.length) {
      return socket.emit('ERROR', {
        message: 'Деяких карт немає у твоїй руці',
      });
    }

    const isNewClaim = room.tablePile.length === 0;

    if (isNewClaim) {
      if (!RANKS.includes(claimedRank)) {
        return socket.emit('ERROR', { message: 'Некоректний заявлений ранг' });
      }
      room.claimedRank = claimedRank;
    }

    player.hand = player.hand.filter((c) => !cardIds.includes(c.id));

    const finishMessage = checkPlayerFinished(room, player); // НОВЕ — саме тут, після спорожнення руки

    room.tablePile.push(...cardsToPlay);
    room.lastMoveCount = cardsToPlay.length;
    room.lastPlayerId = player.playerId;
    room.currentTurnIndex = nextActiveIndexFrom(
      room,
      (playerIndex + 1) % room.players.length,
    );

    const logMessage = isNewClaim
      ? `${player.name} заявляє: ${cardsToPlay.length} карт(и) рангу «${room.claimedRank}»`
      : `${player.name} докидає ще ${cardsToPlay.length} карт(и)`;

    io.to(roomId).emit('GAME_LOG', { message: logMessage });
    if (finishMessage) {
      io.to(roomId).emit('GAME_LOG', { message: finishMessage }); // НОВЕ
    }
    io.to(roomId).emit('ROOM_UPDATED', toPublicRoom(room));
    io.to(player.socketId).emit('HAND_UPDATED', { hand: player.hand });
  });

  socket.on('RESPOND', ({ roomId, action }) => {
    const room = getRoom(roomId);
    if (!room) return socket.emit('ERROR', { message: 'Кімната не знайдена' });
    if (room.tablePile.length === 0)
      return socket.emit('ERROR', { message: 'Немає що оцінювати' });

    const responderIndex = room.players.findIndex(
      (p) => p.socketId === socket.id,
    );
    if (responderIndex !== room.currentTurnIndex) {
      return socket.emit('ERROR', {
        message: 'Зараз не твоя черга відповідати',
      });
    }

    const respondingPlayer = room.players[responderIndex];
    const lastPlayer = room.players.find(
      (p) => p.playerId === room.lastPlayerId,
    );
    const isHonest = room.tablePile.every((c) => c.rank === room.claimedRank);

    let receiver = null;
    let nextIndex;

    if (action === 'BELIEVE') {
      if (isHonest) {
        receiver = null;
        nextIndex = nextActiveIndexFrom(room, responderIndex);
      } else {
        receiver = respondingPlayer;
        nextIndex = nextActiveIndexFrom(
          room,
          (responderIndex + 1) % room.players.length,
        );
      }
    } else if (action === 'DOUBT') {
      if (!isHonest) {
        receiver = lastPlayer;
        nextIndex = nextActiveIndexFrom(room, responderIndex);
      } else {
        receiver = respondingPlayer;
        nextIndex = nextActiveIndexFrom(
          room,
          (responderIndex + 1) % room.players.length,
        );
      }
    } else {
      return socket.emit('ERROR', { message: 'Невідома дія' });
    }

    const revealedRanks = room.tablePile
      .map((c) => `${c.rank}${suitSymbolServer(c.suit)}`)
      .join(', ');
    let logMessage;

    if (action === 'BELIEVE' && isHonest) {
      logMessage = `${respondingPlayer.name} повірив(-ла) — і це була правда! На столі: ${revealedRanks}. Карти пішли у відбій.`;
    } else if (action === 'BELIEVE' && !isHonest) {
      logMessage = `${respondingPlayer.name} повірив(-ла), але це був блеф! На столі: ${revealedRanks}. ${respondingPlayer.name} забирає ${room.tablePile.length} карт(и).`;
    } else if (action === 'DOUBT' && !isHonest) {
      logMessage = `${respondingPlayer.name} не повірив(-ла) — і мав(-ла) рацію, це був блеф! На столі: ${revealedRanks}. ${lastPlayer.name} забирає карти назад.`;
    } else {
      logMessage = `${respondingPlayer.name} не повірив(-ла), але це була правда! На столі: ${revealedRanks}. ${respondingPlayer.name} забирає ${room.tablePile.length} карт(и).`;
    }

    if (receiver) {
      giveCards(room, receiver, room.tablePile);
    } else {
      room.discardPile.push(...room.tablePile);
    }

    room.tablePile = [];
    room.claimedRank = null;
    room.lastMoveCount = 0;
    room.lastPlayerId = null;
    room.currentTurnIndex = nextIndex;

    io.to(roomId).emit('GAME_LOG', { message: logMessage });
    io.to(roomId).emit('ROOM_UPDATED', toPublicRoom(room));
    if (receiver)
      io.to(receiver.socketId).emit('HAND_UPDATED', { hand: receiver.hand });

    const gameOverResult = checkGameOver(room);
    if (gameOverResult) {
      room.status = 'GAME_OVER';
      io.to(roomId).emit('GAME_OVER', gameOverResult);
    }
  });
}
