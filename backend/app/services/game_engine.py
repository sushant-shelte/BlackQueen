"""Game engine service."""
import random
from typing import List, Optional, Tuple, Set
from ..models.card import Card
from ..models.deck import DeckService
from ..models.game import Room, GameRound, Player, Trick
from ..models.enums import GameState, Suit, Rank


class GameEngine:
    """Core game engine for Black Queen."""

    @staticmethod
    def _minimum_next_bid(current_highest_bid: int) -> int:
        """Return the next legal bid threshold.

        The first raise from the default 75 contract is 80. After that, bids
        must increase in steps of 5.
        """
        return 80 if current_highest_bid <= 75 else current_highest_bid + 5
    
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
        game.highest_bid = 75
        game.highest_bidder_id = None
        game.bot_difficulty = getattr(room, "bot_difficulty", "medium")

        GameEngine.resolve_bidding_turns(game)

        room.current_game = game
        room.state = GameState.BIDDING
        return game

    @staticmethod
    def resolve_bidding_turns(game: GameRound) -> bool:
        """Advance bidding until a human player is next or bidding completes."""
        bidding_complete = False

        while True:
            current_player = game.players[game.bidding_player_index]
            if not current_player.is_bot:
                break

            passed_player_ids = GameEngine._get_passed_player_ids(game)
            passed_player_ids.add(current_player.player_id)
            game.bids[current_player.player_id] = None
            GameEngine._move_bidding_to_next_player(game)

            if GameEngine._should_finalize_default_bid(game):
                GameEngine._finalize_default_bid(game)
                bidding_complete = True
                break

            if GameEngine._is_bidding_complete(game):
                bidding_complete = True
                break

        if not bidding_complete and GameEngine._should_finalize_default_bid(game):
            GameEngine._finalize_default_bid(game)
            bidding_complete = True

        return bidding_complete

    @staticmethod
    def find_next_human_player_index(game: GameRound, start_index: int) -> Optional[int]:
        """Find the next non-bot, non-disconnected player from a starting seat."""
        num_players = len(game.players)
        for offset in range(1, num_players + 1):
            candidate_index = (start_index + offset) % num_players
            candidate = game.players[candidate_index]
            if not candidate.is_bot and not candidate.is_disconnected:
                return candidate_index
        return None

    @staticmethod
    def choose_bot_card(game: GameRound, bot_player: Player) -> Card:
        """Choose a bot card using simple trick-taking heuristics."""
        valid_cards = GameEngine.get_valid_cards(bot_player, game)
        if not valid_cards:
            raise ValueError("Bot has no valid cards")

        difficulty = getattr(game, "bot_difficulty", "medium")
        if difficulty == "easy":
            return GameEngine._choose_easy_bot_card(game, valid_cards)
        if difficulty == "hard":
            return GameEngine._choose_hard_bot_card(game, valid_cards)

        trick = game.current_trick
        if not trick or not trick.cards_played:
            return GameEngine._choose_opening_card(game, bot_player, valid_cards)

        current_winner_id, current_winning_card = GameEngine._get_current_trick_leader(game)
        current_winner_is_partner = current_winner_id in game.team_members
        led_suit = trick.led_suit

        winning_cards = [
            card for card in valid_cards
            if GameEngine._card_beats_current_winner(card, current_winning_card, led_suit, game.trump_suit)
        ]

        if current_winner_is_partner:
            if winning_cards:
                return GameEngine._lowest_value_card(valid_cards)
            return GameEngine._lowest_value_card(valid_cards)

        if winning_cards:
            # Take the trick as cheaply as possible.
            return GameEngine._lowest_winning_card(winning_cards)

        return GameEngine._lowest_value_card(valid_cards)

    @staticmethod
    def _choose_easy_bot_card(game: GameRound, valid_cards: List[Card]) -> Card:
        """Easy bot: mostly random, but still avoids obvious waste."""
        candidates = sorted(valid_cards, key=lambda card: (card.points, card.rank_value, card.suit.value, card.deck_id))
        if len(candidates) == 1:
            return candidates[0]

        # Prefer lower cards, but keep a bit of randomness so it feels less robotic.
        window = candidates[: max(1, len(candidates) // 2)]
        return random.choice(window)

    @staticmethod
    def _choose_hard_bot_card(game: GameRound, valid_cards: List[Card]) -> Card:
        """Hard bot: win point tricks cheaply, protect trump, and avoid wasting power on empty tricks."""
        trick = game.current_trick
        if not trick or not trick.cards_played:
            return GameEngine._choose_opening_card(game, game.players[game.current_player_index], valid_cards)

        current_winner_id, current_winning_card = GameEngine._get_current_trick_leader(game)
        current_winner_is_partner = current_winner_id in game.team_members
        led_suit = trick.led_suit
        trump_suit = game.trump_suit
        trick_points = trick.trick_points

        same_suit_winners = [
            card for card in valid_cards
            if card.suit != trump_suit and GameEngine._card_beats_current_winner(card, current_winning_card, led_suit, trump_suit)
        ]
        trump_winners = [
            card for card in valid_cards
            if trump_suit and card.suit == trump_suit and GameEngine._card_beats_current_winner(card, current_winning_card, led_suit, trump_suit)
        ]

        if current_winner_is_partner:
            return GameEngine._lowest_value_card(valid_cards)

        if trick_points <= 0:
            if same_suit_winners:
                return GameEngine._lowest_winning_card(same_suit_winners)

            non_trump_discards = [card for card in valid_cards if card.suit != trump_suit]
            return GameEngine._lowest_value_card(non_trump_discards or valid_cards)

        if same_suit_winners:
            return GameEngine._lowest_winning_card(same_suit_winners)

        if trump_winners:
            return GameEngine._lowest_winning_card(trump_winners)

        return GameEngine._lowest_value_card(valid_cards)

    @staticmethod
    def _choose_opening_card(game: GameRound, bot_player: Player, valid_cards: List[Card]) -> Card:
        """Pick an opening lead that tries to preserve trump and low-value cards."""
        trump_suit = game.trump_suit
        non_trump_cards = [card for card in valid_cards if card.suit != trump_suit]
        candidates = non_trump_cards or valid_cards

        safe_candidates = [card for card in candidates if card.points == 0]
        candidates = safe_candidates or candidates

        return max(
            candidates,
            key=lambda card: (
                card.rank_value,
                card.points,
                0 if card.suit != trump_suit else -1,
                card.deck_id
            )
        )

    @staticmethod
    def _get_current_trick_leader(game: GameRound) -> tuple[Optional[str], Optional[Card]]:
        """Return the current winning player and card for the active trick."""
        trick = game.current_trick
        if not trick or not trick.cards_played:
            return None, None

        winner_id, winning_card, _ = trick.cards_played[0]
        led_suit = trick.led_suit or winning_card.suit

        for player_id, card, _ in trick.cards_played[1:]:
            if GameEngine._card_beats_current_winner(card, winning_card, led_suit, game.trump_suit):
                winner_id = player_id
                winning_card = card

        return winner_id, winning_card

    @staticmethod
    def _card_beats_current_winner(card: Card, current_winning_card: Optional[Card], led_suit: Optional[Suit], trump_suit: Optional[Suit]) -> bool:
        """Check whether a card can beat the current winning card."""
        if current_winning_card is None:
            return True

        if trump_suit:
            if current_winning_card.suit == trump_suit:
                return card.suit == trump_suit and card.rank_value > current_winning_card.rank_value
            if card.suit == trump_suit:
                return True

        if current_winning_card.suit == led_suit and card.suit == led_suit:
            return card.rank_value > current_winning_card.rank_value

        return False

    @staticmethod
    def _lowest_value_card(cards: List[Card]) -> Card:
        """Pick the cheapest card to discard."""
        return min(cards, key=lambda card: (card.points, card.rank_value, card.suit.value, card.deck_id))

    @staticmethod
    def _lowest_winning_card(cards: List[Card]) -> Card:
        """Pick the cheapest card that still wins."""
        return min(cards, key=lambda card: (card.points, card.rank_value, card.suit.value, card.deck_id))
    
    @staticmethod
    def place_bid(game: GameRound, player_id: str, bid_amount: Optional[int]) -> Tuple[bool, str]:
        """
        Place a bid or pass.
        Returns (success, message)
        """
        if player_id not in game.bids:
            return False, "Invalid player"

        passed_player_ids = GameEngine._get_passed_player_ids(game)
        GameEngine._normalize_bidding_player(game)
        current_player = game.players[game.bidding_player_index]
        if player_id != current_player.player_id:
            return False, "Not your turn to bid"
        
        if player_id in passed_player_ids:
            return False, "Player already bid"
        
        if bid_amount is None:
            # Player passes
            passed_player_ids.add(player_id)
            
            if GameEngine._should_finalize_default_bid(game):
                GameEngine._finalize_default_bid(game)
                return True, "Bidding complete"

            if GameEngine._is_bidding_complete(game):
                return True, "Bidding complete"
            
            # Move to next player
            GameEngine._move_bidding_to_next_player(game)
            return True, "Pass"
        
        # Validate bid
        minimum_bid = GameEngine._minimum_next_bid(game.highest_bid)

        if bid_amount < minimum_bid:
            return False, f"Minimum bid is {minimum_bid}"

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
        GameEngine.resolve_bidding_turns(game)
        
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
    def _normalize_bidding_player(game: GameRound) -> None:
        """Ensure the current bidding index points at an active bidder."""
        num_players = len(game.players)
        passed_player_ids = GameEngine._get_passed_player_ids(game)

        for _ in range(num_players):
            current_player = game.players[game.bidding_player_index]
            if current_player.player_id not in passed_player_ids:
                return
            game.bidding_player_index = (game.bidding_player_index + 1) % num_players
    
    @staticmethod
    def _is_bidding_complete(game: GameRound) -> bool:
        """Check if bidding phase is complete."""
        passed_player_ids = GameEngine._get_passed_player_ids(game)
        if game.highest_bidder_id is None:
            return False

        active_player_ids = {player.player_id for player in game.players if not player.is_bot} - passed_player_ids
        return active_player_ids == {game.highest_bidder_id}

    @staticmethod
    def _should_finalize_default_bid(game: GameRound) -> bool:
        """Check whether bidding should fall back to the first human player."""
        if game.highest_bidder_id is not None:
            return False

        active_human_players = [
            player
            for player in game.players
            if not player.is_bot and player.player_id not in GameEngine._get_passed_player_ids(game)
        ]
        return len(active_human_players) == 0

    @staticmethod
    def _finalize_default_bid(game: GameRound) -> None:
        """Assign the default 75 contract to the first human player."""
        first_human_player = next((player for player in game.players if not player.is_bot), None)
        if not first_human_player:
            return

        game.highest_bidder_id = first_human_player.player_id
        game.highest_bid = 75
        game.bids[first_human_player.player_id] = 75
        game.bidding_player_index = next(
            i for i, player in enumerate(game.players) if player.player_id == first_human_player.player_id
        )
    
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
        game.current_player_index = next(
            i for i, p in enumerate(game.players) if p.player_id == game.highest_bidder_id
        )

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
        
        trick_completed = False

        # Check if trick complete
        if len(game.current_trick.cards_played) == len(game.players):
            GameEngine._complete_trick(game)
            trick_completed = True

            # Check if round complete
            if GameEngine._is_round_complete(game):
                return True, "Round complete"

            # Start next trick
            game.current_trick = Trick(len(game.tricks) + 1)
        else:
            game.current_player_index = (game.current_player_index + 1) % len(game.players)

        return True, "Trick complete" if trick_completed else "Card played"

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
            if winning_card.suit == game.trump_suit:
                if card.suit == game.trump_suit and card.rank_value > winning_card.rank_value:
                    winning_card_idx = i
                    winning_card = card
                continue

            if card.suit == game.trump_suit:
                winning_card_idx = i
                winning_card = card
                continue

            if winning_card.suit != game.trump_suit and card.suit == led_suit and card.rank_value > winning_card.rank_value:
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
        game.round_story = GameEngine.build_round_story(game)
        return results

    @staticmethod
    def build_round_story(game: GameRound) -> dict:
        """Build a short story summary for the round end screen."""
        top_trick = max(game.tricks, key=lambda trick: trick.trick_points, default=None)
        winner_name = next((player.name for player in game.players if player.player_id == game.highest_bidder_id), "Unknown")

        return {
            "target": game.highest_bid,
            "team_points": game.team_points,
            "bid_achieved": game.bid_achieved,
            "margin": game.team_points - game.highest_bid,
            "bidder_name": winner_name,
            "top_trick": {
                "trick_number": top_trick.trick_number if top_trick else None,
                "winner_id": top_trick.winner_id if top_trick else None,
                "winner_name": next((player.name for player in game.players if top_trick and player.player_id == top_trick.winner_id), None),
                "trick_points": top_trick.trick_points if top_trick else 0,
                "cards_played": [str(card) for _, card, _ in top_trick.cards_played] if top_trick else [],
            } if top_trick else None
        }
