# Final Hardening Checks (Phase 16)

This document tracks the remaining tasks from Phase 16 to ensure system resilience and robustness before considering the system production-complete.

## Remaining Tasks (4 - 10)

- [ ] **4. Worker restart during RUNNING**
  - **Goal:** Verify that if a worker crashes mid-execution (job in `RUNNING` state), the system eventually recovers the job and re-queues it or correctly marks it as failed based on stalled-job logic.
  - **Method:** Add a delay to a test job handler, submit the job, wait for it to be `CLAIMED`/`RUNNING`, and `docker kill` the worker container. Observe the scheduler's `recoverOrphanedJobs` process.

- [ ] **5. Scheduler restart after PostgreSQL commit but before BullMQ enqueue**
  - **Goal:** Verify that jobs don't get stuck if the scheduler commits to PG but fails to enqueue to Redis.
  - **Method:** The `reconcile.ts` job already handles this by checking PG state vs Redis state. Force a desync and ensure `reconcile` automatically fixes it.

- [ ] **6. Redis restart**
  - **Goal:** Verify that the system (Scheduler, Worker, and API) recovers gracefully when Redis drops connection and restarts.
  - **Method:** `docker stop redis`, wait a few seconds, `docker start redis`. Check logs for connection restablishment and ensure job processing resumes.

- [ ] **7. PostgreSQL restart**
  - **Goal:** Verify that the system recovers gracefully when PostgreSQL drops connection and restarts.
  - **Method:** `docker stop postgres`, wait a few seconds, `docker start postgres`. Check logs for connection restablishment.

- [ ] **8. Multiple scheduler instances**
  - **Goal:** Verify that running multiple schedulers does not cause duplicate jobs or race conditions.
  - **Method:** `docker compose up -d --scale atlas-scheduler=2`. Observe logs to ensure locking mechanisms (advisory locks / `FOR UPDATE SKIP LOCKED`) prevent double execution.

- [ ] **9. Multiple workers consuming the same Atlas queue**
  - **Goal:** Verify that multiple workers do not process the same job twice.
  - **Method:** Tested during `claimPath.test.ts` (concurrency), but will verify live using `docker compose up -d --scale atlas-worker=3`.

- [ ] **10. Final documentation audit**
  - **Goal:** Ensure all documentation (architecture, API, workflows) exactly matches the actual implemented architecture.
  - **Method:** Review and update Markdown files in `/docs`.
