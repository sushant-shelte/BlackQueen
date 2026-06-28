"""Card model."""
from dataclasses import dataclass
from typing import Optional
from .enums import Suit, Rank


@dataclass
class Card:
    """Represents a playing card."""
    rank: Rank
    suit: Suit
    deck_id: int = 0  # 0 or 1 for double deck
    
    @property
    def points(self) -> int:
        """Get points value of card."""
        if self.rank == Rank.ACE:
            return 15
        elif self.rank == Rank.TEN:
            return 10
        elif self.rank == Rank.FIVE:
            return 5
        elif self.rank == Rank.QUEEN and self.suit == Suit.SPADES:
            return 30
        return 0
    
    @property
    def rank_value(self) -> int:
        """Get rank value for comparison (higher = stronger)."""
        rank_order = {
            Rank.ACE: 14, Rank.KING: 13, Rank.QUEEN: 12, Rank.JACK: 11,
            Rank.TEN: 10, Rank.NINE: 9, Rank.EIGHT: 8, Rank.SEVEN: 7,
            Rank.SIX: 6, Rank.FIVE: 5, Rank.FOUR: 4, Rank.THREE: 3, Rank.TWO: 2
        }
        return rank_order[self.rank]
    
    def __str__(self) -> str:
        """String representation of card."""
        return f"{self.rank.value}{self.suit.value}"
    
    def __eq__(self, other) -> bool:
        """Check equality (for double deck, same rank/suit with different deck_id are different)."""
        if not isinstance(other, Card):
            return False
        return self.rank == other.rank and self.suit == other.suit and self.deck_id == other.deck_id
    
    def __hash__(self) -> int:
        """Hash for use in sets/dicts."""
        return hash((self.rank, self.suit, self.deck_id))
    
    @staticmethod
    def from_string(card_str: str, deck_id: int = 0) -> 'Card':
        """Create Card from string format like 'AH', 'KS', '10D'."""
        if len(card_str) < 2:
            raise ValueError(f"Invalid card string: {card_str}")
        
        # Extract suit (last character)
        suit_str = card_str[-1].upper()
        suit = Suit(suit_str)
        
        # Extract rank (everything except last character)
        rank_str = card_str[:-1].upper()
        rank = Rank(rank_str)
        
        return Card(rank=rank, suit=suit, deck_id=deck_id)
