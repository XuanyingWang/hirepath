// Golden eval set for the Knowledge Base RAG pipeline (src/rag.js + the chapter
// Q&A flow in src/knowledge.js `_doChQuestion`). Multiple unrelated chapters are
// indexed together so retrieval precision is actually exercised against decoys,
// not just "does it find the one document that exists."

export const CORPUS = [
  {
    id: 'raft',
    chapterName: 'Raft Consensus',
    content: `Raft is a consensus algorithm designed to be understandable. Each node is a
follower, candidate, or leader. Followers start a randomized election timeout
(150-300ms); if no heartbeat arrives before it fires, the follower becomes a
candidate, increments its term number, and requests votes from peers. A
candidate becomes leader once it wins a majority of votes for that term. The
randomized timeout prevents split votes by making it unlikely two nodes start
an election simultaneously. Once elected, the leader sends periodic heartbeats
to reset followers' timeouts and replicates log entries; an entry is
committed once it is stored on a majority of nodes.`,
  },
  {
    id: 'rate-limiting',
    chapterName: 'Rate Limiting',
    content: `Token bucket is a common rate-limiting algorithm: a bucket holds up to N
tokens, refills at a fixed rate, and each request consumes one token; requests
are rejected when the bucket is empty. This allows short bursts up to the
bucket size while enforcing a long-run average rate. Sliding window log and
sliding window counter are alternatives that trade memory for smoother
enforcement at window boundaries. Distributed rate limiters typically back
the counter with Redis using an atomic INCR + EXPIRE or a Lua script to avoid
race conditions across multiple app servers.`,
  },
  {
    id: 'consistent-hashing',
    chapterName: 'Consistent Hashing',
    content: `Consistent hashing maps both servers and keys onto a hash ring so that when a
server is added or removed, only the keys adjacent to that server on the ring
need to move — roughly K/N keys on average, instead of a full remap. Virtual
nodes (multiple points per physical server on the ring) improve load balance
by smoothing out uneven key distribution. It's used in distributed caches
(Memcached clients), DynamoDB's partitioning, and CDN request routing.`,
  },
  {
    id: 'cap-theorem',
    chapterName: 'CAP Theorem',
    content: `CAP theorem states a distributed data store can provide at most two of:
Consistency (every read gets the latest write or an error), Availability
(every request gets a non-error response), and Partition tolerance (the
system continues operating despite network partitions). Since network
partitions are unavoidable in practice, real systems choose between CP
(reject requests during a partition to preserve consistency, e.g. HBase,
etcd) and AP (serve possibly-stale data during a partition, e.g. Cassandra,
DynamoDB in eventual-consistency mode).`,
  },
  {
    id: 'load-balancing',
    chapterName: 'Load Balancing',
    content: `Load balancers distribute incoming requests across a pool of backend servers.
Round robin cycles through servers evenly regardless of load; least-connections
routes to whichever server currently has the fewest active requests, which
handles uneven request durations better. Layer 4 load balancers route on
IP/port without inspecting content, offering low latency; Layer 7 balancers
read HTTP headers/paths to make routing decisions, enabling features like
path-based routing and sticky sessions via cookies. Health checks periodically
probe backends and remove unhealthy ones from rotation.`,
  },
  {
    id: 'caching-strategies',
    chapterName: 'Caching Strategies',
    content: `Cache-aside (lazy loading) has the application check the cache first, and on a
miss, read from the database and populate the cache; it's simple but the first
request after eviction is always slow. Write-through writes to the cache and
database synchronously on every write, keeping the cache always consistent at
the cost of write latency. Write-back writes to the cache immediately and
flushes to the database asynchronously, which is fast but risks data loss if
the cache node crashes before the flush. Cache invalidation on write (rather
than relying purely on TTL expiry) prevents serving stale data after updates.`,
  },
  {
    id: 'message-queues',
    chapterName: 'Message Queues',
    content: `Message queues decouple producers from consumers, letting each scale
independently and absorbing traffic spikes so consumers aren't overwhelmed.
At-least-once delivery (the common default) means a consumer might receive
the same message twice if it crashes after processing but before
acknowledging, so consumers must be idempotent. Exactly-once delivery is
achievable but expensive, usually implemented via deduplication IDs plus
transactional writes. Dead-letter queues capture messages that repeatedly
fail processing so they don't block the main queue indefinitely.`,
  },
]

export const TEST_CASES = [
  {
    id: 'raft-election-timeout',
    question: 'Why does Raft use a randomized election timeout instead of a fixed one?',
    expectedChapterId: 'raft',
    notes: 'Should mention preventing split votes / simultaneous elections.',
  },
  {
    id: 'raft-commit',
    question: 'When is a log entry considered committed in Raft?',
    expectedChapterId: 'raft',
    notes: 'Should mention majority replication.',
  },
  {
    id: 'rate-limit-burst',
    question: 'How does the token bucket algorithm allow short bursts of traffic while still enforcing a long-run rate limit?',
    expectedChapterId: 'rate-limiting',
    notes: 'Should mention bucket size vs refill rate.',
  },
  {
    id: 'rate-limit-distributed',
    question: 'How do you avoid race conditions when implementing a rate limiter shared across multiple app servers?',
    expectedChapterId: 'rate-limiting',
    notes: 'Should mention Redis atomic INCR/EXPIRE or Lua script.',
  },
  {
    id: 'consistent-hashing-rebalance',
    question: 'Why is consistent hashing preferred over simple modulo hashing when servers are added or removed?',
    expectedChapterId: 'consistent-hashing',
    notes: 'Should mention only K/N keys move instead of a full remap.',
  },
  {
    id: 'cap-tradeoff',
    question: 'During a network partition, what is the practical tradeoff between a CP system and an AP system?',
    expectedChapterId: 'cap-theorem',
    notes: 'Should mention CP rejects requests / AP serves stale data.',
  },
  {
    id: 'load-balancing-algorithm-choice',
    question: 'Why might least-connections be a better load balancing algorithm than round robin for some workloads?',
    expectedChapterId: 'load-balancing',
    notes: 'Should mention uneven request durations / active request count.',
  },
  {
    id: 'caching-write-strategy',
    question: 'What is the tradeoff between write-through and write-back caching?',
    expectedChapterId: 'caching-strategies',
    notes: 'Should mention write latency vs risk of data loss on crash.',
  },
  {
    id: 'message-queue-idempotency',
    question: 'Why do consumers of a message queue need to be idempotent?',
    expectedChapterId: 'message-queues',
    notes: 'Should mention at-least-once delivery causing possible duplicate messages.',
  },
]
