import { Router } from 'express';
import authRoutes from './auth.routes';
import organizationsRoutes from './organizations.routes';
import dlqRoutes from './dlq.routes';
import workersRoutes from './workers.routes';
import metricsRoutes from './metrics.routes';
import { requireAuth } from '../middlewares/auth';
import {
  getJob,
  getJobExecutions,
  getJobLogs,
  retryJob,
  cancelJob,
} from '../controllers/jobs.controller';

const router = Router();

router.use('/auth', authRoutes);
router.use('/organizations', organizationsRoutes);
router.use('/dlq', requireAuth, dlqRoutes);
router.use('/workers', requireAuth, workersRoutes);
router.use('/metrics', requireAuth, metricsRoutes);

// Individual job routes (not queue-scoped — jobs are globally unique by ID)
router.get('/jobs/:jobId', requireAuth, getJob);
router.get('/jobs/:jobId/executions', requireAuth, getJobExecutions);
router.get('/jobs/:jobId/logs', requireAuth, getJobLogs);
router.post('/jobs/:jobId/retry', requireAuth, retryJob);
router.post('/jobs/:jobId/cancel', requireAuth, cancelJob);

export default router;
