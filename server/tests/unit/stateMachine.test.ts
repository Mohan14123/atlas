import { validateTransition, type JobStatus } from '../../src/shared/lib/stateMachine';

/**
 * Complete state-machine transition matrix.
 *
 * Every (from, to) pair is tested:
 *   - Allowed transitions must not throw.
 *   - Forbidden transitions must throw INVALID_STATE_TRANSITION.
 */
describe('State Machine — Transition Matrix', () => {
  const ALL_STATES: JobStatus[] = [
    'SCHEDULED', 'QUEUED', 'CLAIMED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED',
  ];

  // Exhaustive allowed-transition map
  const ALLOWED: Record<JobStatus, JobStatus[]> = {
    SCHEDULED:  ['QUEUED', 'CANCELLED'],
    QUEUED:     ['CLAIMED', 'CANCELLED'],
    CLAIMED:    ['RUNNING', 'QUEUED', 'FAILED'],
    RUNNING:    ['COMPLETED', 'FAILED', 'QUEUED'],
    FAILED:     ['QUEUED', 'SCHEDULED'],
    COMPLETED:  [],
    CANCELLED:  [],
  };

  describe('Allowed transitions', () => {
    for (const from of ALL_STATES) {
      for (const to of ALLOWED[from]) {
        it(`${from} → ${to} should succeed`, () => {
          expect(() => validateTransition(from, to)).not.toThrow();
        });
      }
    }
  });

  describe('Forbidden transitions', () => {
    for (const from of ALL_STATES) {
      const forbidden = ALL_STATES.filter(s => !ALLOWED[from].includes(s) && s !== from);
      for (const to of forbidden) {
        it(`${from} → ${to} should throw`, () => {
          expect(() => validateTransition(from, to)).toThrow('Invalid job transition');
        });
      }
    }
  });

  describe('Self-transitions', () => {
    for (const state of ALL_STATES) {
      it(`${state} → ${state} should throw (no self-loops)`, () => {
        expect(() => validateTransition(state, state)).toThrow('Invalid job transition');
      });
    }
  });

  describe('Terminal states have no outbound transitions', () => {
    for (const terminal of ['COMPLETED', 'CANCELLED'] as JobStatus[]) {
      it(`${terminal} allows no transitions`, () => {
        for (const target of ALL_STATES) {
          if (target === terminal) continue;
          expect(() => validateTransition(terminal, target)).toThrow();
        }
      });
    }
  });

  describe('Key semantic transitions', () => {
    it('retry with backoff: FAILED → SCHEDULED', () => {
      expect(() => validateTransition('FAILED', 'SCHEDULED')).not.toThrow();
    });

    it('immediate retry: FAILED → QUEUED', () => {
      expect(() => validateTransition('FAILED', 'QUEUED')).not.toThrow();
    });

    it('orphan recovery from CLAIMED: CLAIMED → QUEUED', () => {
      expect(() => validateTransition('CLAIMED', 'QUEUED')).not.toThrow();
    });

    it('orphan recovery from RUNNING: RUNNING → QUEUED', () => {
      expect(() => validateTransition('RUNNING', 'QUEUED')).not.toThrow();
    });

    it('worker error before RUNNING: CLAIMED → FAILED', () => {
      expect(() => validateTransition('CLAIMED', 'FAILED')).not.toThrow();
    });

    it('cannot un-complete a job: COMPLETED → QUEUED', () => {
      expect(() => validateTransition('COMPLETED', 'QUEUED')).toThrow();
    });

    it('cannot un-cancel a job: CANCELLED → QUEUED', () => {
      expect(() => validateTransition('CANCELLED', 'QUEUED')).toThrow();
    });
  });
});
