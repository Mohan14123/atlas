import { Router } from 'express';
import {
  listOrganizations,
  createOrganization,
  getOrganization,
  updateOrganization,
  deleteOrganization,
  CreateOrganizationSchema,
  UpdateOrganizationSchema
} from '../controllers/organizations.controller';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import projectsRoutes from './projects.routes';

const router = Router();

// Apply requireAuth to all routes
router.use(requireAuth);

router.get('/', listOrganizations);
router.post('/', validate(CreateOrganizationSchema), createOrganization);
router.get('/:orgId', getOrganization);
router.put('/:orgId', validate(UpdateOrganizationSchema), updateOrganization);
router.delete('/:orgId', deleteOrganization);

// Mount nested routes for projects (e.g. /organizations/:orgId/projects)
router.use('/:orgId/projects', projectsRoutes);

export default router;
