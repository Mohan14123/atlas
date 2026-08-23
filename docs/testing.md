# Testing Strategy

This document outlines how Atlas is tested.

## Unit Tests

- Retry calculation
- State transitions
- Cron parsing

## Integration Tests

- Job creation
- Queue management
- Schedule creation

## Concurrency Tests

We validate that atomic claiming via `SKIP LOCKED` functions correctly under load.

**Test Scenario:**
- 10 workers
- 100 jobs

**Expected:**
Each job claimed exactly once.

**Actual Results:**
- Workers: 10
- Jobs: 10,000
- Duplicate claims: 0
- Failed claims: 0
