
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
import { elevenlabsService } from '../services/elevenlabs.service';
import { audioCompositionService } from '../services/audio.composition.service';

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

        // Define storytelling frameworks at the API level to separate concerns.
        const storytellingFrameworks = [
            'The "Unfiltered Human Moment": Start with a raw, relatable struggle and show how the product provides a solution and emotional relief.',
            'The "Aspirational Transformation": Create a "before and after" narrative, showing a character evolving from a state of difficulty to one of success and empowerment with the help of the product.',
            'The "Unexpected Discovery": Frame the story around a character who stumbles upon the product by chance and is amazed by its immediate, game-changing impact on their task.',
            'The "Secret Weapon" Reveal: Build intrigue by showing a character effortlessly succeeding at a difficult task, then reveal at the end that the product is their hidden advantage.',
            'The "Day in the Life" Integration: Show how the product seamlessly fits into a character\'s daily routine, making it more efficient, creative, or enjoyable without being the sole focus.'
        ];

        // Randomly select a framework for this generation.
        const selectedFramework = storytellingFrameworks[Math.floor(Math.random() * storytellingFrameworks.length)];

        // Call the service with the selected framework.
        const videoIdea = await geminiService.runAiCollaboration(company, selectedFramework);
        res.json(videoIdea);

    } catch (error) {
        next(error);
    }
});

router.post('/refine-video-idea', async (req, res, next) => {
    try {
        const { videoIdea } = req.body;
        if (!videoIdea) return res.status(400).json({ message: 'A videoIdea object is required.' });
        const refinedIdea = await geminiService.refineVideoIdea(videoIdea);
        res.json(refinedIdea);
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
    let tempDir: string | null = null; // To hold the temp directory path for cleanup

    try {
        // Log the raw incoming request body for debugging
        console.log('[Viral-Audio] Raw incoming request:', JSON.stringify(req.body, null, 2));

        const { videoIdea, provider, elevenLabsVoiceId, voiceOptions } = req.body;
        // Revert to the original structure: The script is expected to be inside the videoIdea object.
        // No fallback to a top-level 'script' property will be performed.
        let script = videoIdea?.structuredScript || videoIdea?.script;

        // 1. Validate request body
        if (!videoIdea || !script || !provider) {
            return res.status(400).json({ message: 'A videoIdea object (containing a script) and a provider are required.' });
        }

        if (provider === 'elevenlabs' && !elevenLabsVoiceId) {
            return res.status(400).json({ message: 'elevenLabsVoiceId is required for the elevenlabs provider.' });
        }

        // --- START: Handle string-based script input ---
        // If the script is a single string with newline-separated JSON, parse it.
        if (typeof script === 'string') {
            try {
                script = script.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line));
            } catch (e) {
                console.error('Failed to parse string-based script:', e);
                return res.status(400).json({ message: 'The provided script string is not valid. It must be a series of newline-separated JSON objects.' });
            }
        }
        // --- END: Handle string-based script input ---

        // Ensure script is an array for the composition service
        if (!Array.isArray(script)) {
            return res.status(400).json({ message: 'The script must be a structured array of dialogue, sfx, and pause parts. Please use a refined video idea.' });
        }

        // Stricter validation: ensure dialogue content is a string, not an object
        for (const part of script) {
            if (part.type === 'dialogue' && typeof part.content !== 'string') {
                return res.status(400).json({
                    message: `Invalid script format. Dialogue content must be a string, but received an object for a dialogue part.`,
                    errorPart: part
                });
            }
        }

        // 2. Set audio parameters from request or use defaults. The dependency on videoIdea is removed.
        const defaultVoiceOptions = {
            languageCode: 'en-US',
            name: 'en-US-Studio-O', // High-quality default voice
            speakingRate: 1.0,
            pitch: 0.0
        };

        const finalVoiceOptions = {
            voice: {
                languageCode: voiceOptions?.languageCode || defaultVoiceOptions.languageCode,
                name: voiceOptions?.name || defaultVoiceOptions.name
            },
            speakingRate: voiceOptions?.speakingRate || defaultVoiceOptions.speakingRate,
            pitch: voiceOptions?.pitch || defaultVoiceOptions.pitch
        };

        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'viral-audio-'));

        // 3. Generate audio using the audio composition service
        // This service correctly handles dialogue, sfx, and pauses.
        // For this endpoint, we'll focus on Google TTS for dialogue.
        // ElevenLabs integration within composeAudio would be a future enhancement.
        if (provider !== 'google') {
            // For now, we only support Google TTS through the composition service in this endpoint.
            // A future refactor could pass the provider down to the composition service.
            return res.status(400).json({ message: `Provider '${provider}' is not yet supported for structured script composition. Please use 'google'.` });
        }

        const audioFilePath = await audioCompositionService.composeAudio(
            script,
            tempDir,
            finalVoiceOptions
        ); 

        // 4. Read the final composed audio, save it, and prepare the response
        const buffer = await fs.readFile(audioFilePath);
        const audioDir = path.join(process.cwd(), 'public', 'assets', 'audio');
        await fs.mkdir(audioDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // Creates a file-safe timestamp like 2023-10-27T10-30-00-000Z
        const audioFileName = `viral_audio_${timestamp}.mp3`;
        const finalAudioPath = path.join(audioDir, audioFileName);
        await fs.writeFile(finalAudioPath, buffer);

        res.status(200).json({ fileUrl: `/assets/audio/${audioFileName}` });

    } catch (error) {
        console.error('Error in /viral-audio route:', error);
        next(error);
    } finally {
        // Ensure temporary directory is always cleaned up
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
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
        const base64Images = await geminiService.generateImage(prompt, characterDescription, '9:16', 1);
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
