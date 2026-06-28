"""Game engine service."""
from typing import List, Optional, Tuple, Set
from ..models.card import Card
from ..models.deck import DeckService
from ..models.game import Room, GameRound, Player, Trick
from ..models.enums import GameState, Suit, Rank


class GameEngine:
    """Core game engine for Black Queen."""
    
    @staticmethod
    def start_round(room: Room) -> GameRound:
        """Start a new round."""
        room.current_round += 1
        game = GameRound(room.current_round, room.players, room.num_teammates)
        
        # Deal cards
        deck = DeckService.get_deck_for_players(len(room.players))
        hands = DeckService.deal_cards(deck, len(room.players))
        
        for player, hand in zip(room.players, hands):
            player.hand = hand
        
        # Set first player (rotates each round)
        game.first_player_index = (room.current_round - 1) % len(room.players)
        game.bidding_player_index = game.first_player_index
        
        room.current_game = game
        room.state = GameState.BIDDING
        return game
    
    @staticmethod
    def place_bid(game: GameRound, player_id: str, bid_amount: Optional[int]) -> Tuple[bool, str]:
        """
        Place a bid or pass.
        Returns (success, message)
        """
        if player_id not in game.bids:
            return False, "Invalid player"

        passed_player_ids = GameEngine._get_passed_player_ids(game)
        current_player = game.players[game.bidding_player_index]
        if player_id != current_player.player_id:
            return False, "Not your turn to bid"
        
        if player_id in passed_player_ids:
            return False, "Player already bid"
        
        if bid_amount is None:
            # Player passes
            passed_player_ids.add(player_id)
            
            # Check if all players have passed
            if len(passed_player_ids) == len(game.players) and game.highest_bidder_id is None:
                # First player becomes captain with the default 75-point contract.
                first_player = game.players[game.first_player_index]
                game.highest_bidder_id = first_player.player_id
                game.highest_bid = 75
                game.bids[first_player.player_id] = 75
                return True, "Bidding complete"

            if GameEngine._is_bidding_complete(game):
                return True, "Bidding complete"
            
            # Move to next player
            GameEngine._move_bidding_to_next_player(game)
            return True, "Pass"
        
        # Validate bid
        if bid_amount < 75:
            return False, "Minimum bid is 75"

        if game.highest_bidder_id and bid_amount <= game.highest_bid:
            return False, f"Bid must be higher than {game.highest_bid}"
        
        if bid_amount > 150:
            return False, "Maximum bid is 150"
        
        if bid_amount % 5 != 0:
            return False, "Bid must be multiple of 5"
        
        # Place bid
        game.bids[player_id] = bid_amount
        game.highest_bid = bid_amount
        game.highest_bidder_id = player_id
        
        # Move to next player
        GameEngine._move_bidding_to_next_player(game)
        
        # Check if bidding complete
        if GameEngine._is_bidding_complete(game):
            return True, "Bidding complete"
        
        return True, "Bid placed"

    @staticmethod
    def _get_passed_player_ids(game: GameRound) -> Set[str]:
        """Get or initialize passed players for older persisted rounds."""
        if not hasattr(game, "passed_player_ids"):
            game.passed_player_ids = set()
        return game.passed_player_ids
    
    @staticmethod
    def _move_bidding_to_next_player(game: GameRound) -> None:
        """Move bidding to next player."""
        num_players = len(game.players)
        passed_player_ids = GameEngine._get_passed_player_ids(game)

        for _ in range(num_players):
            game.bidding_player_index = (game.bidding_player_index + 1) % num_players
            next_player = game.players[game.bidding_player_index]
            if next_player.player_id not in passed_player_ids:
                return
    
    @staticmethod
    def _is_bidding_complete(game: GameRound) -> bool:
        """Check if bidding phase is complete."""
        passed_player_ids = GameEngine._get_passed_player_ids(game)
        if game.highest_bidder_id is None:
            return False

        active_player_ids = {player.player_id for player in game.players} - passed_player_ids
        return active_player_ids == {game.highest_bidder_id}
    
    @staticmethod
    def announce_trump(game: GameRound, player_id: str, trump_suit: Suit) -> Tuple[bool, str]:
        """Announce trump suit."""
        if player_id != game.highest_bidder_id:
            return False, "Only highest bidder can announce trump"
        
        game.trump_suit = trump_suit
        return True, f"Trump announced: {trump_suit.value}"
    
    @staticmethod
    def announce_partners(game: GameRound, player_id: str, partner_cards: List[str]) -> Tuple[bool, str]:
        """Announce partner cards."""
        if player_id != game.highest_bidder_id:
            return False, "Only highest bidder can announce partners"
        
        if len(partner_cards) != game.num_teammates:
            return False, f"Must announce exactly {game.num_teammates} partner card(s)"
        
        # Convert string cards to Card objects
        try:
            announced = [Card.from_string(card_str) for card_str in partner_cards]
        except ValueError as e:
            return False, f"Invalid card: {e}"
        
        # Validate partner announcement
        bidder = game.players[next(i for i, p in enumerate(game.players) if p.player_id == player_id)]
        success, msg = GameEngine._validate_partner_announcement(
            announced, bidder.hand, len(game.players), game.num_teammates
        )
        if not success:
            return False, msg
        
        game.announced_cards = announced
        
        # Find team members (players holding announced cards)
        game.team_members.add(player_id)  # Bidder is always in team
        
        for player in game.players:
            for card in player.hand:
                if any(card.rank == announced_card.rank and card.suit == announced_card.suit for announced_card in announced):
                    game.team_members.add(player.player_id)
                    game.revealed_partners[player.player_id] = False
        
        # Start first trick
        game.current_trick = Trick(1)
        game.current_player_index = game.first_player_index
        
        return True, "Partners announced"
    
    @staticmethod
    def _validate_partner_announcement(
        announced: List[Card],
        bidder_hand: List[Card],
        num_players: int,
        num_teammates: int
    ) -> Tuple[bool, str]:
        """Validate partner announcement based on game rules."""
        if len(announced) != num_teammates:
            return False, f"Must announce exactly {num_teammates} partner card(s)"
        
        if len(set(announced)) != len(announced):
            return False, "Cannot announce same card twice"

        if any(
            announced_card.rank == bidder_card.rank and announced_card.suit == bidder_card.suit
            for announced_card in announced
            for bidder_card in bidder_hand
        ):
            return False, "Cannot announce cards from your own hand"
        
        return True, "Valid announcement"
    
    @staticmethod
    def play_card(game: GameRound, player_id: str, card_str: str) -> Tuple[bool, str]:
        """Play a card in current trick."""
        if not game.current_trick:
            return False, "No active trick"
        
        # Find player
        player = next((p for p in game.players if p.player_id == player_id), None)
        if not player:
            return False, "Player not found"
        
        # Parse card
        try:
            card = Card.from_string(card_str)
        except ValueError:
            return False, f"Invalid card: {card_str}"
        
        # Check if player has card
        if card not in player.hand:
            return False, "Card not in hand"
        
        # Validate card play
        is_valid, msg = GameEngine._validate_card_play(card, player.hand, game.current_trick, game.trump_suit)
        if not is_valid:
            return False, msg
        
        # Play card
        player.hand.remove(card)
        order = len(game.current_trick.cards_played)
        game.current_trick.cards_played.append((player_id, card, order))
        if order == 0:
            game.current_trick.led_suit = card.suit
        
        # Check if card reveals partner
        if (
            any(card.rank == announced_card.rank and card.suit == announced_card.suit for announced_card in game.announced_cards)
            and player_id != game.highest_bidder_id
        ):
            game.revealed_partners[player_id] = True
            if not hasattr(game, "revealed_partner_cards"):
                game.revealed_partner_cards = {}
            game.revealed_partner_cards[str(card)] = player_id
            game.team_members.add(player_id)
        
        # Add points to trick
        game.current_trick.trick_points += card.points
        
        # Check if trick complete
        if len(game.current_trick.cards_played) == len(game.players):
            GameEngine._complete_trick(game)
            
            # Check if round complete
            if GameEngine._is_round_complete(game):
                return True, "Round complete"
            
            # Start next trick
            game.current_trick = Trick(len(game.tricks) + 1)
        else:
            game.current_player_index = (game.current_player_index + 1) % len(game.players)
        
        return True, "Card played"

    @staticmethod
    def get_valid_cards(player: Player, game: GameRound) -> List[Card]:
        """Return cards that can be legally played by a player."""
        if not game.current_trick:
            return []

        return [
            card
            for card in player.hand
            if GameEngine._validate_card_play(card, player.hand, game.current_trick, game.trump_suit)[0]
        ]
    
    @staticmethod
    def _validate_card_play(
        card: Card,
        hand: List[Card],
        trick: Trick,
        trump_suit: Optional[Suit]
    ) -> Tuple[bool, str]:
        """Validate that card play follows rules."""
        if not trick.cards_played:
            # First card, can play anything
            return True, "Valid"
        
        # Get led suit
        _, first_card, _ = trick.cards_played[0]
        led_suit = first_card.suit
        
        # Check if player has led suit
        has_led_suit = any(c.suit == led_suit for c in hand)
        
        if has_led_suit and card.suit != led_suit:
            return False, f"Must follow suit {led_suit.value} if you have it"
        
        return True, "Valid"
    
    @staticmethod
    def _complete_trick(game: GameRound) -> None:
        """Determine winner of completed trick."""
        if not game.current_trick or not game.current_trick.cards_played:
            return
        
        trick = game.current_trick
        _, first_card, _ = trick.cards_played[0]
        led_suit = first_card.suit
        
        # Find highest card
        winning_card_idx = 0
        winning_card = first_card
        
        for i, (player_id, card, order) in enumerate(trick.cards_played[1:], 1):
            if card.suit == led_suit:
                if card.rank_value > winning_card.rank_value:
                    winning_card_idx = i
                    winning_card = card
            elif card.suit == game.trump_suit:
                if winning_card.suit != game.trump_suit or card.rank_value > winning_card.rank_value:
                    winning_card_idx = i
                    winning_card = card
        
        # Set trick winner
        winner_id, _, _ = trick.cards_played[winning_card_idx]
        trick.winner_id = winner_id
        if not hasattr(game, "player_points"):
            game.player_points = {player.player_id: 0 for player in game.players}
        game.player_points[winner_id] = game.player_points.get(winner_id, 0) + trick.trick_points
        
        # Accumulate points if winner is in bidding team
        if winner_id in game.team_members:
            game.team_points += trick.trick_points
        
        # Add trick to completed tricks
        game.tricks.append(trick)
        
        # Next trick starts with winner
        game.current_player_index = next(
            i for i, p in enumerate(game.players) if p.player_id == winner_id
        )

    @staticmethod
    def _is_round_complete(game: GameRound) -> bool:
        """Check whether the round should end."""
        if all(len(p.hand) == 0 for p in game.players):
            return True

        if game.highest_bid > 0:
            if game.team_points >= game.highest_bid:
                return True

            remaining_points = sum(card.points for player in game.players for card in player.hand)
            return game.team_points + remaining_points < game.highest_bid

        return False

    @staticmethod
    def reveal_team(game: GameRound) -> None:
        """Reveal all bidder-team members at round end."""
        if not hasattr(game, "revealed_partner_cards"):
            game.revealed_partner_cards = {}

        for player in game.players:
            if player.player_id not in game.team_members or player.player_id == game.highest_bidder_id:
                continue

            game.revealed_partners[player.player_id] = True
            for card in player.hand:
                for announced_card in game.announced_cards:
                    if card.rank == announced_card.rank and card.suit == announced_card.suit:
                        game.revealed_partner_cards[str(announced_card)] = player.player_id
    
    @staticmethod
    def calculate_scores(game: GameRound) -> dict:
        """Calculate final scores for the round."""
        num_non_bidder_non_partners = len(game.players) - len(game.team_members)
        bid = game.highest_bid
        
        # Determine if bid achieved
        game.bid_achieved = game.team_points >= bid if bid > 0 else game.team_points > 75
        
        results = {}
        multiplier = 1 if game.bid_achieved else -1
        
        for player in game.players:
            role = "bidder" if player.player_id == game.highest_bidder_id else (
                "partner" if player.player_id in game.team_members else "opponent"
            )
            
            if player.player_id == game.highest_bidder_id:
                # Bidder gets 2x
                round_score = multiplier * 2 * bid
            elif player.player_id in game.team_members:
                # Partner gets 1x
                round_score = multiplier * bid
            else:
                # Opponent
                if game.bid_achieved:
                    round_score = -(bid // num_non_bidder_non_partners) if num_non_bidder_non_partners > 0 else 0
                else:
                    round_score = (bid // num_non_bidder_non_partners) if num_non_bidder_non_partners > 0 else 0
            
            player.cumulative_score += round_score
            
            results[player.player_id] = {
                "player_id": player.player_id,
                "player_name": player.name,
                "role": role,
                "is_partner": player.player_id in game.team_members and player.player_id != game.highest_bidder_id,
                "player_points": getattr(game, "player_points", {}).get(player.player_id, 0),
                "round_score": round_score,
                "cumulative_score": player.cumulative_score,
            }
        game.round_results = results
        return results
