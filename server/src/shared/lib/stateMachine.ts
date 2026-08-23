import { AppError } from './errors';

export type JobStatus =
  | 'SCHEDULED' | 'QUEUED' | 'CLAIMED'
  | 'RUNNING'   | 'COMPLETED' | 'FAILED' | 'CANCELLED';

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  SCHEDULED:  ['QUEUED',  'CANCELLED'],
  QUEUED:     ['CLAIMED', 'CANCELLED'],
  CLAIMED:    ['RUNNING', 'QUEUED'],
  RUNNING:    ['COMPLETED', 'FAILED', 'QUEUED'],
  FAILED:     ['QUEUED'],           // scheduler retry path
  COMPLETED:  [],
  CANCELLED:  [],
};

export function validateTransition(from: JobStatus, to: JobStatus): void {
  if (!(TRANSITIONS[from] as readonly string[]).includes(to)) {
    throw new AppError(
      `Invalid job transition: ${from} → ${to}`,
      'INVALID_STATE_TRANSITION',
      422,
    );
  }
}
