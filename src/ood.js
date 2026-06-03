// ── OOD DESIGN PRACTICE ───────────────────────────────────────────────────────
import { state } from './state.js'
import { t } from './i18n.js'
import { esc, md2h, showErr } from './util.js'
import { claude, claudeStream } from './api.js'
import { initPaneDrag } from './panedrag.js'

// ── Module state ──────────────────────────────────────────────────────────────
let _currentQ = null   // question id | null = list view
let _lang = 'java'     // 'python' | 'java'
let _code = {}         // { 'qid:lang': string }
let _analysis = {}     // { qid: string }
let _streaming = false

// ── Question catalogue ────────────────────────────────────────────────────────
const QUESTIONS = [
  {
    id: 'deck',
    icon: '🃏',
    title: 'Deck of Cards',
    difficulty: 'easy',
    desc: 'Design a standard 52-card deck supporting shuffle, deal to multiple players, and game reset.',
    scenarios: [
      'Shuffle the deck and deal 5 cards to each of 4 players',
      'Player draws a card — deck size decrements correctly',
      'Deck runs empty before all players receive cards — handle gracefully',
      'Game ends; all cards collected, deck reshuffled for a new round',
      'Two decks combined for a multi-deck variant (e.g. Blackjack)',
    ],
    py: `from enum import Enum
import random
from typing import Optional

class Suit(Enum):
    HEARTS = "Hearts"; DIAMONDS = "Diamonds"
    CLUBS = "Clubs";   SPADES = "Spades"

class Rank(Enum):
    TWO=2; THREE=3; FOUR=4; FIVE=5; SIX=6; SEVEN=7
    EIGHT=8; NINE=9; TEN=10; JACK=11; QUEEN=12; KING=13; ACE=14

class Card:
    def __init__(self, suit: Suit, rank: Rank):
        self.suit = suit
        self.rank = rank

    def __repr__(self):
        return f"{self.rank.name} of {self.suit.name}"

class Deck:
    def __init__(self):
        self.cards: list[Card] = []
        self.reset()

    def reset(self) -> None:
        pass  # TODO: populate all 52 cards (4 suits x 13 ranks)

    def shuffle(self) -> None:
        random.shuffle(self.cards)

    def draw(self) -> Optional[Card]:
        pass  # TODO: pop top card, return None if empty

    def size(self) -> int:
        return len(self.cards)

class Hand:
    def __init__(self):
        self.cards: list[Card] = []

    def receive(self, card: Card) -> None:
        self.cards.append(card)

    def discard_all(self) -> list[Card]:
        pass  # TODO: clear hand and return cards to caller

class Player:
    def __init__(self, name: str):
        self.name = name
        self.hand = Hand()

class CardGame:
    def __init__(self, player_names: list[str]):
        self.deck = Deck()
        self.players = [Player(n) for n in player_names]
        self.discard_pile: list[Card] = []

    def deal(self, cards_per_player: int) -> None:
        pass  # TODO: deal N cards to each player in round-robin

    def new_game(self) -> None:
        pass  # TODO: collect all cards, reset + shuffle deck, deal again`,
    java: `import java.util.*;

enum Suit { HEARTS, DIAMONDS, CLUBS, SPADES }

enum Rank {
    TWO(2), THREE(3), FOUR(4), FIVE(5), SIX(6), SEVEN(7),
    EIGHT(8), NINE(9), TEN(10), JACK(11), QUEEN(12), KING(13), ACE(14);
    final int value;
    Rank(int v) { this.value = v; }
}

class Card {
    final Suit suit; final Rank rank;
    Card(Suit s, Rank r) { suit = s; rank = r; }
    @Override public String toString() { return rank + " of " + suit; }
}

class Deck {
    private final List<Card> cards = new ArrayList<>();
    Deck() { reset(); }
    void reset() { cards.clear(); /* TODO: 4 suits x 13 ranks */ }
    void shuffle() { Collections.shuffle(cards); }
    Optional<Card> draw() { /* TODO: remove + return last card */ return Optional.empty(); }
    int size() { return cards.size(); }
}

class Hand {
    private final List<Card> cards = new ArrayList<>();
    void receive(Card c) { cards.add(c); }
    List<Card> discardAll() { /* TODO */ return new ArrayList<>(); }
    List<Card> getCards() { return Collections.unmodifiableList(cards); }
}

class Player {
    final String name; final Hand hand = new Hand();
    Player(String name) { this.name = name; }
}

class CardGame {
    private final Deck deck; private final List<Player> players = new ArrayList<>();
    private final List<Card> discardPile = new ArrayList<>();
    CardGame(String... names) {
        deck = new Deck();
        for (String n : names) players.add(new Player(n));
    }
    void deal(int cardsPerPlayer) { /* TODO: round-robin deal */ }
    void newGame() { /* TODO: collect cards, reset, deal */ }
}`,
  },

  {
    id: 'vending',
    icon: '🍫',
    title: 'Vending Machine',
    difficulty: 'easy',
    desc: 'Design a vending machine that manages inventory, accepts coins, dispenses items, and returns change.',
    scenarios: [
      'User inserts exact change and selects an item — item dispensed',
      'User inserts more than required — item dispensed, correct change returned',
      'User selects a sold-out item — display "Out of Stock", money refunded',
      'User inserts coins then cancels — full refund issued',
      'Machine runs low on change — rejects overpayment for low-cost items',
    ],
    py: `from enum import Enum
from typing import Optional

class Coin(Enum):
    PENNY = 1; NICKEL = 5; DIME = 10; QUARTER = 25

class ItemType(Enum):
    CHIPS = "Chips"; CANDY = "Candy"; SODA = "Soda"; WATER = "Water"

class Item:
    def __init__(self, item_type: ItemType, price_cents: int, quantity: int):
        self.item_type = item_type
        self.price = price_cents
        self.quantity = quantity

    def is_available(self) -> bool:
        return self.quantity > 0

class MachineState(Enum):
    IDLE = "idle"
    COIN_INSERTED = "coin_inserted"
    DISPENSING = "dispensing"
    MAINTENANCE = "maintenance"

class VendingMachine:
    def __init__(self):
        self.inventory: dict[ItemType, Item] = {}
        self.balance: int = 0        # cents currently inserted
        self.state = MachineState.IDLE
        self.coin_stock: dict[Coin, int] = {}  # coins available for change
        self._init_inventory()

    def _init_inventory(self) -> None:
        pass  # TODO: stock default items and coins

    def insert_coin(self, coin: Coin) -> None:
        pass  # TODO: update balance, transition to COIN_INSERTED

    def select_item(self, item_type: ItemType) -> Optional[Item]:
        pass  # TODO: validate balance + stock, dispense, return change

    def cancel(self) -> int:
        pass  # TODO: refund balance in cents, reset to IDLE

    def _make_change(self, amount: int) -> dict[Coin, int]:
        pass  # TODO: greedy selection from coin_stock

    def refill(self, item_type: ItemType, qty: int) -> None:
        pass  # TODO: operator restock`,
    java: `import java.util.*;

enum Coin { PENNY(1), NICKEL(5), DIME(10), QUARTER(25);
    final int cents; Coin(int c) { this.cents = c; } }

enum ItemType { CHIPS, CANDY, SODA, WATER }

class Item {
    final ItemType type; final int priceCents; int quantity;
    Item(ItemType t, int p, int q) { type=t; priceCents=p; quantity=q; }
    boolean isAvailable() { return quantity > 0; }
}

enum MachineState { IDLE, COIN_INSERTED, DISPENSING, MAINTENANCE }

class VendingMachine {
    private final Map<ItemType, Item> inventory = new EnumMap<>(ItemType.class);
    private final Map<Coin, Integer> coinStock    = new EnumMap<>(Coin.class);
    private int balance; // cents
    private MachineState state = MachineState.IDLE;

    VendingMachine() { initInventory(); }

    private void initInventory() { /* TODO: stock items + coins */ }

    public void insertCoin(Coin coin) {
        /* TODO: add to balance, transition state */
    }

    public Optional<Item> selectItem(ItemType type) {
        /* TODO: check stock + balance, dispense, return change */
        return Optional.empty();
    }

    public int cancel() {
        /* TODO: refund balance, reset state */ return 0;
    }

    private Map<Coin, Integer> makeChange(int amount) {
        /* TODO: greedy coin selection from stock */
        return new EnumMap<>(Coin.class);
    }

    public void refill(ItemType type, int qty) { /* TODO */ }
}`,
  },

  {
    id: 'parking',
    icon: '🅿️',
    title: 'Parking Lot',
    difficulty: 'medium',
    desc: 'Design a multi-level parking lot that supports different vehicle sizes, issues tickets on entry, and calculates fees on exit.',
    scenarios: [
      'A car enters — nearest available medium spot assigned, ticket issued',
      'A motorcycle enters — can use any spot (SMALL preferred)',
      'Lot is completely full — new vehicle turned away gracefully',
      'A truck enters — only LARGE spots are valid',
      'Vehicle exits after 90 minutes — fee calculated, spot freed',
    ],
    py: `from enum import Enum
from datetime import datetime
from typing import Optional

class SpotSize(Enum):
    SMALL  = "small"   # motorcycles
    MEDIUM = "medium"  # cars
    LARGE  = "large"   # trucks / buses

class Vehicle:
    def __init__(self, plate: str, size: SpotSize):
        self.plate = plate
        self.size  = size

class ParkingSpot:
    def __init__(self, spot_id: str, size: SpotSize):
        self.spot_id = spot_id
        self.size    = size
        self.vehicle: Optional[Vehicle] = None

    def is_available(self) -> bool:
        return self.vehicle is None

    def park(self, vehicle: Vehicle) -> bool:
        pass  # TODO: assign if compatible + available

    def remove_vehicle(self) -> Optional[Vehicle]:
        pass  # TODO: clear spot, return vehicle

class ParkingTicket:
    def __init__(self, vehicle: Vehicle, spot: ParkingSpot, level: int):
        self.vehicle    = vehicle
        self.spot       = spot
        self.level      = level
        self.entry_time = datetime.now()
        self.exit_time: Optional[datetime] = None

class ParkingLevel:
    def __init__(self, level: int, small: int, medium: int, large: int):
        self.level = level
        self.spots: list[ParkingSpot] = []
        # TODO: initialise spots from counts

    def find_spot(self, vehicle: Vehicle) -> Optional[ParkingSpot]:
        pass  # TODO: first available compatible spot

class ParkingLot:
    RATE_PER_HOUR = 2.0

    def __init__(self, num_levels: int = 5):
        self.levels: list[ParkingLevel] = []
        # TODO: initialise levels

    def park(self, vehicle: Vehicle) -> Optional[ParkingTicket]:
        pass  # TODO: find spot across levels; return ticket or None

    def exit(self, ticket: ParkingTicket) -> float:
        pass  # TODO: set exit_time, free spot, return fee

    def available_spots(self) -> dict:
        pass  # TODO: {SpotSize: count} across all levels`,
    java: `import java.time.*;
import java.util.*;

enum SpotSize { SMALL, MEDIUM, LARGE }

class Vehicle {
    final String plate; final SpotSize size;
    Vehicle(String p, SpotSize s) { plate=p; size=s; }
}

class ParkingSpot {
    final String id; final SpotSize size; private Vehicle vehicle;
    ParkingSpot(String id, SpotSize s) { this.id=id; this.size=s; }
    boolean isAvailable() { return vehicle == null; }
    boolean park(Vehicle v)  { /* TODO */ return false; }
    Vehicle remove()          { /* TODO */ return null; }
}

class ParkingTicket {
    final Vehicle vehicle; final ParkingSpot spot; final int level;
    final LocalDateTime entryTime; LocalDateTime exitTime;
    ParkingTicket(Vehicle v, ParkingSpot s, int lvl) {
        vehicle=v; spot=s; level=lvl; entryTime=LocalDateTime.now();
    }
}

class ParkingLevel {
    final int level; private final List<ParkingSpot> spots = new ArrayList<>();
    ParkingLevel(int level, int small, int medium, int large) {
        this.level = level; /* TODO: init spots */
    }
    Optional<ParkingSpot> findSpot(Vehicle v) { /* TODO */ return Optional.empty(); }
}

class ParkingLot {
    private static final double RATE = 2.0; // per hour
    private final List<ParkingLevel> levels = new ArrayList<>();
    ParkingLot(int numLevels) { /* TODO: init levels */ }
    ParkingTicket park(Vehicle v) { /* TODO */ return null; }
    double exit(ParkingTicket t)  { /* TODO: fee + free spot */ return 0; }
    Map<SpotSize, Long> available() { /* TODO */ return new EnumMap<>(SpotSize.class); }
}`,
  },

  {
    id: 'atm',
    icon: '🏧',
    title: 'ATM Machine',
    difficulty: 'medium',
    desc: 'Design an ATM that authenticates cards, handles withdrawals and deposits, and manages session state.',
    scenarios: [
      'User inserts card, enters correct PIN, withdraws $200 — cash dispensed, balance debited',
      'User enters wrong PIN 3 times — card is blocked, session terminated',
      'Withdrawal amount exceeds account balance — transaction declined',
      'ATM itself has insufficient cash — decline with message, do not debit account',
      'Session idle 60 seconds — card automatically ejected',
    ],
    py: `from enum import Enum
from typing import Optional

class AccountStatus(Enum):
    ACTIVE = "active"; BLOCKED = "blocked"; CLOSED = "closed"

class TransactionType(Enum):
    WITHDRAWAL = "withdrawal"; DEPOSIT = "deposit"; INQUIRY = "inquiry"

class Account:
    def __init__(self, account_id: str, pin: str, balance: float):
        self.account_id = account_id
        self._pin_hash  = hash(pin)   # simplified — use bcrypt in prod
        self.balance    = balance
        self.status     = AccountStatus.ACTIVE

    def verify_pin(self, pin: str) -> bool:
        return hash(pin) == self._pin_hash

    def debit(self, amount: float) -> bool:
        pass  # TODO: check balance + status, update

    def credit(self, amount: float) -> None:
        pass  # TODO: update balance

class Card:
    def __init__(self, card_number: str, account: Account):
        self.card_number = card_number
        self.account     = account

class Transaction:
    def __init__(self, tx_type: TransactionType, amount: float, account_id: str):
        self.tx_type    = tx_type
        self.amount     = amount
        self.account_id = account_id
        self.success    = False

class CashDispenser:
    def __init__(self, initial_cash: float):
        self.cash_available = initial_cash

    def dispense(self, amount: float) -> bool:
        pass  # TODO: check availability, reduce stock

class ATM:
    MAX_PIN_ATTEMPTS = 3

    def __init__(self, atm_id: str, initial_cash: float):
        self.atm_id      = atm_id
        self.dispenser   = CashDispenser(initial_cash)
        self._card: Optional[Card] = None
        self._attempts   = 0

    def insert_card(self, card: Card) -> bool:
        pass  # TODO: accept if no active session

    def enter_pin(self, pin: str) -> bool:
        pass  # TODO: verify, track attempts, block on max failure

    def withdraw(self, amount: float) -> Transaction:
        pass  # TODO: validate session, balance, dispenser

    def deposit(self, amount: float) -> Transaction:
        pass

    def eject_card(self) -> None:
        pass  # TODO: clear session state`,
    java: `import java.util.*;

enum AccountStatus { ACTIVE, BLOCKED, CLOSED }
enum TxType { WITHDRAWAL, DEPOSIT, INQUIRY }

class Account {
    final String id; private final int pinHash;
    private double balance; AccountStatus status = AccountStatus.ACTIVE;
    Account(String id, String pin, double bal) {
        this.id=id; pinHash=pin.hashCode(); balance=bal;
    }
    boolean verifyPin(String pin) { return pin.hashCode() == pinHash; }
    boolean debit(double amt)  { /* TODO */ return false; }
    void    credit(double amt) { /* TODO */ }
    double  getBalance()       { return balance; }
}

class Card {
    final String number; final Account account;
    Card(String n, Account a) { number=n; account=a; }
}

class Transaction {
    final TxType type; final double amount; boolean success;
    Transaction(TxType t, double amt) { type=t; amount=amt; }
}

class CashDispenser {
    private double cashAvailable;
    CashDispenser(double initial) { cashAvailable = initial; }
    boolean dispense(double amount) { /* TODO */ return false; }
}

class ATM {
    private static final int MAX_ATTEMPTS = 3;
    private final CashDispenser dispenser;
    private Card currentCard; private int pinAttempts;

    ATM(double initialCash) { dispenser = new CashDispenser(initialCash); }

    boolean insertCard(Card card) { /* TODO: reject if session active */ return false; }
    boolean enterPin(String pin)  { /* TODO: track attempts, block */ return false; }
    Transaction withdraw(double amount) { /* TODO */ return null; }
    Transaction deposit(double amount)  { /* TODO */ return null; }
    void ejectCard() { currentCard=null; pinAttempts=0; }
}`,
  },

  {
    id: 'library',
    icon: '📚',
    title: 'Library Management',
    difficulty: 'medium',
    desc: 'Design a library system managing books, members, checkouts, reservations, and overdue fines.',
    scenarios: [
      'Member checks out an available book — due date set to 14 days from now',
      'Book already borrowed — system creates a reservation for the member',
      'Member returns a book 5 days late — fine calculated at $0.25/day',
      'Member searches by title or author — partial, case-insensitive match',
      'Member already has 3 books checked out — 4th checkout denied',
    ],
    py: `from enum import Enum
from datetime import datetime, timedelta
from typing import Optional

class BookStatus(Enum):
    AVAILABLE   = "available"
    CHECKED_OUT = "checked_out"
    RESERVED    = "reserved"
    LOST        = "lost"

class Book:
    def __init__(self, isbn: str, title: str, author: str):
        self.isbn   = isbn
        self.title  = title
        self.author = author
        self.items: list['BookItem'] = []

class BookItem:
    def __init__(self, barcode: str, book: Book):
        self.barcode     = barcode
        self.book        = book
        self.status      = BookStatus.AVAILABLE
        self.due_date:   Optional[datetime] = None
        self.borrowed_by: Optional[str]     = None  # member_id

class Member:
    CHECKOUT_LIMIT = 3
    LOAN_DAYS      = 14
    FINE_PER_DAY   = 0.25

    def __init__(self, member_id: str, name: str):
        self.member_id       = member_id
        self.name            = name
        self.checked_out:    list[BookItem] = []
        self.reservations:   list[str]      = []  # isbn list
        self.outstanding_fine: float        = 0.0

class Catalog:
    def __init__(self):
        self.books: dict[str, Book] = {}  # isbn -> Book

    def add_book(self, book: Book) -> None:
        pass  # TODO

    def search_by_title(self, title: str) -> list[Book]:
        pass  # TODO: case-insensitive partial match

    def search_by_author(self, author: str) -> list[Book]:
        pass  # TODO

class Library:
    def __init__(self):
        self.catalog = Catalog()
        self.members: dict[str, Member] = {}

    def checkout(self, member_id: str, isbn: str) -> Optional[BookItem]:
        pass  # TODO: enforce limit, find available item, set due_date

    def return_book(self, member_id: str, barcode: str) -> float:
        pass  # TODO: compute fine if overdue, free item, notify reservations

    def reserve(self, member_id: str, isbn: str) -> bool:
        pass  # TODO: add to reservation queue`,
    java: `import java.time.*;
import java.util.*;

enum BookStatus { AVAILABLE, CHECKED_OUT, RESERVED, LOST }

class Book {
    final String isbn, title, author;
    final List<BookItem> items = new ArrayList<>();
    Book(String isbn, String title, String author) {
        this.isbn=isbn; this.title=title; this.author=author;
    }
}

class BookItem {
    final String barcode; final Book book;
    BookStatus status = BookStatus.AVAILABLE;
    LocalDate dueDate; String borrowedBy;
    BookItem(String barcode, Book book) { this.barcode=barcode; this.book=book; }
}

class Member {
    static final int    LIMIT        = 3;
    static final int    LOAN_DAYS    = 14;
    static final double FINE_PER_DAY = 0.25;
    final String id, name;
    final List<BookItem> checkedOut   = new ArrayList<>();
    final List<String>   reservations = new ArrayList<>();  // isbn list
    double outstandingFine;
    Member(String id, String name) { this.id=id; this.name=name; }
}

class Catalog {
    private final Map<String, Book> books = new HashMap<>();
    void addBook(Book b) { books.put(b.isbn, b); }
    List<Book> searchByTitle(String t)  { /* TODO: partial match */ return new ArrayList<>(); }
    List<Book> searchByAuthor(String a) { /* TODO */ return new ArrayList<>(); }
}

class Library {
    private final Catalog catalog = new Catalog();
    private final Map<String, Member> members = new HashMap<>();

    BookItem checkout(String memberId, String isbn) {
        /* TODO: limit check, find item, set due date */ return null;
    }
    double returnBook(String memberId, String barcode) {
        /* TODO: fine calc, free item, notify waitlist */ return 0;
    }
    boolean reserve(String memberId, String isbn) { /* TODO */ return false; }
}`,
  },

  {
    id: 'elevator',
    icon: '🛗',
    title: 'Elevator System',
    difficulty: 'medium',
    desc: 'Design a multi-elevator controller that schedules pickups efficiently and handles button presses from floors and cabins.',
    scenarios: [
      'User on floor 3 presses UP — nearest idle elevator dispatched',
      'Multiple simultaneous floor requests — controller assigns optimally',
      'Elevator at weight capacity — doors stay open, new request queued from that floor',
      'Inside panel: user presses floor 10 — added to that elevator\'s stop queue',
      'Emergency stop triggered — all elevators halt immediately, doors open',
    ],
    py: `from enum import Enum
from typing import Optional

class Direction(Enum):
    UP = "up"; DOWN = "down"; IDLE = "idle"

class ElevatorState(Enum):
    MOVING = "moving"; STOPPED = "stopped"; MAINTENANCE = "maintenance"

class Door:
    def __init__(self):
        self.is_open = False

    def open(self) -> None:
        self.is_open = True

    def close(self) -> bool:
        pass  # TODO: return False if obstructed

class Elevator:
    CAPACITY_KG = 1000

    def __init__(self, elevator_id: int):
        self.id            = elevator_id
        self.current_floor = 1
        self.direction     = Direction.IDLE
        self.state         = ElevatorState.STOPPED
        self.door          = Door()
        self.floor_queue:  list[int] = []
        self.weight_kg:    float     = 0.0

    def add_stop(self, floor: int) -> None:
        pass  # TODO: insert in sorted order for current direction

    def step(self) -> None:
        pass  # TODO: move one floor toward next target

    def open_doors(self) -> None:
        pass  # TODO: stop, open door, remove floor from queue

    def is_idle(self) -> bool:
        return self.direction == Direction.IDLE

class ElevatorController:
    def __init__(self, num_elevators: int, num_floors: int):
        self.elevators  = [Elevator(i) for i in range(num_elevators)]
        self.num_floors = num_floors

    def request(self, floor: int, direction: Direction) -> Optional[Elevator]:
        pass  # TODO: pick nearest idle elevator or same-direction elevator

    def emergency_stop(self) -> None:
        pass  # TODO: halt all, open all doors`,
    java: `import java.util.*;

enum Direction { UP, DOWN, IDLE }
enum ElevatorState { MOVING, STOPPED, MAINTENANCE }

class Door {
    private boolean open;
    void open() { open = true; }
    boolean close() { /* TODO: obstruction check */ open = false; return true; }
    boolean isOpen() { return open; }
}

class Elevator {
    static final double CAPACITY_KG = 1000;
    final int id;
    private int currentFloor = 1;
    private Direction direction = Direction.IDLE;
    private ElevatorState state = ElevatorState.STOPPED;
    private final Door door = new Door();
    private final TreeSet<Integer> floorQueue = new TreeSet<>();
    private double weightKg;

    Elevator(int id) { this.id = id; }

    void addStop(int floor) { /* TODO: sorted insert for current direction */ }
    void step()             { /* TODO: move one floor toward next target */ }
    void openDoors()        { /* TODO: stop + open + dequeue floor */ }
    boolean isIdle()        { return direction == Direction.IDLE; }
    int getCurrentFloor()   { return currentFloor; }
}

class ElevatorController {
    private final List<Elevator> elevators;
    ElevatorController(int count, int floors) {
        elevators = new ArrayList<>();
        for (int i = 0; i < count; i++) elevators.add(new Elevator(i));
    }
    Elevator request(int floor, Direction dir) {
        /* TODO: nearest idle or same-direction elevator */ return null;
    }
    void emergencyStop() { /* TODO: halt + open all */ }
}`,
  },

  {
    id: 'movie',
    icon: '🎬',
    title: 'Movie Ticket Booking',
    difficulty: 'medium',
    desc: 'Design a ticket booking system with multiple theatres, shows, seat selection, and payment.',
    scenarios: [
      'Customer books 2 adjacent seats — seats locked for 10 minutes pending payment',
      'Payment succeeds — seats confirmed as BOOKED, customer notified',
      'Payment times out — seats released back to AVAILABLE pool',
      'Show is sold out — customer offered waitlist',
      'Customer cancels 24+ hours before show — full refund issued',
    ],
    py: `from enum import Enum
from datetime import datetime
from typing import Optional

class SeatType(Enum):
    STANDARD = "standard"; PREMIUM = "premium"; VIP = "vip"

class SeatStatus(Enum):
    AVAILABLE = "available"; LOCKED = "locked"; BOOKED = "booked"

class Seat:
    def __init__(self, row: str, number: int, seat_type: SeatType):
        self.row       = row
        self.number    = number
        self.seat_type = seat_type
        self.status    = SeatStatus.AVAILABLE

class Movie:
    def __init__(self, movie_id: str, title: str, duration_mins: int):
        self.movie_id = movie_id
        self.title    = title
        self.duration = duration_mins

class Show:
    LOCK_MINUTES = 10

    def __init__(self, show_id: str, movie: Movie, start_time: datetime):
        self.show_id    = show_id
        self.movie      = movie
        self.start_time = start_time
        self.seats: dict[str, Seat] = {}  # "A1" -> Seat

    def lock_seats(self, seat_keys: list[str]) -> bool:
        pass  # TODO: atomically lock if ALL are available

    def book_seats(self, seat_keys: list[str]) -> bool:
        pass  # TODO: LOCKED -> BOOKED

    def release_seats(self, seat_keys: list[str]) -> None:
        pass  # TODO: LOCKED -> AVAILABLE

class Booking:
    def __init__(self, booking_id: str, show: Show,
                 seat_keys: list[str], customer_id: str):
        self.booking_id  = booking_id
        self.show        = show
        self.seat_keys   = seat_keys
        self.customer_id = customer_id
        self.created_at  = datetime.now()
        self.paid        = False

class BookingSystem:
    def __init__(self):
        self.shows: dict[str, Show] = {}
        self.bookings: dict[str, Booking] = {}

    def search_shows(self, movie_id: str, date: str) -> list[Show]:
        pass  # TODO

    def book(self, show_id: str, seat_keys: list[str],
             customer_id: str) -> Optional[Booking]:
        pass  # TODO: lock seats, create pending booking

    def confirm_payment(self, booking_id: str) -> bool:
        pass  # TODO: LOCKED -> BOOKED seats, mark paid

    def cancel(self, booking_id: str) -> float:
        pass  # TODO: release seats, apply refund policy`,
    java: `import java.time.*;
import java.util.*;

enum SeatType { STANDARD, PREMIUM, VIP }
enum SeatStatus { AVAILABLE, LOCKED, BOOKED }

class Seat {
    final char row; final int number; final SeatType type;
    SeatStatus status = SeatStatus.AVAILABLE;
    Seat(char r, int n, SeatType t) { row=r; number=n; type=t; }
}

class Movie {
    final String id, title; final int durationMins;
    Movie(String id, String title, int dur) { this.id=id; this.title=title; durationMins=dur; }
}

class Show {
    static final int LOCK_MINUTES = 10;
    final String id; final Movie movie; final LocalDateTime startTime;
    private final Map<String, Seat> seats = new LinkedHashMap<>();
    Show(String id, Movie movie, LocalDateTime start) {
        this.id=id; this.movie=movie; startTime=start;
    }
    boolean lockSeats(List<String> keys)    { /* TODO: atomic lock */ return false; }
    boolean bookSeats(List<String> keys)    { /* TODO: locked->booked */ return false; }
    void    releaseSeats(List<String> keys) { /* TODO */ }
}

class Booking {
    final String id; final Show show; final List<String> seatKeys;
    final String customerId; final LocalDateTime createdAt = LocalDateTime.now();
    boolean paid;
    Booking(String id, Show s, List<String> k, String c) {
        this.id=id; show=s; seatKeys=k; customerId=c;
    }
}

class BookingSystem {
    private final Map<String, Show>    shows    = new HashMap<>();
    private final Map<String, Booking> bookings = new HashMap<>();

    List<Show>        searchShows(String movieId, LocalDate date)           { /* TODO */ return new ArrayList<>(); }
    Optional<Booking> book(String showId, List<String> seats, String cId)   { /* TODO */ return Optional.empty(); }
    boolean           confirmPayment(String bookingId)                       { /* TODO */ return false; }
    double            cancel(String bookingId)                               { /* TODO */ return 0; }
}`,
  },

  {
    id: 'cart',
    icon: '🛒',
    title: 'Online Shopping Cart',
    difficulty: 'medium',
    desc: 'Design an e-commerce cart with product inventory, cart management, coupon support, and order processing.',
    scenarios: [
      'Customer adds 3 units — stock reserved, cart updated',
      'Customer removes item — stock released back to inventory',
      'Customer applies a 20% discount code — total recalculated correctly',
      'Customer checks out — order created, payment processed',
      'Payment fails — cart items restored to inventory, order cancelled',
    ],
    py: `from enum import Enum
from typing import Optional

class Category(Enum):
    ELECTRONICS = "electronics"; CLOTHING = "clothing"
    BOOKS = "books";             FOOD = "food"

class Product:
    def __init__(self, product_id: str, name: str, price: float,
                 category: Category, stock: int):
        self.product_id = product_id
        self.name       = name
        self.price      = price
        self.category   = category
        self.stock      = stock

    def reserve(self, quantity: int) -> bool:
        pass  # TODO: decrement stock if sufficient

    def release(self, quantity: int) -> None:
        pass  # TODO: return to stock

class CartItem:
    def __init__(self, product: Product, quantity: int):
        self.product  = product
        self.quantity = quantity

    def subtotal(self) -> float:
        return self.product.price * self.quantity

class Coupon:
    def __init__(self, code: str, discount_pct: float):
        self.code         = code
        self.discount_pct = discount_pct   # 0.0 – 1.0

class Cart:
    def __init__(self, customer_id: str):
        self.customer_id = customer_id
        self.items: dict[str, CartItem] = {}  # product_id -> CartItem
        self.coupon: Optional[Coupon]   = None

    def add(self, product: Product, quantity: int) -> bool:
        pass  # TODO: reserve stock, add/update item

    def remove(self, product_id: str) -> None:
        pass  # TODO: release stock, remove item

    def apply_coupon(self, coupon: Coupon) -> None:
        self.coupon = coupon

    def total(self) -> float:
        pass  # TODO: sum subtotals, apply coupon discount

class OrderStatus(Enum):
    PENDING = "pending"; PAID = "paid"
    SHIPPED = "shipped"; CANCELLED = "cancelled"

class Order:
    def __init__(self, order_id: str, cart: Cart):
        self.order_id = order_id
        self.items    = dict(cart.items)
        self.status   = OrderStatus.PENDING
        self.total    = cart.total()

class OrderService:
    def __init__(self):
        self.orders: dict[str, Order] = {}

    def checkout(self, cart: Cart) -> Order:
        pass  # TODO: create order, charge payment

    def cancel(self, order_id: str) -> bool:
        pass  # TODO: release reserved stock, update status`,
    java: `import java.util.*;

enum Category { ELECTRONICS, CLOTHING, BOOKS, FOOD }

class Product {
    final String id, name; final double price;
    final Category category; private int stock;
    Product(String id, String name, double price, Category cat, int stock) {
        this.id=id; this.name=name; this.price=price; category=cat; this.stock=stock;
    }
    boolean reserve(int qty) { /* TODO */ return false; }
    void    release(int qty) { /* TODO */ }
    int     getStock()       { return stock; }
}

class CartItem {
    final Product product; int quantity;
    CartItem(Product p, int q) { product=p; quantity=q; }
    double subtotal() { return product.price * quantity; }
}

class Coupon {
    final String code; final double discountPct;
    Coupon(String c, double d) { code=c; discountPct=d; }
}

class Cart {
    final String customerId;
    private final Map<String, CartItem> items = new LinkedHashMap<>();
    private Coupon coupon;
    Cart(String customerId) { this.customerId = customerId; }
    boolean add(Product p, int qty)   { /* TODO: reserve stock */ return false; }
    void    remove(String productId)  { /* TODO: release stock */ }
    void    applyCoupon(Coupon c)     { coupon = c; }
    double  total()                   { /* TODO: sum + discount */ return 0; }
    Map<String, CartItem> getItems()  { return Collections.unmodifiableMap(items); }
}

enum OrderStatus { PENDING, PAID, SHIPPED, CANCELLED }

class Order {
    final String id; final Map<String, CartItem> items;
    OrderStatus status; double total;
    Order(String id, Cart cart) {
        this.id=id; items=new HashMap<>(cart.getItems()); status=OrderStatus.PENDING;
    }
}

class OrderService {
    private final Map<String, Order> orders = new HashMap<>();
    Order   checkout(String cartId) { /* TODO */ return null; }
    boolean cancel(String orderId)  { /* TODO: restore stock */ return false; }
}`,
  },

  {
    id: 'hotel',
    icon: '🏨',
    title: 'Hotel Booking',
    difficulty: 'hard',
    desc: 'Design a hotel reservation system with room types, availability search, check-in/out, and billing.',
    scenarios: [
      'Guest books a deluxe room for 3 nights — room reserved, confirmation generated',
      'Requested room type fully booked — suggest alternative type or waitlist',
      'Guest checks in — room status transitions to OCCUPIED',
      'Guest checks out 2 hours late — extra charge appended to bill',
      'Loyalty member applies points for a discount on final bill',
    ],
    py: `from enum import Enum
from datetime import date, datetime
from typing import Optional

class RoomType(Enum):
    STANDARD  = "standard"
    DELUXE    = "deluxe"
    SUITE     = "suite"
    PENTHOUSE = "penthouse"

class RoomStatus(Enum):
    AVAILABLE   = "available"
    RESERVED    = "reserved"
    OCCUPIED    = "occupied"
    MAINTENANCE = "maintenance"

class Room:
    def __init__(self, number: str, room_type: RoomType,
                 price_per_night: float, floor: int):
        self.number          = number
        self.room_type       = room_type
        self.price_per_night = price_per_night
        self.floor           = floor
        self.status          = RoomStatus.AVAILABLE
        self.amenities:      list[str] = []

class Guest:
    def __init__(self, guest_id: str, name: str, email: str):
        self.guest_id       = guest_id
        self.name           = name
        self.email          = email
        self.loyalty_points = 0

class Reservation:
    def __init__(self, res_id: str, guest: Guest, room: Room,
                 check_in: date, check_out: date):
        self.res_id     = res_id
        self.guest      = guest
        self.room       = room
        self.check_in   = check_in
        self.check_out  = check_out
        self.created_at = datetime.now()
        self.confirmed  = False
        self.total      = (check_out - check_in).days * room.price_per_night

class Hotel:
    def __init__(self, name: str):
        self.name         = name
        self.rooms: dict[str, Room] = {}
        self.reservations: dict[str, Reservation] = {}

    def search_available(self, room_type: RoomType,
                         check_in: date, check_out: date) -> list[Room]:
        pass  # TODO: rooms with no conflicting reservation in window

    def reserve(self, guest: Guest, room_number: str,
                check_in: date, check_out: date) -> Optional[Reservation]:
        pass  # TODO: verify availability, create + return reservation

    def check_in(self, res_id: str) -> bool:
        pass  # TODO: set room OCCUPIED, mark reservation active

    def check_out(self, res_id: str, extras: float = 0.0) -> float:
        pass  # TODO: compute final bill, free room

    def cancel(self, res_id: str) -> float:
        pass  # TODO: apply cancellation policy, return refund amount`,
    java: `import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

enum RoomType   { STANDARD, DELUXE, SUITE, PENTHOUSE }
enum RoomStatus { AVAILABLE, RESERVED, OCCUPIED, MAINTENANCE }

class Room {
    final String number; final RoomType type;
    final double pricePerNight; final int floor;
    RoomStatus status = RoomStatus.AVAILABLE;
    Room(String n, RoomType t, double price, int floor) {
        number=n; type=t; pricePerNight=price; this.floor=floor;
    }
}

class Guest {
    final String id, name, email; int loyaltyPoints;
    Guest(String id, String name, String email) {
        this.id=id; this.name=name; this.email=email;
    }
}

class Reservation {
    final String id; final Guest guest; final Room room;
    final LocalDate checkIn, checkOut; double total;
    boolean confirmed; final LocalDateTime createdAt = LocalDateTime.now();
    Reservation(String id, Guest g, Room r, LocalDate ci, LocalDate co) {
        this.id=id; guest=g; room=r; checkIn=ci; checkOut=co;
        total = ChronoUnit.DAYS.between(ci, co) * r.pricePerNight;
    }
}

class Hotel {
    final String name;
    private final Map<String, Room>        rooms        = new LinkedHashMap<>();
    private final Map<String, Reservation> reservations = new HashMap<>();
    Hotel(String name) { this.name = name; }

    List<Room> searchAvailable(RoomType type, LocalDate ci, LocalDate co) {
        /* TODO: filter rooms with no conflicting reservations */ return new ArrayList<>();
    }
    Optional<Reservation> reserve(Guest g, String roomNum, LocalDate ci, LocalDate co) {
        /* TODO: check availability, create reservation */ return Optional.empty();
    }
    boolean checkIn(String resId)              { /* TODO */ return false; }
    double  checkOut(String resId, double ext) { /* TODO: final bill */ return 0; }
    double  cancel(String resId)               { /* TODO: refund per policy */ return 0; }
}`,
  },

  {
    id: 'chess',
    icon: '♟️',
    title: 'Chess Game',
    difficulty: 'hard',
    desc: 'Design a two-player chess game with full piece movement rules, check/checkmate detection, and game state management.',
    scenarios: [
      'White pawn moves forward 2 squares from its starting rank — accepted',
      'Player attempts to move a piece that leaves their king in check — rejected',
      'King is in check — only moves that resolve check are legal',
      'No legal moves and king is in check — checkmate, game over',
      'King and rook both unmoved, path clear — castling executed',
    ],
    py: `from enum import Enum
from typing import Optional

class Color(Enum):
    WHITE = "white"; BLACK = "black"

class PieceType(Enum):
    KING = "K"; QUEEN = "Q"; ROOK = "R"
    BISHOP = "B"; KNIGHT = "N"; PAWN = "P"

class Piece:
    def __init__(self, piece_type: PieceType, color: Color):
        self.piece_type = piece_type
        self.color      = color
        self.has_moved  = False

    def valid_moves(self, pos: tuple[int,int], board: 'Board') -> list[tuple[int,int]]:
        pass  # TODO: return all (row, col) this piece can reach

class King(Piece):
    def __init__(self, color: Color):
        super().__init__(PieceType.KING, color)
    def valid_moves(self, pos, board):
        pass  # TODO: 1 square any direction + castling

class Queen(Piece):
    def __init__(self, color: Color):
        super().__init__(PieceType.QUEEN, color)
    def valid_moves(self, pos, board):
        pass  # TODO: unlimited distance any direction

class Rook(Piece):
    def __init__(self, color: Color):
        super().__init__(PieceType.ROOK, color)
    def valid_moves(self, pos, board):
        pass  # TODO: horizontal + vertical

class Bishop(Piece):
    def __init__(self, color: Color):
        super().__init__(PieceType.BISHOP, color)
    def valid_moves(self, pos, board):
        pass  # TODO: diagonals

class Knight(Piece):
    def __init__(self, color: Color):
        super().__init__(PieceType.KNIGHT, color)
    def valid_moves(self, pos, board):
        pass  # TODO: L-shape, jumps over pieces

class Pawn(Piece):
    def __init__(self, color: Color):
        super().__init__(PieceType.PAWN, color)
    def valid_moves(self, pos, board):
        pass  # TODO: 1 fwd (or 2 from start), capture diagonally

class Board:
    def __init__(self):
        self.grid: list[list[Optional[Piece]]] = [[None]*8 for _ in range(8)]
        self._setup()

    def _setup(self) -> None:
        pass  # TODO: place all 32 pieces in starting positions

    def get(self, row: int, col: int) -> Optional[Piece]:
        return self.grid[row][col]

    def move(self, src: tuple, dst: tuple) -> Optional[Piece]:
        pass  # TODO: execute move, return captured piece

    def find_king(self, color: Color) -> Optional[tuple]:
        pass  # TODO: locate king of given color

    def is_under_attack(self, pos: tuple, by_color: Color) -> bool:
        pass  # TODO: any piece of by_color threatens pos?

class ChessGame:
    def __init__(self, white_name: str, black_name: str):
        self.board        = Board()
        self.turn         = Color.WHITE
        self.white_name   = white_name
        self.black_name   = black_name
        self.move_history: list[dict] = []
        self.game_over    = False

    def make_move(self, src: tuple, dst: tuple) -> bool:
        pass  # TODO: validate legality, execute, check checkmate/stalemate

    def get_legal_moves(self, pos: tuple) -> list[tuple]:
        pass  # TODO: filter piece.valid_moves to exclude moves leaving own king in check

    def is_in_check(self, color: Color) -> bool:
        pass  # TODO: king of color is under attack

    def is_checkmate(self, color: Color) -> bool:
        pass  # TODO: in check AND no legal moves exist`,
    java: `import java.util.*;

enum Color { WHITE, BLACK }
enum PieceType { KING, QUEEN, ROOK, BISHOP, KNIGHT, PAWN }

abstract class Piece {
    final Color color; final PieceType type; boolean hasMoved;
    Piece(Color c, PieceType t) { color=c; type=t; }
    abstract List<int[]> validMoves(int[] pos, Board board);
}

class King   extends Piece { King(Color c)   { super(c, PieceType.KING);   }
    @Override public List<int[]> validMoves(int[] p, Board b) { /* TODO: 8 dir + castling */ return new ArrayList<>(); } }
class Queen  extends Piece { Queen(Color c)  { super(c, PieceType.QUEEN);  }
    @Override public List<int[]> validMoves(int[] p, Board b) { /* TODO: diag + rank/file */ return new ArrayList<>(); } }
class Rook   extends Piece { Rook(Color c)   { super(c, PieceType.ROOK);   }
    @Override public List<int[]> validMoves(int[] p, Board b) { /* TODO: rank + file */ return new ArrayList<>(); } }
class Bishop extends Piece { Bishop(Color c) { super(c, PieceType.BISHOP); }
    @Override public List<int[]> validMoves(int[] p, Board b) { /* TODO: diagonals */ return new ArrayList<>(); } }
class Knight extends Piece { Knight(Color c) { super(c, PieceType.KNIGHT); }
    @Override public List<int[]> validMoves(int[] p, Board b) { /* TODO: L-shapes */ return new ArrayList<>(); } }
class Pawn   extends Piece { Pawn(Color c)   { super(c, PieceType.PAWN);   }
    @Override public List<int[]> validMoves(int[] p, Board b) { /* TODO: advance + capture */ return new ArrayList<>(); } }

class Board {
    private final Piece[][] grid = new Piece[8][8];
    Board() { setup(); }
    private void setup() { /* TODO: place all 32 pieces */ }
    public Piece get(int r, int c) { return grid[r][c]; }
    public Piece move(int[] src, int[] dst) { /* TODO */ return null; }
    public int[] findKing(Color color) { /* TODO */ return null; }
    public boolean isUnderAttack(int[] pos, Color byColor) { /* TODO */ return false; }
}

class ChessGame {
    private final Board board = new Board();
    private Color turn = Color.WHITE; private boolean gameOver;
    private final List<int[][]> history = new ArrayList<>();

    boolean makeMove(int[] src, int[] dst) { /* TODO: validate, execute, check status */ return false; }
    List<int[]> getLegalMoves(int[] pos)   { /* TODO: filter for king safety */ return new ArrayList<>(); }
    boolean isInCheck(Color color)          { /* TODO */ return false; }
    boolean isCheckmate(Color color)        { /* TODO */ return false; }
}`,
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getQ(id) { return QUESTIONS.find(q => q.id === id) }

function _skeleton(q) {
  return _lang === 'python' ? q.py : q.java
}

function _currentCode(q) {
  const key = `${q.id}:${_lang}`
  return _code[key] !== undefined ? _code[key] : _skeleton(q)
}

function _saveCurrentCode() {
  if (!_currentQ) return
  const ta = document.getElementById('oodCode')
  if (ta) _code[`${_currentQ}:${_lang}`] = ta.value
}

// ── Renders ───────────────────────────────────────────────────────────────────

export function renderOod() {
  _currentQ = null
  document.getElementById('mainContent').innerHTML = `
    <div class="ood-wrap">
      <div class="ood-list-hd">
        <h2>🧱 ${t('OOD 设计练习', 'OOD Design Practice')}</h2>
        <p>${t('10 道经典面试题 · 写出设计方案，然后让 AI 深度评审', '10 classic interview questions · Write your solution, then get AI code review')}</p>
      </div>
      <div class="ood-q-list">
        ${QUESTIONS.map(q => `
          <div class="ood-q-card" onclick="openOodQ('${q.id}')">
            <div class="ood-q-card-left">
              <span class="ood-q-icon">${q.icon}</span>
              <div>
                <div class="ood-q-title">${esc(q.title)}</div>
                <div class="ood-q-desc">${esc(q.desc)}</div>
              </div>
            </div>
            <div class="ood-q-card-right">
              <span class="ood-diff-badge ${q.difficulty}">${q.difficulty[0].toUpperCase() + q.difficulty.slice(1)}</span>
              <span class="ood-arrow">→</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`
}

export function openOodQ(id) {
  _currentQ = id
  _renderQuestion()
}

function _renderQuestion() {
  const q = _getQ(_currentQ)
  if (!q) return

  const code     = _currentCode(q)
  const analysis = _analysis[q.id] || ''
  const ext      = _lang === 'python' ? 'py' : 'java'

  document.getElementById('mainContent').innerHTML = `
    <div class="ood-wrap">
      <div class="ood-q-hd">
        <button class="btn-sec ood-back-btn" onclick="oodBackToList()">← ${t('返回', 'Back')}</button>
        <span class="ood-q-hd-icon">${q.icon}</span>
        <h2>${esc(q.title)}</h2>
        <span class="ood-diff-badge ${q.difficulty}">${q.difficulty[0].toUpperCase() + q.difficulty.slice(1)}</span>
        <div class="ood-lang-tabs">
          <button class="ood-lang-tab${_lang === 'python' ? ' active' : ''}" onclick="oodSwitchLang('python')">Python</button>
          <button class="ood-lang-tab${_lang === 'java'   ? ' active' : ''}" onclick="oodSwitchLang('java')">Java</button>
        </div>
      </div>
      <div class="ood-editor-layout">
        <div class="ood-pane-code" id="oodPaneCode">
          <div class="ood-code-hd">
            <span class="ood-code-file">${q.id}.${ext}</span>
            <span class="ood-code-hint">Tab = 4 spaces &nbsp;·&nbsp; Ctrl+Enter = Analyze</span>
          </div>
          <textarea class="ood-textarea" id="oodCode"
            spellcheck="false" autocorrect="off" autocomplete="off"
            oninput="oodCodeInput()"
            placeholder="${t('在此编写面向对象设计方案…', 'Write your OOD solution here…')}">${esc(code)}</textarea>
        </div>
        <div class="ood-divider" id="oodDivider"></div>
        <div class="ood-pane-side" id="oodPaneSide">
          <div class="ood-scenarios-box">
            <div class="ood-scenarios-hd">📋 ${t('测试场景', 'Test Scenarios')}</div>
            <ol class="ood-scenario-list">
              ${q.scenarios.map(s => `<li>${esc(s)}</li>`).join('')}
            </ol>
          </div>
          <button class="btn-primary ood-analyze-btn" id="oodAnalyzeBtn" onclick="oodAnalyze()">
            🔍 ${t('分析我的设计', 'Analyze My Design')}
          </button>
          <div id="oodAnalysis" class="ood-analysis">
            ${analysis
              ? md2h(analysis)
              : `<div class="ood-analysis-empty">${t('点击「分析」获取 AI 代码评审', 'Click "Analyze" for AI code review')}</div>`}
          </div>
        </div>
      </div>
    </div>`

  initPaneDrag()

  // Wire Tab key and Ctrl+Enter imperatively (can't use inline onkeydown for Tab)
  const ta = document.getElementById('oodCode')
  if (ta) {
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault()
        const s = ta.selectionStart, end = ta.selectionEnd
        ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(end)
        ta.selectionStart = ta.selectionEnd = s + 4
        oodCodeInput()
      } else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault()
        window.oodAnalyze()
      }
    })
  }
}

// ── User actions ──────────────────────────────────────────────────────────────

export function oodBackToList() {
  _saveCurrentCode()
  renderOod()
}

export function oodSwitchLang(lang) {
  _saveCurrentCode()
  _lang = lang
  _renderQuestion()
}

export function oodCodeInput() {
  if (!_currentQ) return
  const ta = document.getElementById('oodCode')
  if (ta) _code[`${_currentQ}:${_lang}`] = ta.value
}

export async function oodAnalyze() {
  if (!_currentQ || _streaming) return
  const q = _getQ(_currentQ)
  if (!q) return

  const ta   = document.getElementById('oodCode')
  const code = ta?.value?.trim()
  if (!code) { alert(t('请先写一些代码再分析', 'Write some code before analyzing')); return }

  _streaming = true
  const btn = document.getElementById('oodAnalyzeBtn')
  if (btn) { btn.disabled = true; btn.textContent = `⟳ ${t('分析中…', 'Analyzing…')}` }

  const analysisDiv = document.getElementById('oodAnalysis')
  if (analysisDiv) {
    analysisDiv.innerHTML = `<div class="ood-analysis-loading">
      ⟳ ${t('AI 正在评审你的设计…', 'AI is reviewing your design…')}</div>`
  }

  const langLabel = _lang === 'python' ? 'Python' : 'Java'
  const replyLang = state.lang === 'en' ? 'English' : '中文'
  const system = `You are a senior SDE II software engineer conducting an OOD technical interview. \
Review the candidate's ${langLabel} solution. Be specific, constructive, and actionable. Use Markdown. \
Reply in ${replyLang}.`

  const userMsg = `## Problem: ${q.title}
${q.desc}

## Test Scenarios
${q.scenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Candidate's ${langLabel} Solution
\`\`\`${_lang}
${code}
\`\`\`

Evaluate on these dimensions (use ### headers):

### 1. Class Design & Responsibilities
Are classes well-defined with clear ownership? Any missing or unnecessary classes? SRP adherence?

### 2. Encapsulation & Abstraction
Is internal state properly hidden? Good use of access modifiers / properties / getters?

### 3. Relationships & Patterns
Composition vs inheritance used correctly? Any design patterns applied or missing?

### 4. Test Scenario Coverage
Walk through each numbered scenario — does the current design handle it? What gaps exist?

### 5. SDE II-Level Critique
What would a senior engineer flag as concerns? Thread safety? Scalability? Edge cases? Extensibility?

Reference specific class/method names from the code in your feedback.`

  try {
    const result = await claudeStream(system, userMsg, 3000, (accumulated) => {
      const div = document.getElementById('oodAnalysis')
      if (div) div.innerHTML = md2h(accumulated)
    })
    _analysis[_currentQ] = result
    const div = document.getElementById('oodAnalysis')
    if (div) div.innerHTML = md2h(result)
  } catch (err) {
    const div = document.getElementById('oodAnalysis')
    if (div) div.innerHTML = `<div class="ood-analysis-error">
      ${t('分析失败：', 'Analysis failed: ')}${esc(err?.message || String(err))}</div>`
  } finally {
    _streaming = false
    const btn = document.getElementById('oodAnalyzeBtn')
    if (btn) { btn.disabled = false; btn.textContent = `🔍 ${t('重新分析', 'Re-analyze')}` }
  }
}
