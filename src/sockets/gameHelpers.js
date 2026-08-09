export function suitSymbolServer(suit) {
  return { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit] || suit;
}

export function toPublicRoom(room) {
  return {
    roomId: room.roomId,
    status: room.status,
    claimedRank: room.claimedRank,
    tablePileCount: room.tablePile.length,
    lastMoveCount: room.lastMoveCount,
    lastPlayerId: room.lastPlayerId,
    currentTurnIndex: room.currentTurnIndex,
    players: room.players.map((p) => ({
      id: p.playerId,
      name: p.name,
      cardCount: p.hand.length,
      isDisconnected: p.isDisconnected,
    })),
  };
}

export function nextActiveIndexFrom(room, startIndex) {
  const n = room.players.length;
  for (let offset = 0; offset < n; offset++) {
    const idx = (startIndex + offset) % n;
    if (room.players[idx].hand.length > 0) return idx;
  }
  return startIndex;
}

export function checkGameOver(room) {
  const activePlayers = room.players.filter((p) => !p.isDisconnected);
  if (activePlayers.length < 2) return { reason: 'NOT_ENOUGH_PLAYERS' };

  const withCards = activePlayers.filter((p) => p.hand.length > 0);
  if (withCards.length === 1) {
    const loser = withCards[0];
    if (!room.finishOrder.includes(loser.playerId)) {
      room.finishOrder.push(loser.playerId); // програвший — завжди останній у списку
    }
    return {
      reason: 'LOSER',
      loserId: loser.playerId,
      finishOrder: room.finishOrder,
    };
  }
  return null;
}

export function checkPlayerFinished(room, player) {
  if (player.hand.length > 0) return null;
  if (room.finishOrder.includes(player.playerId)) return null; // вже зафіксований раніше

  room.finishOrder.push(player.playerId);
  const place = room.finishOrder.length;
  return `${player.name} позбувся(-лась) усіх карт і виходить з гри! (${place} місце)`;
}

export function giveCards(room, player, cards) {
  if (cards.length === 0) return;
  if (player && !player.isDisconnected) {
    player.hand.push(...cards);
  } else {
    room.discardPile.push(...cards);
  }
}

export function removePlayerFromGame(room, playerId) {
  const player = room.players.find((p) => p.playerId === playerId); // ЗМІНА
  if (!player) return;
  room.discardPile.push(...player.hand);
  player.hand = [];
  room.currentTurnIndex = nextActiveIndexFrom(room, room.currentTurnIndex);
}
export function removePlayerCompletely(room, playerId) {
  const index = room.players.findIndex((p) => p.playerId === playerId);
  if (index === -1) return null;

  const player = room.players[index];

  if (room.status === 'PLAYING' && player.hand.length > 0) {
    room.discardPile.push(...player.hand);
  }

  room.players.splice(index, 1);

  if (room.currentTurnIndex >= room.players.length) {
    room.currentTurnIndex = 0;
  } else if (index <= room.currentTurnIndex && room.players.length > 0) {
    room.currentTurnIndex = nextActiveIndexFrom(
      room,
      room.currentTurnIndex % room.players.length,
    );
  }

  return player;
}
