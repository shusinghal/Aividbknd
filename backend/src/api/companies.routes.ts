
import { Router } from 'express';
import { githubService } from '../services/github.service';

const router = Router();

router.get('/', async (req, res, next) => {
    try {
        if (!githubService) return res.json([]); // GitHub disabled: return empty list
        const companies = await githubService.getCompanies();
        res.json(companies);
    } catch (error) {
        next(error);
    }
});

router.put('/', async (req, res, next) => {
    try {
        if (!githubService) return res.status(501).json({ message: 'GitHub integration is disabled.' });
        const company = req.body;
        const savedCompany = await githubService.saveCompany(company);
        res.status(200).json(savedCompany);
    } catch (error) {
        next(error);
    }
});

router.delete('/:name', async (req, res, next) => {
    try {
        if (!githubService) return res.status(501).json({ message: 'GitHub integration is disabled.' });
        const companyName = decodeURIComponent(req.params.name);
        await githubService.deleteCompany(companyName);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export default router;
