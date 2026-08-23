# Atlas Features

## 1. Distributed Job Scheduling

Atlas is a distributed job scheduling platform that creates, schedules, dispatches, executes, retries, and monitors background jobs across multiple worker processes.

Core principle:

> PostgreSQL owns truth. The Scheduler owns time and recovery. Redis/BullMQ owns execution transport. Workers own execution.

---

## 2. Schedule Definition → Job Instance

Atlas separates **what should happen** from **a particular execution of it**.

### Schedule Definition

A persistent definition describing when a job should be generated.

Examples:

- Run a backup every day at 02:00.
- Run a report every Monday.
- Run a cleanup task every 30 minutes.

### Job Instance

A concrete execution generated from that schedule.

Example:

```text
Schedule:
"Run backup every day at 02:00"

        ↓ Scheduler

Job #1001 — Aug 23 02:00
Job #1002 — Aug 24 02:00
Job #1003 — Aug 25 02:00
```

This separation allows Atlas to maintain independent execution history for every occurrence.

---

## 3. Job Types

Atlas supports:

### Immediate Jobs

Execute as soon as capacity is available.

```text
POST /jobs
        ↓
QUEUED
```

### Delayed Jobs

Become eligible after a specified delay.

```text
created
   ↓
SCHEDULED
   ↓ time arrives
QUEUED
```

### Scheduled Jobs

Execute at a specified future time.

```text
scheduled_at
     ↓
Scheduler
     ↓
Job Instance
```

### Recurring Jobs

Use cron expressions to generate job instances repeatedly.

```text
Cron Schedule
     ↓
Scheduler
     ↓
Job Instance
     ↓
execution
```

### Batch Jobs

Allow multiple jobs to be submitted together.

---

## 4. Queue Management

Each project can contain multiple queues.

A queue supports:

- priority
- concurrency limit
- pause/resume
- retry policy
- queue statistics
- job isolation

Example:

```text
Project: Atlas Demo

Queues:
├── security-scans
├── reports
├── notifications
└── data-processing
```

---

## 5. Priority Scheduling

Jobs can have different priorities.

The scheduler/worker claim path considers queue and job priority when selecting eligible work.

Example:

```text
Priority 10 → High
Priority 5  → Medium
Priority 1  → Low
```

High-priority work can be selected ahead of lower-priority work when the queue permits it.

---

## 6. Concurrency Control

Each queue can define a maximum number of simultaneously executing jobs.

Example:

```text
Queue concurrency = 5

Worker 1 → Job A
Worker 2 → Job B
Worker 3 → Job C
Worker 4 → Job D
Worker 5 → Job E

Job F waits
```

This prevents a queue from consuming unlimited worker capacity.

---

## 7. Atomic Job Claiming

Multiple workers can attempt to process jobs concurrently.

Atlas prevents duplicate claiming using PostgreSQL transactions and:

```sql
SELECT ...
FOR UPDATE SKIP LOCKED
```

Conceptually:

```text
Worker A ─┐
Worker B ─┼──→ PostgreSQL
Worker C ─┘
              ↓
       one worker claims
              ↓
           CLAIMED
```

PostgreSQL provides the correctness guarantee.

Redis is not used as the authoritative locking mechanism for job ownership.

---

## 8. Job State Machine

Atlas validates job state transitions.

### Normal execution

```text
SCHEDULED
    ↓
QUEUED
    ↓
CLAIMED
    ↓
RUNNING
    ↓
COMPLETED
```

### Failure

```text
RUNNING
    ↓
FAILED
    ↓
retry available?
   ├── yes → scheduled/queued again
   └── no  → DLQ
```

Not every job passes through every state.

An immediate job may begin:

```text
QUEUED → CLAIMED
```

while a scheduled job may begin:

```text
SCHEDULED → QUEUED
```

---

## 9. Retry Policies

Queues can define retry behavior.

Supported strategies:

- Fixed delay
- Linear backoff
- Exponential backoff

Retry configuration can include:

- maximum attempts
- initial delay
- maximum delay
- optional jitter

Example:

```text
Attempt 1 → failure
       ↓
wait 10s
       ↓
Attempt 2 → failure
       ↓
wait 20s
       ↓
Attempt 3
```

---

## 10. Dead Letter Queue

Jobs that permanently fail after exhausting their retry policy enter the DLQ.

```text
RUNNING
   ↓
FAILED
   ↓
retry
   ↓
FAILED
   ↓
max attempts reached
   ↓
DLQ
```

The DLQ preserves:

- job identity
- failure reason
- attempt count
- error information
- timestamps
- execution history

DLQ jobs can be inspected and manually replayed.

---

## 11. Worker Pool

Atlas supports multiple independent workers.

```text
             Redis/BullMQ
                  │
        ┌─────────┼─────────┐
        ↓         ↓         ↓
     Worker 1  Worker 2  Worker N
```

Workers are stateless execution processes and can be horizontally scaled.

Workers can execute jobs concurrently according to configured capacity.

---

## 12. Handler / Plugin System

Workers are generic.

A job contains a handler type:

```text
type = "security_scan"
```

The worker resolves that type through the Handler Registry.

```text
Job
 ↓
Handler Registry
 ↓
SecurityScanHandler
 ↓
execute
```

Example handlers:

```text
noop
webhook
report
security-scan
repo-index
```

Additional handlers can be added without changing the worker execution engine.

---

## 13. Worker Heartbeats

Workers periodically report their health.

Heartbeat information includes:

- worker ID
- heartbeat timestamp
- active job count
- worker status

Example:

```text
Worker 7
status: active
active_jobs: 3
last_heartbeat: 14:42:31
```

---

## 14. Worker Failure Detection

The Scheduler/Control Plane detects stale workers.

```text
Worker
   ↓
heartbeat stops
   ↓
stale timeout
   ↓
worker marked unhealthy
   ↓
orphaned jobs recovered
```

This prevents jobs from remaining permanently claimed by a dead worker.

---

## 15. Graceful Worker Shutdown

Workers handle:

```text
SIGTERM
SIGINT
```

Shutdown behavior:

1. Stop accepting new jobs.
2. Stop claiming additional work.
3. Allow safe in-flight execution to finish where possible.
4. Persist final job state.
5. Update worker status.
6. Close connections cleanly.

---

## 16. PostgreSQL as Source of Truth

PostgreSQL stores all durable state.

This includes:

```text
Organizations
Projects
Queues
Retry Policies
Schedules
Jobs
Job Executions
Job Logs
Workers
Worker Heartbeats
DLQ Entries
```

Redis loss must not redefine the authoritative job state.

---

## 17. Redis/BullMQ Execution Transport

Redis/BullMQ provides:

- asynchronous dispatch
- execution transport
- delayed delivery
- worker distribution
- queue runtime support

It is not the canonical database.

Conceptually:

```text
PostgreSQL
    ↓
eligible work
    ↓
Redis/BullMQ
    ↓
Workers
```

---

## 18. Scheduler / Control Plane

The Scheduler is responsible for time and recovery operations.

It handles:

- due schedules
- recurring job generation
- delayed jobs
- retry timing
- stale worker detection
- orphaned-job recovery
- PostgreSQL/BullMQ reconciliation

The Scheduler does not execute application jobs itself.

---

## 19. PostgreSQL LISTEN/NOTIFY

Atlas uses PostgreSQL `LISTEN/NOTIFY` as a lightweight event notification mechanism.

Example:

```text
PostgreSQL
    ↓
NOTIFY schedule_changed
    ↓
Scheduler wakes
    ↓
re-evaluates schedules
```

Important:

**LISTEN/NOTIFY is not a durable queue.**

If a notification is missed, reconciliation must recover the relevant work from PostgreSQL.

---

## 20. Connection Pooling

PgBouncer or an equivalent pooler manages PostgreSQL connections from:

- API servers
- scheduler instances
- workers

This prevents large worker fleets from creating uncontrolled numbers of database connections.

Long-lived `LISTEN` subscriptions should use appropriately managed persistent connections rather than being treated as ordinary short-lived pooled queries.

---

## 21. Idempotency

Atlas supports idempotent job submission and execution safeguards.

A client can provide an idempotency key:

```text
idempotency_key = "backup-2026-08-23"
```

Repeated submissions with the same key can resolve to the existing job instead of creating unintended duplicates.

Execution handlers should also be designed to avoid unsafe duplicate side effects where possible.

---

## 22. Execution History

A Job represents the logical work item.

A Job Execution represents one attempt.

Example:

```text
Job #123

Execution #1
attempt = 1
status = failed

Execution #2
attempt = 2
status = failed

Execution #3
attempt = 3
status = completed
```

This allows Atlas to retain complete retry history.

---

## 23. Job Logs

Each execution can generate structured logs.

Example:

```text
14:30:01 INFO  Job claimed
14:30:02 INFO  Execution started
14:30:04 ERROR Remote service returned 503
14:30:04 INFO  Retry scheduled
14:30:14 INFO  Retry started
14:30:16 INFO  Job completed
```

Logs are associated with the job and, where applicable, its execution attempt.

---

## 24. Dashboard

The Atlas dashboard provides operational visibility.

### Overview

- queued jobs
- running jobs
- completed jobs
- failed jobs
- DLQ count
- throughput

### Queue View

- queue depth
- priority
- concurrency limit
- active jobs
- paused state
- retry policy

### Job View

- current state
- payload
- attempts
- worker assignment
- execution history
- logs
- timestamps

### Worker View

- worker status
- heartbeat
- active jobs
- capacity
- current assignments

### Schedule View

- cron expression
- next run
- previous run
- enabled/disabled state
- generated job instances

---

## 25. API Features

Atlas provides REST APIs for:

- authentication
- organizations
- projects
- queues
- schedules
- jobs
- job executions
- logs
- DLQ
- workers
- metrics

The APIs support:

- authentication
- authorization
- validation
- pagination
- filtering
- structured errors
- idempotency
- manual retry/replay operations

---

## 26. Observability

Atlas records enough durable information to calculate:

- queue depth
- throughput
- execution latency
- success rate
- failure rate
- retry rate
- DLQ rate
- worker utilization
- worker health
- job wait time
- execution duration

---

## 27. Recovery and Reconciliation

Atlas does not depend on one component being permanently healthy.

Examples:

### Redis unavailable

PostgreSQL remains authoritative and reconciliation can restore missing dispatches.

### Worker crashes

Heartbeat detection identifies stale workers and recovers their jobs.

### Scheduler temporarily stops

Persisted schedules retain their `next_run_at` values and can be processed when the scheduler returns.

### Notification missed

`LISTEN/NOTIFY` is not the source of truth; reconciliation discovers the relevant database state.

---

## 28. Bonus Features

After all core functionality is stable, Atlas may add:

- AI-generated DLQ failure summaries
- WebSocket live updates
- RBAC
- API rate limiting
- DAG/workflow dependencies
- advanced distributed coordination
- queue sharding
- scheduler high availability

