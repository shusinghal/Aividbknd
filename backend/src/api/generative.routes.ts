
// FIX: Import Buffer and process to resolve type errors in Node.js environment.
import { Buffer } from 'buffer';
import process from 'process';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import multer from 'multer';
import { geminiService } from '../services/gemini.service';
import { googleTtsService } from '../services/tts.service';
import { imageGenerationService } from '../services/imageGeneration.service';

const router = express.Router();

// Configure multer for multipart/form-data handling
const upload = multer({ dest: os.tmpdir() });

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
        const { companyName, companyDescription, videoIdea } = req.body;
        if (!companyName || !companyDescription || !videoIdea) {
            return res.status(400).json({ message: 'companyName, companyDescription, and videoIdea are required.' });
        }
        const company = { name: companyName, description: companyDescription };
        await geminiService.generateAndSaveAssets(company, videoIdea);
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

router.post('/tts', async (req, res, next) => {
    try {
        const { text, voice, speakingRate, pitch } = req.body;
        const audioBlob = await googleTtsService.synthesize({ text, voice, speakingRate, pitch });
        
        res.setHeader('Content-Type', 'audio/mpeg');
        const buffer = Buffer.from(await audioBlob.arrayBuffer());
        res.send(buffer);

    } catch(error) {
        next(error);
    }
});

router.post('/single-image', async (req, res, next) => {
    try {
        const { prompt, characterDescription } = req.body;
        if (!prompt) return res.status(400).json({ message: 'A prompt is required.' });

        // Assuming imageGenerationService exists and abstracts the image generation call
        // Using 9:16 aspect ratio for vertical video format
        const base64Images = await imageGenerationService.generateImage(prompt, characterDescription, '9:16', 1);
        res.json({ base64Image: base64Images[0] });
    } catch(error) {
        next(error);
    }
});

router.post('/ffmpeg-commands', async (req, res, next) => {
    try {
        const { scenes } = req.body;
        if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
            return res.status(400).json({ message: 'A valid "scenes" array is required in the request body.' });
        }
        for (const scene of scenes) {
            if (!scene.id || !scene.effect || !scene.duration) {
                return res.status(400).json({ message: 'Each scene object must contain an "id", "effect", and "duration".' });
            }
        }
        const commandsMap = await geminiService.generateFfmpegCommands(scenes);
        res.status(200).json({ commandsMap });
    } catch (error) {
        console.error('Error in /ffmpeg-commands route:', error);
        next(error);
    }
});
 
router.post('/render-video', async (req, res, next) => {
    try {
        const { metadata, audio, scenes } = req.body;

        // --- 1. Validate the new payload structure ---
        if (!metadata || !audio?.fileName || !scenes || !Array.isArray(scenes) || scenes.length === 0) {
            return res.status(400).json({ message: 'Invalid payload. "metadata", "audio.fileName", and a non-empty "scenes" array are required.' });
        }

        for (const scene of scenes) {
            if (!scene.image?.fileName || !scene.duration) {
                return res.status(400).json({ message: 'Each scene must have an "image.fileName" and a "duration".' });
            }
        }

        // --- 2. Construct local file paths from filenames ---
        const assetsBasePath = path.join(process.cwd(), 'public', 'assets');
        const audioPath = path.join(assetsBasePath, 'audio', audio.fileName);

        const imageFiles = scenes.map(scene => {
            const imagePath = path.join(assetsBasePath, 'images', scene.image.fileName);
            return {
                path: imagePath,
                duration: parseFloat(scene.duration) || 3,
                ffmpegCommand: scene.effects?.ffmpeg,
            };
        });

        // --- 3. Prepare output path and render the video ---
        const safeTitle = (metadata?.title || 'video').replace(/[^a-zA-Z0-9]/g, '_');
        const videoFileName = `${safeTitle}_${Date.now()}.mp4`;

        const publicDir = path.join(process.cwd(), 'public', 'videos');
        await fs.mkdir(publicDir, { recursive: true });
        const videoOutputPath = path.join(publicDir, videoFileName);
        
        await geminiService.createVideoFromAssets(imageFiles, audioPath, videoOutputPath);
        
        // --- 4. Return the URL of the generated video ---
        const videoUrl = `/videos/${videoFileName}`;
        res.json({ videoUrl });

    } catch (error) {
        console.error('Error in /render-video route:', error);
        next(error);
    }
});

router.post('/ai-text-utility', async (req, res, next) => {
    try {
        const { task, data } = req.body;
        if (!task || !data) {
            return res.status(400).json({ message: 'A "task" and "data" object are required.' });
        }
        const result = await geminiService.performTextUtility(task, data);
        res.json({ result });
    } catch (error) {
        next(error);
    }
});

export default router;
