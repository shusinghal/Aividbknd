
import { Router } from 'express';
import companyRoutes from './companies.routes';
import nicheRoutes from './niches.routes';
import generativeRoutes from './generative.routes';
import filesRoutes from './files.routes';

const router = Router();

router.use('/companies', companyRoutes);
router.use('/niches', nicheRoutes);
router.use('/assets', filesRoutes);
router.use('/generate', generativeRoutes);
router.use('/files', filesRoutes);

export default router;
