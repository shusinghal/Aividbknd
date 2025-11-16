import { Router } from 'express';
import { secretsService } from '../services/secrets.service';

const router = Router();

router.post('/', async (req, res, next) => {
    try {
        // The frontend sends the key inside the `secretValue` property.
        const { secretValue } = req.body; 
        if (!secretValue || typeof secretValue !== 'string') {
            return res.status(400).json({ message: 'A non-empty string `secretValue` is required.' });
        }
        // Pass only the raw string to the service.
        const keyId = await secretsService.saveSecret(secretValue);
        res.status(201).json({ keyId });
    } catch (error) {
        next(error);
    }
});

export default router;