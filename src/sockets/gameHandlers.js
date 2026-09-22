import { getRoom } from './rooms.js';
import { CLAIMABLE_RANKS } from './cards.js';
import {
  toPublicRoom,
  suitSymbolServer,
  nextActiveIndexFrom,
  checkGameOver,
  giveCards,
  checkPlayerFinished,
  findFourOfAKind,
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
      if (!CLAIMABLE_RANKS.includes(claimedRank)) {
        return socket.emit('ERROR', { message: 'Некоректний заявлений ранг' });
      }
      room.claimedRank = claimedRank;
    }

    player.hand = player.hand.filter((c) => !cardIds.includes(c.id));

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
    io.to(roomId).emit('ROOM_UPDATED', toPublicRoom(room));
    io.to(player.socketId).emit('HAND_UPDATED', { hand: player.hand });
  });

  socket.on('DISCARD_SET', ({ roomId, cardIds }) => {
    const room = getRoom(roomId);
    if (!room) return socket.emit('ERROR', { message: 'Кімната не знайдена' });
    if (room.status !== 'PLAYING')
      return socket.emit('ERROR', { message: 'Гра ще не почалась' });

    const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
    if (playerIndex !== room.currentTurnIndex) {
      return socket.emit('ERROR', { message: 'Зараз не твій хід' });
    }
    if (room.tablePile.length > 0) {
      return socket.emit('ERROR', {
        message: 'Не можна скидати сет, поки стіл не порожній',
      });
    }

    const player = room.players[playerIndex];
    const setCards = findFourOfAKind(player.hand, cardIds);
    if (!setCards) {
      return socket.emit('ERROR', {
        message: 'Потрібно вибрати рівно 4 карти одного рангу',
      });
    }

    player.hand = player.hand.filter((card) => !cardIds.includes(card.id));
    room.discardPile.push(...setCards);

    const finishMessage = checkPlayerFinished(room, player);
    if (finishMessage) {
      room.currentTurnIndex = nextActiveIndexFrom(room, playerIndex + 1);
    }

    io.to(roomId).emit('GAME_LOG', {
      message: `${player.name} скидає сет із 4 карт рангу «${setCards[0].rank}» у відбій${finishMessage ? ' і завершує гру' : ' і ходить ще раз'}`,
    });
    if (finishMessage) {
      io.to(roomId).emit('GAME_LOG', { message: finishMessage });
    }
    io.to(roomId).emit('ROOM_UPDATED', toPublicRoom(room));
    io.to(player.socketId).emit('HAND_UPDATED', { hand: player.hand });

    const gameOverResult = checkGameOver(room);
    if (gameOverResult) {
      room.status = 'GAME_OVER';
      io.to(roomId).emit('GAME_OVER', gameOverResult);
    }
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
    const lastPlayedCards = room.tablePile.slice(-room.lastMoveCount);
    const isHonest = lastPlayedCards.every((c) => c.rank === room.claimedRank);

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

    const lastPlayedRanks = lastPlayedCards
      .map((c) => `${c.rank}${suitSymbolServer(c.suit)}`)
      .join(', ');
    let logMessage;

    if (action === 'BELIEVE' && isHonest) {
      logMessage = `${respondingPlayer.name} повірив(-ла) — і останній докид був чесний! (${lastPlayedRanks}). Усі карти зі столу пішли у відбій.`;
    } else if (action === 'BELIEVE' && !isHonest) {
      logMessage = `${respondingPlayer.name} повірив(-ла), але останній докид був блефом! (${lastPlayedRanks}). ${respondingPlayer.name} забирає всі ${room.tablePile.length} карт(и) зі столу.`;
    } else if (action === 'DOUBT' && !isHonest) {
      logMessage = `${respondingPlayer.name} не повірив(-ла) — і мав(-ла) рацію, останній докид був блефом! (${lastPlayedRanks}). ${lastPlayer.name} забирає всі карти зі столу назад.`;
    } else {
      logMessage = `${respondingPlayer.name} не повірив(-ла), але останній докид був чесним! (${lastPlayedRanks}). ${respondingPlayer.name} забирає всі ${room.tablePile.length} карт(и) зі столу.`;
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

    const finishMessages = [];
    for (const player of [lastPlayer, respondingPlayer]) {
      if (player?.hand.length === 0) {
        const finishMessage = checkPlayerFinished(room, player);
        if (finishMessage) finishMessages.push(finishMessage);
      }
    }
    room.currentTurnIndex = nextActiveIndexFrom(room, nextIndex);

    io.to(roomId).emit('GAME_LOG', { message: logMessage });
    for (const finishMessage of finishMessages) {
      io.to(roomId).emit('GAME_LOG', { message: finishMessage });
    }
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
