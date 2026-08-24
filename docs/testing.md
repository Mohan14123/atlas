# Atlas Testing Strategy

The Atlas project relies on a comprehensive, multi-layered testing strategy designed to verify behavior across unit boundaries, API boundaries, and complex distributed system edge-cases.

**Total Test Count: 134 passing tests** (as of final verification).

## 1. Unit Tests
*Located in `server/tests/unit/`*
- **Purpose**: Verify isolated functions, pure logic, and strict invariants.
- **Coverage**: The `stateMachine.test.ts` exhaustively verifies every permutation of the `TRANSITIONS` matrix to guarantee forbidden state transitions are rejected and allowed transitions execute correctly.

## 2. API Integration Tests
*Located in `server/tests/api/`*
- **Purpose**: Verify REST boundaries, Zod payload validation, authentication, and database persistence.
- **Coverage**: Covers all endpoints (Auth, Projects, Queues, Jobs, Schedules, Workers, Metrics, DLQ). Validates response shapes, HTTP status codes, pagination logic, and filtering.

## 3. Concurrency Tests
*Located in `server/tests/concurrency/`*
- **Purpose**: Verify transactional safety under heavy database contention.
- **Coverage**: `claimPath.test.ts` executes parallel `Promise.all` floods simulating 50 workers attempting to claim the exact same job ID simultaneously.
- **Proof**: Proves that "Two workers cannot claim the same job." Exactly one worker succeeds, the rest receive `null`.

## 4. Scheduler Hardening Tests
*Located in `server/tests/integration/scheduler-hardening.test.ts`*
- **Purpose**: Verify that multiple scheduler instances do not duplicate schedules or race.
- **Proof**: Proves that "Multiple schedulers do not duplicate scheduled jobs."
- **Proof**: Proves that "Multiple workers respect queue concurrency" by simulating job floods and ensuring claims halt when limits are reached.

## 5. Crash Recovery Tests
*Located in `server/tests/integration/crash-recovery.test.ts`*
- **Purpose**: Verify the system's ability to self-heal when worker processes die unexpectedly.
- **Proof**: Proves that "Worker crash during execution is recoverable." Tests specifically kill workers mid-execution (during `CLAIMED` and `RUNNING` states) and verify the stale worker detection correctly transitions jobs back to `QUEUED`.

## 6. Reconciliation Tests
*Located in `server/tests/integration/reconciliation.test.ts`*
- **Purpose**: Verify PG → BullMQ drift repair.
- **Proof**: Proves that "Scheduler crash after PostgreSQL commit is recoverable." Forces a desync by inserting a job into Postgres without enqueuing to Redis, and verifies the reconciliation loop repairs it seamlessly without duplicates.

## 7. Operational Tests (Manual)
- **Redis Restart**: Verified that `ioredis` buffers commands and reconnects seamlessly.
- **Postgres Restart**: Verified that `pg.Pool` automatically rebuilds connections and the scheduler's `LISTEN/NOTIFY` client safely traps `57P01` (admin shutdown) errors and successfully reconnects within 5 seconds.
