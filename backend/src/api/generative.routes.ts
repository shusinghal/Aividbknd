
// FIX: Import Buffer and process to resolve type errors in Node.js environment.
import { Buffer } from 'buffer';
import process from 'process';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { geminiService } from '../services/gemini.service';
import { googleTtsService } from '../services/tts.service';
import { imageGenerationService } from '../services/imageGeneration.service';

const router = express.Router();

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
        const { audio, scenes, metadata } = req.body;
        if (!audio || !audio.base64 || !scenes || !Array.isArray(scenes)) {
            return res.status(400).json({ message: 'Invalid payload. Audio (with base64 content) and a scenes array are required.' });
        }

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-render-'));
        
        const audioBuffer = Buffer.from(audio.base64, 'base64');
        const audioPath = path.join(tempDir, 'narration.mp3');
        await fs.writeFile(audioPath, audioBuffer);

        const imageFiles = [];
        for (const [index, scene] of scenes.entries()) {
            if (!scene.image || !scene.image.base64) {
                await fs.rm(tempDir, { recursive: true, force: true });
                return res.status(400).json({ message: `Scene at index ${index} is missing image data.` });
            }
            const imageBuffer = Buffer.from(scene.image.base64, 'base64');
            const imagePath = path.join(tempDir, `scene_${index}.jpg`);
            await fs.writeFile(imagePath, imageBuffer);
            imageFiles.push({ 
                path: imagePath, 
                duration: parseFloat(scene.duration) || 3,
                ffmpegCommand: scene.effects?.ffmpeg
            });
        }

        const safeTitle = (metadata?.title || 'video').replace(/[^a-zA-Z0-9]/g, '_');
        const videoFileName = `${Date.now()}_${safeTitle}.mp4`;
        
        // Assume a /public/videos directory exists at the root for serving rendered videos
        const publicDir = path.join(process.cwd(), 'public', 'videos');
        await fs.mkdir(publicDir, { recursive: true });
        const videoOutputPath = path.join(publicDir, videoFileName);

        await geminiService.createVideoFromAssets(imageFiles, audioPath, videoOutputPath);

        await fs.rm(tempDir, { recursive: true, force: true });
        
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
