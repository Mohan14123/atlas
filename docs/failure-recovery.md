# Failure Recovery

This document explains what happens when components of Atlas fail.

## Worker crash
1. Worker heartbeat stops
2. Scheduler detects stale worker
3. Recover job (status reset to QUEUED)
4. Job becomes eligible again

## Redis failure
1. Redis unavailable
2. PostgreSQL still contains the authoritative job state
3. Periodic reconciliation runs
4. Job is dispatched again to the transport layer

## Scheduler crash
1. Scheduler dies
2. Schedules remain safely in PostgreSQL
3. Scheduler restarts
4. Re-evaluates `next_run_at` and continues processing

## Permanent failure
1. Job fails
2. Retry
3. Retry
4. Retries exhausted
5. Job moved to DLQ (Dead Letter Queue)
