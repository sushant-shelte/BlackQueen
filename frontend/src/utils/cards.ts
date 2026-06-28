import { Rank, Suit } from '../types/game';

export const ranks: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
export const suits: Suit[] = ['H', 'D', 'C', 'S'];

const rankLabels: Record<Rank, string> = {
  A: 'Ace',
  K: 'King',
  Q: 'Queen',
  J: 'Jack',
  '10': '10',
  '9': '9',
  '8': '8',
  '7': '7',
  '6': '6',
  '5': '5',
  '4': '4',
  '3': '3',
  '2': '2'
};

const suitLabels: Record<Suit, string> = {
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
  S: 'Spades'
};

export const allCardCodes = () => ranks.flatMap((rank) => suits.map((suit) => `${rank}${suit}`));

export const getCardLabel = (card: string) => {
  const suit = card.slice(-1) as Suit;
  const rank = card.slice(0, -1) as Rank;
  return `${rankLabels[rank] || rank} of ${suitLabels[suit] || suit}`;
};
