import { Router } from 'express';
import authRoutes from './auth.routes';
import organizationsRoutes from './organizations.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/organizations', organizationsRoutes);

export default router;
