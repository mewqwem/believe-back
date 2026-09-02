export const RECONNECT_GRACE_MS = 30000;

export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function findFourOfAKind(hand, cardIds) {
  if (cardIds.length !== 4) return null;
  const cards = hand.filter((card) => cardIds.includes(card.id));
  if (cards.length !== 4) return null;
  const allSameRank = cards.every((card) => card.rank === cards[0].rank);
  return allSameRank ? cards : null;
}

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
    reconnectGraceMs: RECONNECT_GRACE_MS,
    finishOrder: room.finishOrder,
    players: room.players.map((p) => ({
      id: p.playerId,
      name: p.name,
      cardCount: p.hand.length,
      isDisconnected: p.isDisconnected,
      disconnectedAt: p.disconnectedAt,
    })),
  };
}

export function nextActiveIndexFrom(room, startIndex) {
  const n = room.players.length;
  for (let offset = 0; offset < n; offset++) {
    const idx = (startIndex + offset) % n;
    if (!room.finishOrder.includes(room.players[idx].playerId)) return idx;
  }
  return startIndex;
}

export function checkGameOver(room) {
  const activePlayers = room.players.filter((p) => !p.isDisconnected);
  const unfinishedPlayers = activePlayers.filter(
    (p) => !room.finishOrder.includes(p.playerId),
  );

  if (unfinishedPlayers.some((p) => p.hand.length === 0)) return null;
  if (unfinishedPlayers.length === 0) {
    return { reason: 'NOT_ENOUGH_PLAYERS' };
  }
  if (unfinishedPlayers.length > 1) return null;

  const loser = unfinishedPlayers[0];
  if (!room.finishOrder.includes(loser.playerId)) {
    room.finishOrder.push(loser.playerId); // програвший — завжди останній у списку
  }
  return {
    reason: 'LOSER',
    loserId: loser.playerId,
    finishOrder: room.finishOrder,
  };
}

export function checkPlayerFinished(room, player) {
  if (player.hand.length > 0) return null;
  if (room.finishOrder.includes(player.playerId)) return null; // вже зафіксований раніше

  room.finishOrder.push(player.playerId);
  const place = room.finishOrder.length;
  return `${player.name} завершив(-ла) гру та посів(-ла) ${place} місце!`;
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
