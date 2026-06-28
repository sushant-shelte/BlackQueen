import React, { useState } from 'react';

interface PlayingCardProps {
  card: string;
  disabled?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

const suitSymbols: Record<string, string> = {
  H: '♥',
  D: '♦',
  C: '♣',
  S: '♠'
};

const rankFileNames: Record<string, string> = {
  A: 'ace',
  K: 'king',
  Q: 'queen',
  J: 'jack',
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

const suitFileNames: Record<string, string> = {
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
  S: 'spades'
};

const getCardParts = (card: string) => {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  return { rank, suit, symbol: suitSymbols[suit] || suit };
};

const getCardAssetPath = (card: string) => {
  const { rank, suit } = getCardParts(card);
  const rankName = rankFileNames[rank];
  const suitName = suitFileNames[suit];

  if (!rankName || !suitName) return null;

  return encodeURI(`/cards/SVG-cards-1.3/${rankName}_of_${suitName}.svg`);
};

export const PlayingCard: React.FC<PlayingCardProps> = ({ card, disabled = false, selected = false, onClick }) => {
  const { rank, suit, symbol } = getCardParts(card);
  const [assetFailed, setAssetFailed] = useState(false);
  const assetPath = getCardAssetPath(card);
  const isRed = suit === 'H' || suit === 'D';
  const className = [
    'playing-card',
    assetPath && !assetFailed ? 'playing-card--asset' : '',
    isRed ? 'playing-card--red' : 'playing-card--black',
    selected ? 'playing-card--selected' : '',
    disabled ? 'playing-card--disabled' : '',
    onClick && !disabled ? 'playing-card--clickable' : ''
  ].filter(Boolean).join(' ');

  return (
    <button className={className} onClick={onClick} disabled={disabled} type="button">
      {assetPath && !assetFailed ? (
        <img
          src={assetPath}
          alt={card}
          className="playing-card__image"
          draggable={false}
          onError={() => setAssetFailed(true)}
        />
      ) : (
        <>
          <span className="playing-card__corner">
            <span>{rank}</span>
            <span>{symbol}</span>
          </span>
          <span className="playing-card__pip">{symbol}</span>
          <span className="playing-card__corner playing-card__corner--bottom">
            <span>{rank}</span>
            <span>{symbol}</span>
          </span>
        </>
      )}
    </button>
  );
};
