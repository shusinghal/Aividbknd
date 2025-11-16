
import { Router } from 'express';
import companyRoutes from './companies.routes';
import nicheRoutes from './niches.routes';
import generativeRoutes from './generative.routes';
import filesRoutes from './files.routes';
import socialAccountRoutes from './social-accounts.routes';
import secretsRoutes from './secrets.routes';
import analyticsRoutes from './analytics.routes';

const router = Router();

router.use('/companies', companyRoutes);
router.use('/niches', nicheRoutes);
router.use('/files', filesRoutes);
router.use('/secrets', secretsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/social-accounts', socialAccountRoutes);
router.use('/generate', generativeRoutes);

export default router;
