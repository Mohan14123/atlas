# Atlas Architecture Overview

Atlas is a hybrid job queue system designed for reliability and observability, combining the persistent transactional guarantees of PostgreSQL with the low-latency execution transport of Redis/BullMQ.

## Core Design Principles

### 1. PostgreSQL is Authoritative
All state transitions, concurrency limits, metadata, payloads, and retry logic live in PostgreSQL. BullMQ acts **only as an execution transport layer**.
- The BullMQ payload contains only `{ jobId: string }`.
- Workers use `FOR UPDATE SKIP LOCKED` to atomically claim jobs in PostgreSQL.
- State transitions are strictly enforced by a central state machine matrix.

### 2. Execution Guarantees
- **Exactly-once State Transition**: A job transitions from `QUEUED` to `RUNNING` exactly once per attempt, enforced by the PG row lock and `status` WHERE clause.
- **At-least-once Handler Invocation**: If a worker crashes after successfully executing a job handler but before committing the `COMPLETED` state to PostgreSQL, the job will be detected as an orphan, transitioned back to `QUEUED`, and executed again. Handlers **must** be idempotent.

### 3. Failure Recovery
- **Stale Worker Recovery**: Workers emit heartbeats. The scheduler detects workers with stale heartbeats, marks them as unhealthy, and transitions their `CLAIMED` or `RUNNING` jobs back to `QUEUED`.
- **Reconciliation**: If a job is marked `QUEUED` in PostgreSQL but fails to enqueue to BullMQ (e.g., scheduler crash, Redis network failure), the reconciliation loop detects the drift and idempotently re-enqueues it.

## Components

### API (`/server/src/api`)
Responsible for:
- Authentication & Authorization
- Enqueuing immediate, delayed, and batch jobs
- Queue, Schedule, and DLQ management
- Querying job executions and logs

### Scheduler (`/server/src/scheduler`)
A periodic background loop responsible for:
- Evaluating schedules (`createDueJobs`)
- Promoting delayed jobs (`promoteDelayedJobs`)
- Retrying eligible failed jobs with backoff (`retryFailedJobs`)
- Stale worker detection & orphan recovery (`detectStaleWorkers`, `recoverOrphanedJobs`)
- PG→BullMQ reconciliation (`reconcile`)

### Workers (`/server/src/worker`)
Responsible for:
- Dynamically managing BullMQ consumers per active queue (`BullMQManager`)
- Claiming jobs in PostgreSQL
- Transitioning jobs through `CLAIMED` → `RUNNING` → `COMPLETED` / `FAILED`
- Executing user-defined handlers
- Recording execution history and logs
- Emitting health heartbeats

## State Machine

```text
SCHEDULED → QUEUED      (scheduler: promoteDelayedJobs, retryFailedJobs)
SCHEDULED → CANCELLED   (API: cancelJob)
QUEUED    → CLAIMED      (worker: claimSpecificJob)
QUEUED    → CANCELLED    (API: cancelJob)
CLAIMED   → RUNNING      (worker: processJob)
CLAIMED   → QUEUED       (scheduler: recoverOrphanedJobs)
CLAIMED   → FAILED       (worker: unhandled job type error)
RUNNING   → COMPLETED    (worker: processJob)
RUNNING   → FAILED       (worker: processJob)
RUNNING   → QUEUED       (scheduler: recoverOrphanedJobs)
FAILED    → QUEUED       (scheduler: retryFailedJobs, API: retryJob)
FAILED    → SCHEDULED    (scheduler: retryFailedJobs with backoff)
COMPLETED → (terminal)
CANCELLED → (terminal)
```

## Data Flow Example

1. **API**: Accepts a job. Inserts into PG as `QUEUED`. Pushes `{ jobId }` to BullMQ.
2. **Worker**: BullMQ delivers `{ jobId }`. Worker runs `UPDATE jobs SET status='CLAIMED' WHERE id=$1 AND status='QUEUED' RETURNING *`.
3. **Worker**: If claim succeeds, updates to `RUNNING` and executes the handler.
4. **Worker**: On success, updates to `COMPLETED`. On throw, updates to `FAILED`.
