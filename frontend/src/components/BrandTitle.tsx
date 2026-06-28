import React from 'react';

interface BrandTitleProps {
  className?: string;
}

const QueenOfSpadesMark: React.FC = () => (
  <svg
    className="brand-title__icon"
    viewBox="0 0 64 64"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M32 6C23 6 15 14 15 24c0 6.2 3 11.1 7.5 15.6L32 49l9.5-9.4C46 35.1 49 30.2 49 24 49 14 41 6 32 6z"
      fill="#d8b13d"
      stroke="#1b1327"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
    <path
      d="M21 37c0 5.5 4.6 9.7 11 9.7S43 42.5 43 37c0-3.5-1.9-6.3-4.9-8.8L32 22l-6.1 6.2C22.9 30.7 21 33.5 21 37z"
      fill="#1b1327"
      opacity="0.95"
    />
    <path
      d="M29 47h6l2.5 8h-11L29 47z"
      fill="#1b1327"
    />
    <text
      x="32"
      y="34"
      textAnchor="middle"
      fontFamily="Georgia, serif"
      fontSize="18"
      fontWeight="700"
      fill="#f6e6a2"
    >
      Q
    </text>
  </svg>
);

export const BrandTitle: React.FC<BrandTitleProps> = ({ className = '' }) => {
  return (
    <h1 className={['brand-title', className].filter(Boolean).join(' ')}>
      <QueenOfSpadesMark />
      <span className="brand-title__text">BLACK QUEEN</span>
    </h1>
  );
};
