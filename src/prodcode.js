// ── PRODUCTION CODE DESIGN PRACTICE ───────────────────────────────────────────
import { state } from './state.js'
import { t } from './i18n.js'
import { esc, md2h } from './util.js'
import { claudeStream } from './api.js'
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
    id: 'rate_limiter',
    icon: '🪣',
    title: 'Rate Limiter — Token Bucket',
    difficulty: 'medium',
    desc: 'Implement a token-bucket rate limiter. Tokens accumulate at a fixed rate up to a burst capacity; each request consumes one token.',
    scenarios: [
      'Client makes 5 requests/sec within the 10 req/sec limit — all allowed',
      'Client bursts 15 requests at once against a 10 req/sec limit — first 10 allowed, rest rejected',
      'After being throttled, client waits 1 second — bucket refills, new requests allowed',
      'Multiple clients share the limiter with independent buckets — one client being throttled does not affect others',
      'Capacity and refill rate are configurable at construction time',
    ],
    py: `import time
import threading
from typing import Dict

class TokenBucket:
    def __init__(self, capacity: int, refill_rate: float):
        """
        capacity    : max tokens (burst size)
        refill_rate : tokens added per second
        """
        self.capacity    = capacity
        self.refill_rate = refill_rate
        self.tokens      = float(capacity)
        self._last_refill = time.monotonic()
        self._lock       = threading.Lock()

    def allow(self) -> bool:
        pass  # TODO: refill based on elapsed time, consume 1 token if available

    def _refill(self) -> None:
        pass  # TODO: add tokens proportional to elapsed time, cap at capacity


class RateLimiter:
    def __init__(self, capacity: int, refill_rate: float):
        self.capacity    = capacity
        self.refill_rate = refill_rate
        self._buckets: Dict[str, TokenBucket] = {}
        self._lock = threading.Lock()

    def is_allowed(self, client_id: str) -> bool:
        pass  # TODO: get-or-create bucket for client_id, call allow()

    def reset(self, client_id: str) -> None:
        pass  # TODO: remove bucket so it starts fresh`,
    java: `import java.util.Map;
import java.util.concurrent.*;

class TokenBucket {
    private final int capacity;
    private final double refillRate; // tokens per second
    private double tokens;
    private long lastRefillNs; // System.nanoTime()

    TokenBucket(int capacity, double refillRate) {
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.tokens = capacity;
        this.lastRefillNs = System.nanoTime();
    }

    synchronized boolean allow() {
        refill();
        if (tokens >= 1) { tokens--; return true; }
        return false;
    }

    private void refill() {
        // TODO: compute elapsed seconds, add tokens, cap at capacity
    }
}

public class RateLimiter {
    private final int capacity;
    private final double refillRate;
    private final ConcurrentHashMap<String, TokenBucket> buckets = new ConcurrentHashMap<>();

    public RateLimiter(int capacity, double refillRate) {
        this.capacity = capacity;
        this.refillRate = refillRate;
    }

    public boolean isAllowed(String clientId) {
        // TODO: computeIfAbsent new bucket, call allow()
        return false;
    }

    public void reset(String clientId) {
        buckets.remove(clientId);
    }
}`,
  },

  {
    id: 'leaky_bucket',
    icon: '🚰',
    title: 'Rate Limiter — Leaky Bucket',
    difficulty: 'medium',
    desc: 'Implement a leaky-bucket rate limiter. Requests queue in a fixed-capacity bucket and are drained at a constant rate, smoothing out bursts.',
    scenarios: [
      'Drain rate 5 req/s, capacity 10; 8 requests arrive instantly — all enqueued, drained steadily',
      'Bucket full (10 queued); new request arrives — rejected immediately with no queuing',
      'No requests for 2 s; 6 new requests arrive — bucket has drained 10 slots, all 6 accepted',
      'Two clients share the limiter with independent buckets — one full bucket does not affect the other',
      'Drain rate and bucket capacity are configurable at construction time',
    ],
    py: `import time
import threading
import collections
from typing import Dict, Optional

class LeakyBucket:
    def __init__(self, capacity: int, drain_rate: float):
        """
        capacity   : max number of queued requests
        drain_rate : requests drained per second (output rate)
        """
        self.capacity   = capacity
        self.drain_rate = drain_rate
        self._queue     = collections.deque()   # timestamps of queued requests
        self._lock      = threading.Lock()

    def allow(self) -> bool:
        """
        Returns True and enqueues the request if the bucket is not full.
        Drains any requests whose scheduled drain time has passed before deciding.
        """
        pass  # TODO: drain stale entries, check capacity, enqueue if room

    def _drain(self) -> None:
        """Remove requests from the front of the queue that have already drained."""
        pass  # TODO: pop entries whose scheduled time <= now

    def queued(self) -> int:
        with self._lock:
            self._drain()
            return len(self._queue)


class LeakyBucketLimiter:
    def __init__(self, capacity: int, drain_rate: float):
        self.capacity   = capacity
        self.drain_rate = drain_rate
        self._buckets: Dict[str, LeakyBucket] = {}
        self._lock = threading.Lock()

    def is_allowed(self, client_id: str) -> bool:
        pass  # TODO: get-or-create bucket, call allow()

    def reset(self, client_id: str) -> None:
        with self._lock:
            self._buckets.pop(client_id, None)`,
    java: `import java.util.*;
import java.util.concurrent.*;

class LeakyBucket {
    private final int capacity;
    private final double drainRate; // requests per second
    // Each entry is the scheduled drain time in nanoseconds
    private final Deque<Long> queue = new ArrayDeque<>();

    LeakyBucket(int capacity, double drainRate) {
        this.capacity = capacity;
        this.drainRate = drainRate;
    }

    synchronized boolean allow() {
        drain();
        if (queue.size() < capacity) {
            // Schedule drain time for this request
            long intervalNs = (long) (1_000_000_000L / drainRate);
            long last = queue.isEmpty() ? System.nanoTime() : queue.peekLast();
            queue.addLast(last + intervalNs);
            return true;
        }
        return false;
    }

    private void drain() {
        // TODO: remove front entries whose scheduled time has already passed
    }

    synchronized int queued() {
        drain();
        return queue.size();
    }
}

public class LeakyBucketLimiter {
    private final int capacity;
    private final double drainRate;
    private final ConcurrentHashMap<String, LeakyBucket> buckets = new ConcurrentHashMap<>();

    public LeakyBucketLimiter(int capacity, double drainRate) {
        this.capacity = capacity;
        this.drainRate = drainRate;
    }

    public boolean isAllowed(String clientId) {
        // TODO: computeIfAbsent new bucket, call allow()
        return false;
    }

    public void reset(String clientId) {
        buckets.remove(clientId);
    }
}`,
  },

  {
    id: 'lru_cache',
    icon: '💾',
    title: 'LRU Cache',
    difficulty: 'medium',
    desc: 'Implement an LRU (Least Recently Used) cache with O(1) get and put, optional TTL expiry, and thread safety.',
    scenarios: [
      'Cache has capacity 3; put A, B, C then get A — A is now most-recent, B is LRU',
      'Put a 4th item D — B (LRU) is evicted, not A',
      'Get a key that does not exist — returns None / -1, no side effects',
      'Entry inserted with TTL=2s; accessed after 3s — treated as a cache miss, entry removed',
      'Concurrent put and get from multiple threads — no data corruption',
    ],
    py: `import time
import threading
from typing import Optional, Any
from collections import OrderedDict

class CacheEntry:
    __slots__ = ('value', 'expires_at')

    def __init__(self, value: Any, ttl: Optional[float] = None):
        self.value      = value
        self.expires_at = time.monotonic() + ttl if ttl else None

    def is_expired(self) -> bool:
        return self.expires_at is not None and time.monotonic() > self.expires_at


class LRUCache:
    def __init__(self, capacity: int):
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock   = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        pass  # TODO: check expiry, move to end (most-recent), return value

    def put(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        pass  # TODO: update existing or insert new, evict LRU if over capacity

    def delete(self, key: str) -> bool:
        pass  # TODO: remove key, return True if it existed

    def size(self) -> int:
        return len(self._cache)

    def _evict_expired(self) -> None:
        pass  # TODO: sweep and remove expired entries (call opportunistically)`,
    java: `import java.util.*;
import java.util.concurrent.locks.*;

class CacheEntry<V> {
    final V value; final long expiresAtMs; // 0 = no expiry
    CacheEntry(V v, long ttlMs) {
        this.value       = v;
        this.expiresAtMs = ttlMs > 0 ? System.currentTimeMillis() + ttlMs : 0;
    }
    boolean isExpired() {
        return expiresAtMs > 0 && System.currentTimeMillis() > expiresAtMs;
    }
}

public class LRUCache<K, V> {
    private final int capacity;
    private final LinkedHashMap<K, CacheEntry<V>> cache;
    private final ReadWriteLock lock = new ReentrantReadWriteLock();

    public LRUCache(int capacity) {
        this.capacity = capacity;
        // accessOrder=true makes LinkedHashMap LRU-ordered
        this.cache = new LinkedHashMap<>(capacity, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<K, CacheEntry<V>> eldest) {
                return size() > capacity;
            }
        };
    }

    public Optional<V> get(K key) {
        // TODO: write-lock (get mutates order), check expiry, return value
        return Optional.empty();
    }

    public void put(K key, V value, long ttlMs) {
        // TODO: write-lock, insert/update entry
    }

    public boolean delete(K key) {
        // TODO: write-lock, remove and return whether it existed
        return false;
    }

    public int size() {
        lock.readLock().lock();
        try { return cache.size(); } finally { lock.readLock().unlock(); }
    }
}`,
  },

  {
    id: 'event_emitter',
    icon: '📡',
    title: 'Event Emitter',
    difficulty: 'easy',
    desc: 'Build a publish-subscribe event bus supporting named events, multiple listeners, one-time subscriptions, and wildcard matching.',
    scenarios: [
      'Two listeners registered for "user.login"; event fired — both called',
      'Listener registered with once(); event fires twice — listener called only on first fire',
      'off() called before event fires — listener not invoked',
      'Wildcard listener for "user.*" fires on "user.login" and "user.logout"',
      'Listener throws an error — other listeners for the same event still run',
    ],
    py: `import fnmatch
import threading
from collections import defaultdict
from typing import Callable, Any

class EventEmitter:
    def __init__(self):
        # event_name -> list of (handler, once)
        self._listeners: dict[str, list[tuple[Callable, bool]]] = defaultdict(list)
        self._lock = threading.Lock()

    def on(self, event: str, handler: Callable) -> 'EventEmitter':
        pass  # TODO: register persistent listener; return self for chaining

    def once(self, event: str, handler: Callable) -> 'EventEmitter':
        pass  # TODO: register one-time listener; return self

    def off(self, event: str, handler: Callable) -> 'EventEmitter':
        pass  # TODO: remove all registrations of handler for event; return self

    def emit(self, event: str, *args: Any, **kwargs: Any) -> int:
        """
        Fire all listeners matching event (including wildcards).
        Remove once-listeners after calling.
        Returns the number of listeners called.
        Exceptions in listeners are swallowed so other listeners still run.
        """
        pass  # TODO

    def listener_count(self, event: str) -> int:
        pass  # TODO: count exact-match + wildcard listeners`,
    java: `import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;

public class EventEmitter<T> {
    private record Entry<T>(Consumer<T> handler, boolean once) {}

    private final ConcurrentHashMap<String, CopyOnWriteArrayList<Entry<T>>> listeners
        = new ConcurrentHashMap<>();

    public EventEmitter<T> on(String event, Consumer<T> handler) {
        // TODO: add persistent entry
        return this;
    }

    public EventEmitter<T> once(String event, Consumer<T> handler) {
        // TODO: add once=true entry
        return this;
    }

    public EventEmitter<T> off(String event, Consumer<T> handler) {
        // TODO: remove all matching entries for this handler
        return this;
    }

    public int emit(String event, T payload) {
        // TODO: call all matching listeners (exact + wildcard),
        //       remove once-listeners, swallow exceptions, return count
        return 0;
    }

    private boolean matches(String pattern, String event) {
        // TODO: support "user.*" wildcard matching
        return pattern.equals(event);
    }

    public int listenerCount(String event) {
        // TODO: count exact + wildcard listeners
        return 0;
    }
}`,
  },

  {
    id: 'retry',
    icon: '🔄',
    title: 'Retry with Backoff',
    difficulty: 'easy',
    desc: 'Implement a configurable retry decorator/utility with exponential backoff, jitter, max attempts, and selective exception handling.',
    scenarios: [
      'Operation fails twice then succeeds — returned value from 3rd attempt',
      'All attempts exhausted — last exception re-raised to caller',
      'Non-retryable exception (e.g. ValueError) — raised immediately, no retries',
      'Backoff delay doubles each attempt starting at 100 ms, capped at 30 s',
      'Jitter adds a random ±20% to each delay — delays are never identical',
    ],
    py: `import time
import random
import functools
from typing import Callable, Type, Tuple, Any, Optional

class RetryConfig:
    def __init__(
        self,
        max_attempts:   int   = 3,
        base_delay_s:   float = 0.1,
        max_delay_s:    float = 30.0,
        multiplier:     float = 2.0,
        jitter:         float = 0.2,   # ±20%
        retryable_on:   Tuple[Type[Exception], ...] = (Exception,),
    ):
        self.max_attempts  = max_attempts
        self.base_delay_s  = base_delay_s
        self.max_delay_s   = max_delay_s
        self.multiplier    = multiplier
        self.jitter        = jitter
        self.retryable_on  = retryable_on


def retry(config: Optional[RetryConfig] = None):
    """Decorator factory. Usage: @retry() or @retry(RetryConfig(...))"""
    cfg = config or RetryConfig()

    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            pass  # TODO: attempt loop with backoff + jitter
        return wrapper
    return decorator


def retry_call(fn: Callable, *args, config: Optional[RetryConfig] = None, **kwargs) -> Any:
    """Functional form: retry_call(requests.get, url, config=cfg)"""
    pass  # TODO: reuse the same logic as the decorator`,
    java: `import java.util.concurrent.Callable;
import java.util.function.Predicate;

public class RetryConfig {
    public final int maxAttempts;
    public final long baseDelayMs;
    public final long maxDelayMs;
    public final double multiplier;
    public final double jitter; // fraction ±, e.g. 0.2 = ±20%
    public final Predicate<Exception> retryable;

    private RetryConfig(Builder b) {
        maxAttempts = b.maxAttempts;
        baseDelayMs = b.baseDelayMs;
        maxDelayMs = b.maxDelayMs;
        multiplier = b.multiplier;
        jitter = b.jitter;
        retryable = b.retryable;
    }

    public static class Builder {
        int maxAttempts = 3;
        long baseDelayMs = 100, maxDelayMs = 30_000;
        double multiplier = 2.0, jitter = 0.2;
        Predicate<Exception> retryable = e -> true;

        public Builder maxAttempts(int n) { maxAttempts = n; return this; }
        public Builder baseDelayMs(long ms) { baseDelayMs = ms; return this; }
        public Builder maxDelayMs(long ms) { maxDelayMs = ms; return this; }
        public Builder multiplier(double m) { multiplier = m; return this; }
        public Builder jitter(double j) { jitter = j; return this; }
        public Builder retryableOn(Class<? extends Exception>... types) {
            retryable = e -> { for (var t : types) if (t.isInstance(e)) return true; return false; };
            return this;
        }
        public RetryConfig build() { return new RetryConfig(this); }
    }
}

public class Retry {
    public static <T> T execute(Callable<T> task, RetryConfig cfg) throws Exception {
        // TODO: attempt loop — catch retryable exceptions, sleep with backoff+jitter,
        //       re-throw non-retryable or after max attempts
        return null;
    }

    private static long computeDelay(int attempt, RetryConfig cfg) {
        // TODO: base * multiplier^attempt, add jitter, cap at max
        return 0;
    }
}`,
  },

  {
    id: 'circuit_breaker',
    icon: '⚡',
    title: 'Circuit Breaker',
    difficulty: 'medium',
    desc: 'Implement the circuit-breaker pattern to detect downstream failures, trip open, and allow gradual recovery.',
    scenarios: [
      'Circuit CLOSED; 5 of the last 10 calls fail (50%) — circuit trips to OPEN',
      'Circuit OPEN; new call arrives — immediately rejected with CircuitOpenError',
      'Circuit OPEN; half-open timeout expires — one probe call allowed through',
      'Probe call succeeds — circuit transitions back to CLOSED',
      'Probe call fails — circuit returns to OPEN, resets half-open timer',
    ],
    py: `import time
import threading
from enum import Enum
from typing import Callable, Any, Optional

class CircuitState(Enum):
    CLOSED    = "closed"
    OPEN      = "open"
    HALF_OPEN = "half_open"

class CircuitOpenError(RuntimeError):
    pass

class CircuitBreaker:
    def __init__(
        self,
        failure_threshold:  float = 0.5,   # trip when failure_rate >= this
        min_calls:          int   = 10,     # min window size before tripping
        half_open_timeout:  float = 30.0,   # seconds before probing
        window_size:        int   = 20,     # rolling window of recent calls
    ):
        self.failure_threshold  = failure_threshold
        self.min_calls          = min_calls
        self.half_open_timeout  = half_open_timeout
        self.window_size        = window_size

        self._state             = CircuitState.CLOSED
        self._results: list[bool] = []  # True = success, False = failure
        self._opened_at: Optional[float] = None
        self._lock              = threading.Lock()

    def call(self, fn: Callable, *args: Any, **kwargs: Any) -> Any:
        """
        Execute fn(*args, **kwargs) through the circuit breaker.
        Raises CircuitOpenError if the circuit is OPEN and timeout has not elapsed.
        """
        pass  # TODO: check state, execute, record result, possibly trip/reset

    @property
    def state(self) -> CircuitState:
        pass  # TODO: return current state (re-evaluate OPEN→HALF_OPEN on timeout)

    def _record(self, success: bool) -> None:
        pass  # TODO: append to rolling window, evaluate trip condition

    def _failure_rate(self) -> float:
        pass  # TODO: fraction of False in _results

    def reset(self) -> None:
        pass  # TODO: force back to CLOSED (for testing / manual recovery)`,
    java: `import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.Supplier;

enum CircuitState { CLOSED, OPEN, HALF_OPEN }

class CircuitOpenException extends RuntimeException {
    CircuitOpenException() { super("Circuit is OPEN — call rejected"); }
}

public class CircuitBreaker {
    private final double failureThreshold;
    private final int minCalls;
    private final long halfOpenTimeoutMs;
    private final int windowSize;

    private volatile CircuitState state = CircuitState.CLOSED;
    private volatile long openedAtMs;

    // Rolling window stored as ArrayDeque<Boolean> guarded by lock
    private final Deque<Boolean> window = new ArrayDeque<>();
    private final Object lock = new Object();

    public CircuitBreaker(double failureThreshold, int minCalls,
                          long halfOpenTimeoutMs, int windowSize) {
        this.failureThreshold = failureThreshold;
        this.minCalls = minCalls;
        this.halfOpenTimeoutMs = halfOpenTimeoutMs;
        this.windowSize = windowSize;
    }

    public <T> T call(Supplier<T> action) {
        // TODO: check state(), execute, record result, trip/reset as needed
        return null;
    }

    public CircuitState state() {
        // TODO: if OPEN and timeout elapsed → transition to HALF_OPEN
        return state;
    }

    private void record(boolean success) {
        // TODO: append to rolling window, evaluate failure rate, trip if needed
    }

    private double failureRate() {
        // TODO: compute fraction of failures in window
        return 0;
    }

    public void reset() {
        synchronized (lock) { state = CircuitState.CLOSED; window.clear(); }
    }
}`,
  },

  {
    id: 'task_scheduler',
    icon: '⏰',
    title: 'Task Scheduler',
    difficulty: 'medium',
    desc: 'Build an in-process task scheduler that runs callables after a delay or on a fixed interval, with cancellation support.',
    scenarios: [
      'schedule(fn, delay=2) — fn runs once after 2 seconds',
      'schedule_interval(fn, interval=5) — fn runs every 5 seconds until cancelled',
      'cancel(task_id) called before first run — fn never executes',
      'Scheduled function raises an exception — scheduler continues running other tasks',
      'shutdown() called — running tasks finish, no new tasks start',
    ],
    py: `import time
import threading
import uuid
from typing import Callable, Any, Optional
from dataclasses import dataclass, field

@dataclass
class ScheduledTask:
    task_id:   str
    fn:        Callable
    run_at:    float      # monotonic time
    interval:  Optional[float] = None   # None = one-shot
    cancelled: bool = False

class TaskScheduler:
    def __init__(self, num_workers: int = 4):
        self._tasks:   dict[str, ScheduledTask] = {}
        self._lock     = threading.Lock()
        self._event    = threading.Event()
        self._running  = True
        self._workers  = [
            threading.Thread(target=self._dispatch_loop, daemon=True)
            for _ in range(num_workers)
        ]
        for w in self._workers: w.start()

    def schedule(self, fn: Callable, delay: float = 0, *args, **kwargs) -> str:
        """Schedule fn to run once after 'delay' seconds. Returns task_id."""
        pass  # TODO: create ScheduledTask, store, wake dispatch loop

    def schedule_interval(self, fn: Callable, interval: float, *args, **kwargs) -> str:
        """Schedule fn to run every 'interval' seconds until cancelled."""
        pass  # TODO: like schedule() but with interval set

    def cancel(self, task_id: str) -> bool:
        """Mark task cancelled. Returns True if task existed."""
        pass  # TODO

    def shutdown(self, wait: bool = True) -> None:
        """Stop accepting new tasks. Optionally wait for pending tasks."""
        pass  # TODO: set _running=False, wake workers, join if wait

    def _dispatch_loop(self) -> None:
        """Worker thread: sleep until next task is due, then execute it."""
        pass  # TODO: find earliest due task, sleep, run it, reschedule if interval`,
    java: `import java.util.concurrent.*;
import java.util.*;

public class TaskScheduler {
    private final ScheduledExecutorService executor;
    private final ConcurrentHashMap<String, ScheduledFuture<?>> futures
        = new ConcurrentHashMap<>();

    public TaskScheduler(int numWorkers) {
        executor = Executors.newScheduledThreadPool(numWorkers);
    }

    public String schedule(Runnable task, long delayMs) {
        // TODO: schedule one-shot task, store future, return generated id
        return null;
    }

    public String scheduleInterval(Runnable task, long initialDelayMs, long intervalMs) {
        // TODO: scheduleAtFixedRate, store future, return id
        // Wrap task to catch + log exceptions so the scheduler doesn't stop
        return null;
    }

    public boolean cancel(String taskId) {
        // TODO: look up and cancel future, return whether it existed + was cancelled
        return false;
    }

    public void shutdown(boolean waitForPending) throws InterruptedException {
        // TODO: executor.shutdown(); if waitForPending, awaitTermination
    }

    private String newId() { return UUID.randomUUID().toString(); }
}`,
  },

  {
    id: 'connection_pool',
    icon: '🔌',
    title: 'Connection Pool',
    difficulty: 'hard',
    desc: 'Implement a generic connection pool that manages reusable connections with health checks, max-size limits, and idle timeout eviction.',
    scenarios: [
      'Pool size 5; 5 concurrent borrows succeed; 6th caller blocks until one is returned',
      'Connection returned to pool — immediately lent to the waiting caller',
      'Connection sits idle for 60 s — evicted by background sweeper',
      'Health-check detects a broken connection — it is discarded, a fresh one created',
      'Pool is shut down while a caller is waiting — caller receives an error',
    ],
    py: `import time
import threading
from typing import Generic, TypeVar, Callable, Optional
from contextlib import contextmanager

T = TypeVar('T')

class PoolExhaustedError(RuntimeError):
    pass

class PoolClosedError(RuntimeError):
    pass

class PooledConnection(Generic[T]):
    def __init__(self, conn: T):
        self.conn       = conn
        self.last_used  = time.monotonic()
        self.healthy    = True

class ConnectionPool(Generic[T]):
    def __init__(
        self,
        factory:       Callable[[], T],
        max_size:      int   = 10,
        idle_timeout:  float = 60.0,
        health_check:  Optional[Callable[[T], bool]] = None,
        acquire_timeout: float = 5.0,
    ):
        self._factory         = factory
        self.max_size         = max_size
        self.idle_timeout     = idle_timeout
        self._health_check    = health_check
        self.acquire_timeout  = acquire_timeout

        self._pool:  list[PooledConnection[T]] = []
        self._in_use: set[int] = set()   # id(PooledConnection)
        self._lock   = threading.Lock()
        self._not_empty = threading.Condition(self._lock)
        self._closed = False

        self._evict_thread = threading.Thread(target=self._evict_loop, daemon=True)
        self._evict_thread.start()

    @contextmanager
    def acquire(self):
        """Context manager: with pool.acquire() as conn: ..."""
        pc = self._borrow()
        try:
            yield pc.conn
        except Exception:
            pc.healthy = False
            raise
        finally:
            self._return(pc)

    def _borrow(self) -> PooledConnection[T]:
        pass  # TODO: wait for available connection, health-check, create if needed

    def _return(self, pc: PooledConnection[T]) -> None:
        pass  # TODO: mark available or discard if unhealthy/closed

    def close(self) -> None:
        pass  # TODO: set _closed, wake waiting threads, destroy connections

    def _evict_loop(self) -> None:
        pass  # TODO: periodically remove idle connections

    @property
    def stats(self) -> dict:
        with self._lock:
            return {'total': len(self._pool), 'in_use': len(self._in_use)}`,
    java: `import java.util.*;
import java.util.concurrent.*;
import java.util.function.*;

public class ConnectionPool<T extends AutoCloseable> {
    private final Supplier<T> factory;
    private final Predicate<T> healthCheck;
    private final int maxSize;
    private final long idleTimeoutMs;
    private final long acquireTimeoutMs;

    private final Deque<PoolEntry<T>> pool = new ArrayDeque<>();
    private int active = 0;
    private boolean closed = false;
    private final Object lock = new Object();

    private final ScheduledExecutorService evictor
        = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "pool-evictor"); t.setDaemon(true); return t;
          });

    public ConnectionPool(Supplier<T> factory, int maxSize,
                          long idleTimeoutMs, long acquireTimeoutMs,
                          Predicate<T> healthCheck) {
        this.factory = factory;
        this.maxSize = maxSize;
        this.idleTimeoutMs = idleTimeoutMs;
        this.acquireTimeoutMs = acquireTimeoutMs;
        this.healthCheck = healthCheck != null ? healthCheck : c -> true;
        evictor.scheduleAtFixedRate(this::evictIdle, idleTimeoutMs, idleTimeoutMs,
                                    TimeUnit.MILLISECONDS);
    }

    public T borrow() throws Exception {
        // TODO: wait up to acquireTimeoutMs, health-check, create if pool empty + active < maxSize
        return null;
    }

    public void returnConnection(T conn, boolean healthy) {
        // TODO: if healthy + not closed, return to pool; else close conn
    }

    public void close() throws Exception {
        // TODO: set closed, notify waiting threads, close all pooled connections
    }

    private void evictIdle() {
        // TODO: remove entries idle longer than idleTimeoutMs
    }

    private static class PoolEntry<T> {
        final T conn; final long lastUsedMs;
        PoolEntry(T conn) { this.conn = conn; lastUsedMs = System.currentTimeMillis(); }
    }
}`,
  },

  {
    id: 'feature_flags',
    icon: '🚩',
    title: 'Feature Flag System',
    difficulty: 'medium',
    desc: 'Build a feature flag service supporting boolean toggles, percentage rollouts, user allowlists, and change listeners.',
    scenarios: [
      'Flag "dark_mode" is globally ON — is_enabled("dark_mode", user) returns True for everyone',
      'Flag "new_checkout" rolled out to 20% — roughly 1/5 user IDs get True, deterministically',
      'User "alice" is in the allowlist for "beta_api" — gets True even though rollout is 0%',
      'Flag updated from 20% to 100% rollout — change listener fires with old + new config',
      'Unknown flag queried — returns the provided default value without throwing',
    ],
    py: `import hashlib
import threading
from dataclasses import dataclass, field
from typing import Callable, Any, Optional

@dataclass
class FlagConfig:
    name:        str
    enabled:     bool       = False
    rollout_pct: float      = 0.0           # 0.0 – 100.0
    allowlist:   set[str]   = field(default_factory=set)
    # add more targeting fields as needed

ChangeListener = Callable[[str, FlagConfig, FlagConfig], None]  # (name, old, new)

class FeatureFlagService:
    def __init__(self):
        self._flags:     dict[str, FlagConfig] = {}
        self._listeners: list[ChangeListener]  = []
        self._lock       = threading.RWLock() if hasattr(threading, 'RWLock') else threading.Lock()

    def set_flag(self, config: FlagConfig) -> None:
        pass  # TODO: store config, fire change listeners if flag existed before

    def is_enabled(self, flag_name: str, user_id: Optional[str] = None,
                   default: bool = False) -> bool:
        """
        Returns True if:
          - flag.enabled is True AND (rollout_pct==100 OR user in allowlist OR hash-based bucket)
        Returns 'default' if flag_name is unknown.
        """
        pass  # TODO

    def get_config(self, flag_name: str) -> Optional[FlagConfig]:
        pass  # TODO

    def add_change_listener(self, listener: ChangeListener) -> None:
        pass  # TODO

    def _in_rollout(self, flag: FlagConfig, user_id: str) -> bool:
        """Stable bucket via hash so the same user always gets the same result."""
        h = int(hashlib.md5(f"{flag.name}:{user_id}".encode()).hexdigest(), 16)
        return (h % 100) < flag.rollout_pct`,
    java: `import java.util.*;
import java.util.concurrent.*;
import java.util.function.*;

public class FeatureFlagService {
    public record FlagConfig(
        String      name,
        boolean     enabled,
        double      rolloutPct,   // 0–100
        Set<String> allowlist
    ) {
        public FlagConfig { allowlist = Set.copyOf(allowlist); }
    }

    @FunctionalInterface
    public interface ChangeListener {
        void onChange(String name, FlagConfig oldCfg, FlagConfig newCfg);
    }

    private final ConcurrentHashMap<String, FlagConfig> flags = new ConcurrentHashMap<>();
    private final CopyOnWriteArrayList<ChangeListener> listeners = new CopyOnWriteArrayList<>();

    public void setFlag(FlagConfig config) {
        FlagConfig old = flags.put(config.name(), config);
        if (old != null && !old.equals(config)) {
            listeners.forEach(l -> l.onChange(config.name(), old, config));
        }
    }

    public boolean isEnabled(String flagName, String userId, boolean defaultValue) {
        FlagConfig cfg = flags.get(flagName);
        if (cfg == null) return defaultValue;
        if (!cfg.enabled()) return false;
        if (cfg.rolloutPct() >= 100.0) return true;
        if (userId != null && cfg.allowlist().contains(userId)) return true;
        if (userId != null) return inRollout(cfg, userId);
        return false;
    }

    public Optional<FlagConfig> getConfig(String flagName) {
        return Optional.ofNullable(flags.get(flagName));
    }

    public void addChangeListener(ChangeListener listener) {
        listeners.add(listener);
    }

    private boolean inRollout(FlagConfig cfg, String userId) {
        // TODO: stable hash-based bucket — same user always maps to same result
        return false;
    }
}`,
  },

  {
    id: 'observer',
    icon: '👁️',
    title: 'Observable / Reactive Stream',
    difficulty: 'hard',
    desc: 'Implement a minimal reactive stream (Observable + Observer) with map, filter, and take operators, similar to RxJS/RxJava.',
    scenarios: [
      'observable.subscribe(observer) — observer.next() called for each emitted value',
      '.map(fn) transforms each value before delivery to subscriber',
      '.filter(pred) drops values that do not satisfy the predicate',
      '.take(n) completes the stream after n values; later emits are ignored',
      'Observable raises an error — observer.error() called once, stream terminates',
    ],
    py: `from typing import TypeVar, Generic, Callable, Optional
from abc import ABC, abstractmethod

T = TypeVar('T')
R = TypeVar('R')

class Observer(Generic[T]):
    def __init__(self, on_next=None, on_error=None, on_complete=None):
        self._next     = on_next     or (lambda v: None)
        self._error    = on_error    or (lambda e: None)
        self._complete = on_complete or (lambda: None)

    def next(self, value: T) -> None:       self._next(value)
    def error(self, err: Exception) -> None: self._error(err)
    def complete(self) -> None:              self._complete()

class Subscription:
    def __init__(self, unsubscribe_fn: Callable):
        self._unsub = unsubscribe_fn
        self.closed = False

    def unsubscribe(self) -> None:
        if not self.closed:
            self.closed = True
            self._unsub()

class Observable(Generic[T]):
    def __init__(self, subscribe_fn: Callable):
        self._subscribe = subscribe_fn

    def subscribe(self, observer: Observer[T]) -> Subscription:
        pass  # TODO: call _subscribe(observer), return Subscription

    def map(self, fn: Callable[[T], R]) -> 'Observable[R]':
        pass  # TODO: return new Observable that transforms each value

    def filter(self, pred: Callable[[T], bool]) -> 'Observable[T]':
        pass  # TODO: return new Observable that only forwards matching values

    def take(self, n: int) -> 'Observable[T]':
        pass  # TODO: complete after n values, ignore rest

    @staticmethod
    def of(*values: T) -> 'Observable[T]':
        """Create an Observable that emits the given values then completes."""
        def subscribe(observer: Observer):
            for v in values:
                observer.next(v)
            observer.complete()
        return Observable(subscribe)

    @staticmethod
    def from_iterable(it) -> 'Observable[T]':
        pass  # TODO`,
    java: `import java.util.function.*;
import java.util.concurrent.atomic.*;

public class Observable<T> {
    @FunctionalInterface
    public interface SubscribeFn<T> { void subscribe(Observer<T> observer); }

    public interface Observer<T> {
        void onNext(T value);
        void onError(Throwable err);
        void onComplete();
    }

    public record Subscription(Runnable unsubscribe) {}

    private final SubscribeFn<T> subscribeFn;
    public Observable(SubscribeFn<T> fn) { this.subscribeFn = fn; }

    public Subscription subscribe(Observer<T> observer) {
        // TODO: wrap observer to guard against post-complete emissions,
        //       call subscribeFn, return Subscription
        return new Subscription(() -> {});
    }

    public <R> Observable<R> map(Function<T, R> fn) {
        // TODO: return new Observable that maps each value
        return new Observable<>(obs -> {});
    }

    public Observable<T> filter(Predicate<T> pred) {
        // TODO: return new Observable that only forwards matching values
        return new Observable<>(obs -> {});
    }

    public Observable<T> take(int n) {
        // TODO: complete after n values, ignore subsequent emissions
        return new Observable<>(obs -> {});
    }

    @SafeVarargs
    public static <T> Observable<T> of(T... values) {
        return new Observable<>(obs -> {
            for (T v : values) obs.onNext(v);
            obs.onComplete();
        });
    }
}`,
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getQ(id) { return QUESTIONS.find(q => q.id === id) }

function _skeleton(q) { return _lang === 'python' ? q.py : q.java }

function _currentCode(q) {
  const key = `${q.id}:${_lang}`
  return _code[key] !== undefined ? _code[key] : _skeleton(q)
}

function _saveCurrentCode() {
  if (!_currentQ) return
  const ta = document.getElementById('prodCode')
  if (ta) _code[`${_currentQ}:${_lang}`] = ta.value
}

// ── Renders ───────────────────────────────────────────────────────────────────

export function renderProdCode() {
  _currentQ = null
  document.getElementById('mainContent').innerHTML = `
    <div class="ood-wrap">
      <div class="ood-list-hd">
        <h2>🖥️ ${t('Production Code 设计', 'Production Code Design')}</h2>
        <p>${t('真实工程场景练习 · 超越 LeetCode 的生产级代码设计题', 'Real engineering scenarios · Production-grade design beyond LeetCode')}</p>
      </div>
      <div class="ood-q-list">
        ${QUESTIONS.map(q => `
          <div class="ood-q-card" onclick="openProdCodeQ('${q.id}')">
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

export function openProdCodeQ(id) {
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
        <button class="btn-sec ood-back-btn" onclick="prodCodeBackToList()">← ${t('返回', 'Back')}</button>
        <span class="ood-q-hd-icon">${q.icon}</span>
        <h2>${esc(q.title)}</h2>
        <span class="ood-diff-badge ${q.difficulty}">${q.difficulty[0].toUpperCase() + q.difficulty.slice(1)}</span>
        <div class="ood-lang-tabs">
          <button class="ood-lang-tab${_lang === 'python' ? ' active' : ''}" onclick="prodCodeSwitchLang('python')">Python</button>
          <button class="ood-lang-tab${_lang === 'java'   ? ' active' : ''}" onclick="prodCodeSwitchLang('java')">Java</button>
        </div>
      </div>
      <div class="ood-editor-layout">
        <div class="ood-pane-code" id="oodPaneCode">
          <div class="ood-code-hd">
            <span class="ood-code-file">${q.id}.${ext}</span>
            <span class="ood-code-hint">Tab = 4 spaces &nbsp;·&nbsp; Ctrl+Enter = Analyze</span>
          </div>
          <textarea class="ood-textarea" id="prodCode"
            spellcheck="false" autocorrect="off" autocomplete="off"
            oninput="prodCodeInput()"
            placeholder="${t('在此编写生产级代码实现…', 'Write your production code implementation here…')}">${esc(code)}</textarea>
        </div>
        <div class="ood-divider" id="oodDivider"></div>
        <div class="ood-pane-side" id="oodPaneSide">
          <div class="ood-scenarios-box">
            <div class="ood-scenarios-hd">📋 ${t('测试场景', 'Test Scenarios')}</div>
            <ol class="ood-scenario-list">
              ${q.scenarios.map(s => `<li>${esc(s)}</li>`).join('')}
            </ol>
          </div>
          <button class="btn-primary ood-analyze-btn" id="prodCodeAnalyzeBtn" onclick="prodCodeAnalyze()">
            🔍 ${t('分析我的实现', 'Analyze My Implementation')}
          </button>
          <div id="prodCodeAnalysis" class="ood-analysis">
            ${analysis
              ? md2h(analysis)
              : `<div class="ood-analysis-empty">${t('点击「分析」获取 AI 代码评审', 'Click "Analyze" for AI code review')}</div>`}
          </div>
        </div>
      </div>
    </div>`

  initPaneDrag()

  const ta = document.getElementById('prodCode')
  if (ta) {
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault()
        const s = ta.selectionStart, end = ta.selectionEnd
        ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(end)
        ta.selectionStart = ta.selectionEnd = s + 4
        prodCodeInput()
      } else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault()
        window.prodCodeAnalyze()
      }
    })
  }
}

// ── User actions ──────────────────────────────────────────────────────────────

export function prodCodeBackToList() {
  _saveCurrentCode()
  renderProdCode()
}

export function prodCodeSwitchLang(lang) {
  _saveCurrentCode()
  _lang = lang
  _renderQuestion()
}

export function prodCodeInput() {
  if (!_currentQ) return
  const ta = document.getElementById('prodCode')
  if (ta) _code[`${_currentQ}:${_lang}`] = ta.value
}

export async function prodCodeAnalyze() {
  if (!_currentQ || _streaming) return
  const q = _getQ(_currentQ)
  if (!q) return

  const ta   = document.getElementById('prodCode')
  const code = ta?.value?.trim()
  if (!code) { alert(t('请先写一些代码再分析', 'Write some code before analyzing')); return }

  _streaming = true
  const btn = document.getElementById('prodCodeAnalyzeBtn')
  if (btn) { btn.disabled = true; btn.textContent = `⟳ ${t('分析中…', 'Analyzing…')}` }

  const analysisDiv = document.getElementById('prodCodeAnalysis')
  if (analysisDiv) {
    analysisDiv.innerHTML = `<div class="ood-analysis-loading">
      ⟳ ${t('AI 正在评审你的实现…', 'AI is reviewing your implementation…')}</div>`
  }

  const langLabel = _lang === 'python' ? 'Python' : 'Java'
  const replyLang = state.lang === 'en' ? 'English' : '中文'
  const system = `You are a senior staff engineer conducting a production code design interview. \
Review the candidate's ${langLabel} implementation for real-world production readiness. \
Be specific, constructive, and actionable. Use Markdown. \
Reply in ${replyLang}.`

  const userMsg = `## Problem: ${q.title}
${q.desc}

## Test Scenarios
${q.scenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Candidate's ${langLabel} Implementation
\`\`\`${_lang}
${code}
\`\`\`

Evaluate on these production-engineering dimensions (use ### headers):

### 1. Correctness & Logic
Does the implementation correctly handle all test scenarios? Trace through edge cases.

### 2. Thread Safety & Concurrency
Are shared state and critical sections properly guarded? Any race conditions or deadlock risks?

### 3. Error Handling & Resilience
How are failures surfaced? Are exceptions appropriate? Does the component degrade gracefully?

### 4. Performance & Efficiency
Time/space complexity of hot paths. Any unnecessary allocations, locks held too long, or O(n) where O(1) is possible?

### 5. API Design & Usability
Is the public interface clean? Are method names, parameters, and return types intuitive?

### 6. Testability & Production Readiness
Is the code easy to unit-test? Any missing observability (metrics, logging)? Would this pass a code review at a top-tier company?

Reference specific class/method names from the code in your feedback.`

  try {
    const result = await claudeStream(system, userMsg, 3000, (accumulated) => {
      const div = document.getElementById('prodCodeAnalysis')
      if (div) div.innerHTML = md2h(accumulated)
    })
    _analysis[_currentQ] = result
    const div = document.getElementById('prodCodeAnalysis')
    if (div) div.innerHTML = md2h(result)
  } catch (err) {
    const div = document.getElementById('prodCodeAnalysis')
    if (div) div.innerHTML = `<div class="ood-analysis-error">
      ${t('分析失败：', 'Analysis failed: ')}${esc(err?.message || String(err))}</div>`
  } finally {
    _streaming = false
    const btn = document.getElementById('prodCodeAnalyzeBtn')
    if (btn) { btn.disabled = false; btn.textContent = `🔍 ${t('重新分析', 'Re-analyze')}` }
  }
}
