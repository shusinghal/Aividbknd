
import { Router } from 'express';
import companyRoutes from './companies.routes';
import nicheRoutes from './niches.routes';
import assetRoutes from './assets.routes';
import generativeRoutes from './generative.routes';

const router = Router();

router.use('/companies', companyRoutes);
router.use('/niches', nicheRoutes);
router.use('/assets', assetRoutes);
router.use('/generate', generativeRoutes);

export default router;
