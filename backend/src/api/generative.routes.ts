import { Router } from 'express';
import { geminiService } from '../services/gemini.service';
import { elevenlabsService } from '../services/elevenlabs.service';
import { googleTtsService } from '../services/tts.service';

const router = Router();

router.post('/scan-niche', async (req, res, next) => {
    try {
        const { niche } = req.body;
        if (!niche) return res.status(400).json({ message: 'Niche is required.' });
        const results = await geminiService.scanForCompanies(niche);
        res.json(results);
    } catch (error) {
        next(error);
    }
});

router.post('/marketing-insights', async (req, res, next) => {
    try {
        const { name, description } = req.body;
        if (!name || !description) return res.status(400).json({ message: 'Company name and description are required.' });
        const insights = await geminiService.generateMarketingInsights(name, description);
        res.json(insights);
    } catch (error) {
        next(error);
    }
});

router.post('/video-idea', async (req, res, next) => {
    try {
        const { name, description } = req.body;
        if (!name || !description) return res.status(400).json({ message: 'Company name and description are required.' });
        const company = { name, description };
        const videoIdea = await geminiService.runAiCollaboration(company);
        res.json(videoIdea);
    } catch (error) {
        next(error);
    }
});

router.post('/assets', async (req, res, next) => {
    try {
        const { companyName, videoIdea } = req.body;
        if (!companyName || !videoIdea) return res.status(400).json({ message: 'Company and videoIdea are required.' });
        await geminiService.generateAndSaveAssets(companyName, videoIdea); // This now generates and saves the video too
        res.status(200).json({ message: 'Assets and video generated successfully.' });
    } catch (error) {
        next(error);
    }
});

router.post('/character-description', async (req, res, next) => {
    try {
        const { videoIdea } = req.body;
        if (!videoIdea) return res.status(400).json({ message: 'videoIdea is required.' });
        const description = await geminiService.generateCharacterDescription(videoIdea);
        res.json({ characterDescription: description });
    } catch(error) {
        next(error);
    }
});

router.post('/single-image', async (req, res, next) => {
    try {
        const { sceneDescription, visualStyle, characterDescription } = req.body;
        if (!sceneDescription || !visualStyle) return res.status(400).json({ message: 'sceneDescription and visualStyle are required.' });
        const base64Image = await geminiService.generateSingleImage({ sceneDescription, visualStyle, characterDescription });
        res.json({ base64Image });
    } catch(error) {
        next(error);
    }
});

router.post('/tts', async (req, res, next) => {
    try {
        const { text, voice, speakingRate, pitch } = req.body;
        const audioBlob = await googleTtsService.synthesize({ text, voice, speakingRate, pitch });
        
        res.setHeader('Content-Type', 'audio/mpeg');
        // Convert Blob to Buffer to send
        const buffer = Buffer.from(await audioBlob.arrayBuffer());
        res.send(buffer);

    } catch(error) {
        next(error);
    }
});

export default router;