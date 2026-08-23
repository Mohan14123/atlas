import { Router } from 'express';
import {
  listSchedules,
  createSchedule,
  getSchedule,
  updateSchedule,
  deleteSchedule,
  CreateScheduleSchema,
  UpdateScheduleSchema
} from '../controllers/schedules.controller';
import { validate } from '../middlewares/validate';

// mergeParams: true allows access to :queueId from the parent router
const router = Router({ mergeParams: true });

router.get('/', listSchedules);
router.post('/', validate(CreateScheduleSchema), createSchedule);
router.get('/:scheduleId', getSchedule);
router.put('/:scheduleId', validate(UpdateScheduleSchema), updateSchedule);
router.delete('/:scheduleId', deleteSchedule);

export default router;
