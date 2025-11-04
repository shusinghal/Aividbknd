import { Router } from 'express';
import { secretsService } from '../services/secrets.service';

const router = Router();

router.post('/', async (req, res, next) => {
    try {
        const { secretValue } = req.body;
        if (!secretValue) {
            return res.status(400).json({ message: 'secretValue is required.' });
        }
        const keyId = await secretsService.saveSecret(secretValue);
        res.status(201).json({ keyId });
    } catch (error) {
        next(error);
    }
});

export default router;