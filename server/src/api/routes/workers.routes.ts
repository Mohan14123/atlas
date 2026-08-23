import { Router } from 'express';
import { listWorkers, getWorker } from '../controllers/workers.controller';

const router = Router();

router.get('/', listWorkers);
router.get('/:workerId', getWorker);

export default router;
