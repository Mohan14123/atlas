import { Router } from 'express';
import {
  createJob,
  createBatchJobs,
  listJobs,
  getJob,
  getJobExecutions,
  getJobLogs,
  retryJob,
  cancelJob,
  CreateJobSchema,
  BatchJobSchema,
} from '../controllers/jobs.controller';
import { validate } from '../middlewares/validate';

// mergeParams: true allows access to :queueId from the parent router
const router = Router({ mergeParams: true });

// Queue-scoped job routes: /queues/:queueId/jobs
router.get('/', listJobs);
router.post('/', validate(CreateJobSchema), createJob);
router.post('/batch', validate(BatchJobSchema), createBatchJobs);

export default router;
