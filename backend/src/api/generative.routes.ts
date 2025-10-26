
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
import { elevenlabsService } from '../services/elevenlabs.service';

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

router.post('/viral-audio', async (req, res, next) => {
    try {
        const { script, videoIdea, provider, elevenLabsVoiceId } = req.body;

        // 1. Validate request body
        if (!script || !videoIdea || !provider) {
            return res.status(400).json({ message: 'script, videoIdea, and provider are required.' });
        }
        if (provider === 'elevenlabs' && !elevenLabsVoiceId) {
            return res.status(400).json({ message: 'elevenLabsVoiceId is required for the elevenlabs provider.' });
        }

        // 2. Strategy Engine: Determine audio parameters
        const getAudioParams = (idea: any) => {
            let speakingRate = 1.0;
            let pitch = 0.0;

            const platform = idea.preferredPlatform?.[0]?.toLowerCase() || '';
            const emotion = idea.targetEmotion?.toLowerCase() || '';
            const musicPace = idea.musicPace?.toLowerCase() || '';

            // Platform analysis
            if (['tiktok', 'instagram shorts', 'facebook reels'].some(p => platform.includes(p))) {
                speakingRate *= 1.20; // 20% faster for short-form video
            }

            // Emotion analysis
            if (['urgent', 'exciting', 'energetic'].includes(emotion)) {
                speakingRate *= 1.15;
                pitch += 1.5;
            } else if (['inspiring', 'uplifting'].includes(emotion)) {
                speakingRate *= 1.05;
                pitch += 1.0;
            } else if (['calming', 'sad', 'empathetic'].includes(emotion)) {
                speakingRate *= 0.85;
                pitch -= 1.5;
            } else if (['mysterious', 'dramatic'].includes(emotion)) {
                speakingRate *= 0.75;
            }

            // Music pace adjustment
            if (musicPace === 'uptempo') {
                speakingRate = Math.max(speakingRate, 1.1);
            } else if (musicPace === 'downtempo') {
                speakingRate = Math.min(speakingRate, 1.0);
            }

            // Voice selection for Google
            const voiceTone = idea.voiceTone?.toLowerCase() || '';
            let voiceName = 'en-US-Studio-O'; // High-quality default
            if (voiceTone.includes('empathetic') || voiceTone.includes('warm')) {
                voiceName = 'en-US-Wavenet-F';
            } else if (voiceTone.includes('professional') || voiceTone.includes('clear')) {
                voiceName = 'en-US-Wavenet-D';
            } else if (voiceTone.includes('energetic') || voiceTone.includes('youthful')) {
                voiceName = 'en-US-Wavenet-J';
            }

            return {
                speakingRate: parseFloat(speakingRate.toFixed(2)),
                pitch: parseFloat(pitch.toFixed(2)),
                voiceName: voiceName,
                languageCode: 'en-US'
            };
        };

        const params = getAudioParams(videoIdea);
        let audioBlob: Blob;

        // 3. Generate audio based on provider
        switch (provider) {
            case 'google':
                audioBlob = await googleTtsService.synthesize({
                    text: script,
                    voice: { languageCode: params.languageCode, name: params.voiceName },
                    speakingRate: params.speakingRate,
                    pitch: params.pitch,
                });
                break;

            case 'elevenlabs':
                // Note: ElevenLabs API v1 doesn't directly support pitch/rate adjustments.
                // We pass the voice ID and use default stability settings.
                audioBlob = await elevenlabsService.generateAudio(
                    script,
                    elevenLabsVoiceId,
                    { stability: 0.7, similarity_boost: 0.8 }
                );
                break;

            default:
                return res.status(400).json({ message: `Unsupported provider: ${provider}. Use 'google' or 'elevenlabs'.` });
        }

        // 4. Convert to base64 and send response
        const audioBuffer = await audioBlob.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString('base64');

        res.status(200).json({ base64Audio });

    } catch (error) {
        console.error('Error in /viral-audio route:', error);
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

        const videoAssetsPath = path.join(process.cwd(), 'public', 'assets', 'videos');
        await fs.mkdir(videoAssetsPath, { recursive: true });
        const videoOutputPath = path.join(videoAssetsPath, videoFileName);
        
        await geminiService.createVideoFromAssets(imageFiles, audioPath, videoOutputPath);
        
        // --- 4. Return the URL of the generated video ---
        const videoUrl = `/assets/videos/${videoFileName}`;
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
