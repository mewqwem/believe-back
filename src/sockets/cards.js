export const RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];
export const CLAIMABLE_RANKS = RANKS.filter((rank) => rank !== 'A');
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];

export function generateDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${rank}_${suit}`, rank, suit });
    }
  }
  return deck;
}

export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(deck, playerCount, randomFn = Math.random) {
  if (playerCount <= 0) return [];
  const hands = Array.from({ length: playerCount }, () => []);
  const baseCards = Math.floor(deck.length / playerCount);
  const remainder = deck.length % playerCount;

  let cardIndex = 0;
  for (let p = 0; p < playerCount; p++) {
    for (let c = 0; c < baseCards; c++) {
      hands[p].push(deck[cardIndex++]);
    }
  }

  if (remainder > 0) {
    const playerIndices = Array.from({ length: playerCount }, (_, i) => i);
    for (let i = playerIndices.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      [playerIndices[i], playerIndices[j]] = [playerIndices[j], playerIndices[i]];
    }
    const luckyPlayers = playerIndices.slice(0, remainder);
    for (const playerIdx of luckyPlayers) {
      hands[playerIdx].push(deck[cardIndex++]);
    }
  }

  return hands;
}
