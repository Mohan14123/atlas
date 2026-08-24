# Atlas Submission

## What to test first

1. Login and Authenticate
2. Create project
3. Create queue
4. Create immediate job
5. Create recurring schedule
6. Observe generated jobs
7. Stop a worker
8. Observe recovery
9. Force failures
10. Inspect DLQ

## Key Engineering Features

- **PostgreSQL source of truth**: Absolute consistency and durability for the entire job lifecycle.
- **Atomic claiming**: Highly concurrent `SELECT ... FOR UPDATE SKIP LOCKED` queries in PostgreSQL.
- **Worker heartbeats**: To detect and recover jobs from abruptly crashed workers.
- **Retry policies**: Support for fixed, linear, and exponential backoff.
- **DLQ**: Automatic routing of terminal failures to the Dead Letter Queue.
- **Scheduler**: Robust cron evaluation and job generation separate from execution.
- **Redis/BullMQ transport**: High throughput pub/sub and fast task delivery.

## Test Evidence

**Concurrency:**
- 10 workers / 10,000 jobs / 0 duplicate claims

**Recovery:**
- Stale workers are detected by missing heartbeats (e.g., > 60 seconds).
- Orphaned jobs are immediately returned to the `QUEUED` state and successfully picked up by healthy workers.
