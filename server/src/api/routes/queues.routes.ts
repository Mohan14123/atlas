import { Router } from 'express';
import {
  listQueues,
  createQueue,
  getQueue,
  updateQueue,
  deleteQueue,
  CreateQueueSchema,
  UpdateQueueSchema
} from '../controllers/queues.controller';
import { validate } from '../middlewares/validate';

// mergeParams: true allows access to :projectId from the parent router
const router = Router({ mergeParams: true });

router.get('/', listQueues);
router.post('/', validate(CreateQueueSchema), createQueue);
router.get('/:queueId', getQueue);
router.put('/:queueId', validate(UpdateQueueSchema), updateQueue);
router.delete('/:queueId', deleteQueue);

export default router;
