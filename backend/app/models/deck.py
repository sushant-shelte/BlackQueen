"""Deck and card management service."""
import random
from typing import List
from .card import Card
from .enums import Suit, Rank


class DeckService:
    """Service for managing card decks."""
    
    @staticmethod
    def create_standard_deck(deck_id: int = 0) -> List[Card]:
        """Create a standard 52-card deck."""
        cards = []
        for rank in Rank:
            for suit in Suit:
                cards.append(Card(rank=rank, suit=suit, deck_id=deck_id))
        return cards
    
    @staticmethod
    def get_deck_for_players(num_players: int) -> List[Card]:
        """
        Get appropriate deck(s) for number of players.
        Single deck for 1-9 players, double deck for 10 players.
        """
        use_double_deck = num_players >= 10
        total_cards = 104 if use_double_deck else 52
        
        # Calculate how many cards to remove
        cards_to_remove = total_cards % num_players
        
        # Create deck(s)
        if use_double_deck:
            deck = DeckService.create_standard_deck(0) + DeckService.create_standard_deck(1)
        else:
            deck = DeckService.create_standard_deck()
        
        # Remove cards starting from 2s in order: Hearts, Clubs, Diamonds, Spades
        if cards_to_remove > 0:
            cards_to_remove_list = []
            for suit in [Suit.HEARTS, Suit.CLUBS, Suit.DIAMONDS, Suit.SPADES]:
                for rank in [Rank.TWO, Rank.THREE, Rank.FOUR]:
                    for card in deck:
                        if card.rank == rank and card.suit == suit:
                            cards_to_remove_list.append(card)
                            if len(cards_to_remove_list) == cards_to_remove:
                                break
                    if len(cards_to_remove_list) == cards_to_remove:
                        break
                if len(cards_to_remove_list) == cards_to_remove:
                    break
            
            # Remove the identified cards
            for card in cards_to_remove_list:
                deck.remove(card)
        
        # Shuffle randomly
        random.shuffle(deck)
        return deck
    
    @staticmethod
    def deal_cards(deck: List[Card], num_players: int) -> List[List[Card]]:
        """Deal cards to players randomly."""
        cards_per_player = len(deck) // num_players
        hands = [[] for _ in range(num_players)]
        
        for i, card in enumerate(deck):
            hands[i % num_players].append(card)
        
        return hands
