import { Router } from 'express';
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  CreateProjectSchema,
  UpdateProjectSchema
} from '../controllers/projects.controller';
import { validate } from '../middlewares/validate';
import queuesRoutes from './queues.routes';

// mergeParams: true is critical here because this router is mounted
// under /organizations/:orgId/projects in organizations.routes.ts.
const router = Router({ mergeParams: true });

router.get('/', listProjects);
router.post('/', validate(CreateProjectSchema), createProject);
router.get('/:projectId', getProject);
router.put('/:projectId', validate(UpdateProjectSchema), updateProject);
router.delete('/:projectId', deleteProject);

// Mount nested queues routes
router.use('/:projectId/queues', queuesRoutes);

export default router;
