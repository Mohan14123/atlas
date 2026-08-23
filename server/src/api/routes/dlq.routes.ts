import { Router } from 'express';
import {
  listDLQ,
  getDLQEntry,
  replayDLQ
} from '../controllers/dlq.controller';

const router = Router();

router.get('/', listDLQ);
router.get('/:entryId', getDLQEntry);
router.post('/:entryId/replay', replayDLQ);

export default router;
