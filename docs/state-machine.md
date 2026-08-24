# Job State Machine

This documents the job lifecycle and valid transitions.

```mermaid
stateDiagram-v2
    [*] --> SCHEDULED : Schedule triggered
    [*] --> QUEUED : Enqueued directly
    SCHEDULED --> QUEUED : Time reached
    QUEUED --> CLAIMED : Worker claims job
    CLAIMED --> RUNNING : Worker begins execution
    RUNNING --> COMPLETED : Execution successful
    RUNNING --> FAILED : Execution throws error
    FAILED --> QUEUED : Retry policy allows
    FAILED --> DLQ : Max retries exhausted
    COMPLETED --> [*]
    DLQ --> [*]
```

## Legal Transitions

- `QUEUED → CLAIMED`       (valid)
- `CLAIMED → RUNNING`      (valid)
- `RUNNING → COMPLETED`    (valid)
- `RUNNING → FAILED`       (valid)
- `COMPLETED → RUNNING`    (invalid)
- `FAILED → QUEUED`        (valid for retries)
- `FAILED → DLQ`           (valid on exhaustion)
