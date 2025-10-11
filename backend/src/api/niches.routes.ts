
import { Router } from 'express';
import { githubService } from '../services/github.service';

const router = Router();

router.get('/', async (req, res, next) => {
    try {
        const niches = await githubService.getNiches();
        res.json(niches);
    } catch (error) {
        next(error);
    }
});

router.put('/', async (req, res, next) => {
    try {
        const niche = req.body;
        const savedNiche = await githubService.saveNiche(niche);
        res.status(200).json(savedNiche);
    } catch (error) {
        next(error);
    }
});

export default router;
