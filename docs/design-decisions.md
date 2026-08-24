# Atlas Design Decisions

This document details the major engineering decisions, rationale, and trade-offs made during the design and implementation of the Atlas job queue system.

## 1. PostgreSQL as Authoritative State
- **Problem**: Storing job data, status, and retry policies entirely in Redis (as standard BullMQ does) makes relational querying, strict multi-tenancy, and complex aggregations (metrics) very difficult. Redis persistence is also less robust than PostgreSQL.
- **Decision**: PostgreSQL stores all job state, payloads, execution logs, and concurrency limits.
- **Rationale**: SQL databases provide ACID guarantees, easy foreign-key enforcement for multi-tenancy (Organizations -> Projects -> Queues -> Jobs), and powerful querying capabilities for dashboards and metric generation.
- **Trade-offs**: Slightly higher latency on job transitions compared to pure in-memory Redis. Requires maintaining sync between PG and Redis.

## 2. BullMQ as Execution Transport Only
- **Problem**: PostgreSQL polling for new jobs creates heavy database load and latency.
- **Decision**: BullMQ is used purely as an execution transport layer. The payload sent to Redis is simply `{ jobId: string }`.
- **Rationale**: Redis provides instant pub/sub delivery of jobs to workers.
- **Trade-offs**: The system requires two infrastructure components (PG and Redis). We must handle edge cases where the two systems desync.

## 3. One BullMQ Queue per Atlas Queue
- **Problem**: How to route jobs to different pools of workers with different concurrency limits.
- **Decision**: For every Atlas Queue created in PostgreSQL (e.g., ID `abc`), a corresponding BullMQ queue named `atlas_abc` is utilized.
- **Rationale**: Provides strict isolation. A paused queue in PG can simply halt its corresponding BullMQ workers.
- **Trade-offs**: Workers must dynamically listen to multiple queues, which required building the `BullMQManager` to prevent massive connection pooling overhead.

## 4. PostgreSQL Pessimistic Locking (`SKIP LOCKED`)
- **Problem**: Multiple workers receiving the same `jobId` from BullMQ could attempt to claim the job simultaneously, causing duplicate execution.
- **Decision**: Job claiming is done via `SELECT ... FOR UPDATE SKIP LOCKED` inside an `UPDATE` statement.
- **Rationale**: The database guarantees that only one worker can successfully lock and transition a job from `QUEUED` to `CLAIMED` or `RUNNING`.
- **Trade-offs**: Relies on DB row locks, which can become a bottleneck under extreme write contention, though `SKIP LOCKED` mitigates deadlocks.

## 5. PostgreSQL Queue Concurrency Authority
- **Problem**: BullMQ enforces concurrency per Node.js process, making distributed queue-level concurrency limits hard to enforce across 10 different worker containers.
- **Decision**: Concurrency limits are enforced purely by PostgreSQL during the claim query (`WHERE (SELECT count(*) FROM jobs WHERE status = 'RUNNING') < queues.concurrency_limit`).
- **Rationale**: Guarantees strict global concurrency across any number of worker containers. BullMQ concurrency is simply set to `1` per queue to feed the workers.
- **Trade-offs**: High-throughput queues might experience slight claim contention, but limits are strictly respected.

## 6. Central State-Machine Enforcement
- **Problem**: Ad-hoc `UPDATE` queries scattered across the codebase lead to TOCTOU (Time-of-Check to Time-of-Use) vulnerabilities and invalid state transitions (e.g., cancelling an already running job).
- **Decision**: All state changes route through `transitionJobStatusConditional()` using an explicit matrix of allowed transitions.
- **Rationale**: Security and resilience. The `WHERE status = $old_status` clause guarantees atomicity.
- **Trade-offs**: Adds slightly more boilerplate to simple operations, but eliminates race conditions.

## 7. Reconciliation Instead of Distributed Transactions
- **Problem**: When creating a job, the API inserts into Postgres and enqueues to Redis. If the process crashes between these two steps, the job is stuck in PG as `QUEUED` but never delivered.
- **Decision**: Implemented a background `reconcile` loop that finds stale `QUEUED` jobs in PG and re-enqueues them to Redis.
- **Rationale**: Distributed 2PC (Two-Phase Commit) is complex and slow. Eventual consistency via reconciliation is robust and performant.
- **Trade-offs**: A rare crash could delay a job's execution by up to 60 seconds (the reconciliation window).

## 8. Retry Strategy and Dead Letter Queue (DLQ)
- **Problem**: Jobs fail. We need a way to retry them, and eventually isolate poison pills.
- **Decision**: The worker marks failed jobs as `FAILED` (if attempts remain) or moves them to `dlq_entries` (if exhausted). The scheduler handles `FAILED -> SCHEDULED` backoff math.
- **Rationale**: Moving retry math to the scheduler keeps the worker fast and focused purely on execution. The DLQ table prevents the main `jobs` table from bloat.
- **Trade-offs**: DLQ jobs must be re-inserted into the `jobs` table upon replay, changing their job ID.

## 9. Worker Heartbeats and Stale Recovery
- **Problem**: If a worker container OOMs or is `kill -9`'d while a job is `RUNNING`, the job is locked forever.
- **Decision**: Workers emit a heartbeat every 15s to `worker_heartbeats`. The scheduler detects heartbeats older than 30s, marks the worker unhealthy, and transitions their jobs from `CLAIMED`/`RUNNING` back to `QUEUED`.
- **Rationale**: Provides autonomous self-healing for catastrophic infrastructure failures.
- **Trade-offs**: Handler execution becomes **at-least-once**. The system may execute the same job twice if a worker hangs for 40s (losing its heartbeat), the scheduler re-queues the job, and then the original worker unfreezes and completes the job.

## 10. Job Execution Records
- **Problem**: We need to track exactly how long each attempt took, the error message per attempt, and the worker that ran it.
- **Decision**: Created a `job_executions` table with a 1-to-many relationship to `jobs`.
- **Rationale**: Keeps the main `jobs` table clean while providing rich audit trails for the UI.
- **Trade-offs**: Extra database writes on job start, completion, and failure.

## 11. Graceful Shutdown
- **Problem**: Terminating the process abruptly corrupts state and drops connections.
- **Decision**: Implemented SIGTERM/SIGINT traps in API, Scheduler, and Worker. They wait for active promises to resolve, close BullMQ queues, close Redis, and finally close the PG pool.
- **Rationale**: Prevents data corruption during normal deployments and scale-down events.

## 12. LISTEN/NOTIFY for Immediate Execution
- **Problem**: Scheduled jobs evaluate every 10 seconds. We don't want to wait 10 seconds for a user-created queue to be picked up by the worker.
- **Decision**: Implemented PostgreSQL `LISTEN/NOTIFY`. The API emits a notify when a queue is created or unpaused; the scheduler breaks its sleep loop immediately to sync.
- **Rationale**: Combines the efficiency of long-polling with the low-latency of push events.

## 13. Docker Migration Service
- **Problem**: Running `prisma migrate deploy` inside the API container causes race conditions if the Scheduler or Worker starts faster and queries the DB.
- **Decision**: Created an `atlas-migrate` init container in `docker-compose.yml`. All other services have a `depends_on: atlas-migrate (service_completed_successfully)`.
- **Rationale**: Guarantees the schema is ready before any application code executes.

## 14. Observability Strategy
- **Problem**: Providing metrics (throughput, success rates) is computationally expensive if done via ad-hoc queries on massive tables.
- **Decision**: Leveraged SQL aggregations (`COUNT() FILTER()`) on the `jobs` and `job_executions` tables, bounded by timestamp windows (1h, 24h, 7d).
- **Rationale**: Keeps architecture simple without requiring external TSDBs (Time Series Databases) like Prometheus for MVP metrics.

## 15. Execution Guarantee Trade-off (At-Least-Once Handlers)
- **Problem**: Achieving mathematical "exactly-once" execution globally.
- **Decision**: Abandoned global exactly-once in favor of **exactly-once PostgreSQL state transition** and **at-least-once handler invocation**.
- **Rationale**: The network is unreliable. A worker can finish an API call (handler success) but crash before sending the `COMPLETED` TCP packet to PostgreSQL. The job must be re-run to ensure completion. Users must write idempotent handlers.
- **Trade-offs**: Forces complexity onto the user (idempotency), but ensures no data is ever lost.
