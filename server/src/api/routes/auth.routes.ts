import { Router } from 'express';
import { register, login, RegisterSchema, LoginSchema } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate';

const router = Router();

router.post('/register', validate(RegisterSchema), register);
router.post('/login', validate(LoginSchema), login);

export default router;
