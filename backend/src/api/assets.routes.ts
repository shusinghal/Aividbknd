

import { Router } from 'express';
import { githubService } from '../services/github.service';

const router = Router();

router.get('/video-groups', async (req, res, next) => {
    try {
        if (!githubService) return res.json([]);
        const groups = await githubService.getGroupedAssets();
        res.json(groups);
    } catch (error) {
        next(error);
    }
});

// FIX: Added a route to handle saving a single image from the frontend visuals generation page.
router.post('/image', async (req, res, next) => {
    try {
        const { fileName, base64Content } = req.body;
        if (!fileName || !base64Content) {
            return res.status(400).json({ message: 'fileName and base64Content are required.' });
        }
    if (!githubService) return res.status(501).json({ message: 'GitHub integration is disabled.' });
    await githubService.saveAsset('image', fileName, base64Content);
    res.status(201).json({ message: 'Image saved successfully.' });
    } catch (error) {
        next(error);
    }
});

router.delete('/image/:name', async (req, res, next) => {
    try {
        const { name } = req.params;
        const { sha } = req.body;
        if (!sha) return res.status(400).json({ message: 'SHA is required for deletion.' });
    if (!githubService) return res.status(501).json({ message: 'GitHub integration is disabled.' });
    await githubService.deleteAsset('image', name, sha);
    res.status(204).send();
    } catch (error) {
        next(error);
    }
});

router.delete('/audio/:name', async (req, res, next) => {
    try {
        const { name } = req.params;
        const { sha } = req.body;
        if (!sha) return res.status(400).json({ message: 'SHA is required for deletion.' });
    if (!githubService) return res.status(501).json({ message: 'GitHub integration is disabled.' });
    await githubService.deleteAsset('audio', name, sha);
    res.status(204).send();
    } catch (error) {
        next(error);
    }
});

router.delete('/video/:name', async (req, res, next) => {
    try {
        const { name } = req.params;
        const { sha } = req.body;
        if (!sha) return res.status(400).json({ message: 'SHA is required for deletion.' });
    if (!githubService) return res.status(501).json({ message: 'GitHub integration is disabled.' });
    await githubService.deleteAsset('video', name, sha);
    res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export default router;
