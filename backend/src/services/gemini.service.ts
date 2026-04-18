// FIX: Import Buffer to resolve type errors in Node.js environment.
import { Buffer } from 'buffer';
import { GoogleGenAI, Type, GenerateImagesResponse } from "@google/genai";
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
// --- Feature Flag for Python Video Processor ---
// Set this to true to use the Python-based video processor, or false to use the original TypeScript one.
const USE_PYTHON_VIDEO_PROCESSOR = true;

import config from '../config';
// Local fallback roles to avoid importing frontend files into the backend runtime.
const roles: string[] = [
    'The Story Weaver (Emotional Core): Your focus is on emotion, vulnerability, and authenticity. Review the script to ensure it feels real, human, and sounds like a lived experience, not a sales pitch. Guard against marketing jargon and clichés.',
    'The Architect (Narrative & Experience Design): Your focus is on structure, pacing, and flow. Shape the emotional core into a coherent narrative. Suggest how visuals, pacing, and silence can amplify the emotion, ensuring the structure serves the story.',
    'The Resonance Strategist (Audience & Platform Insight): Your focus is on audience connection and platform performance. Analyze the concept for the target platform (e.g., TikTok, YouTube Shorts). Suggest optimizations for the hook, pacing, and captions to maximize retention and shareability while preserving authenticity.',
    'The Integrity Auditor (Quality & Consistency Check): Your focus is on quality and believability. Check for logical gaps, unclear transitions, or inconsistencies. Ensure the voiceover, visuals, and script are in perfect harmony to maintain audience trust.',
    'The Realist (Feasibility, Impact & Monetization): Your focus is on bridging creativity with business goals. Evaluate the concept\'s feasibility within practical constraints (time, cost, tools). Provide data-driven insights on its potential for monetization and suggest small tweaks to improve ROI without harming the story\'s emotional core.',
];
import { githubService } from './github.service';
 
import { sfxLibrary } from './sfx-library';
import fetch from 'node-fetch';
import { googleTtsService } from './tts.service';

interface ScriptPart {
    type: 'dialogue' | 'sfx' | 'pause';
    content: string | number;
}
// Reuse frontend types
interface Company { name: string; description: string; [key: string]: any; }
interface Scene {
    visualEffects: never[]; id: string; name: string; description: string; duration: string; effects: string; 
}
interface VideoIdea {
  scenes: Scene[];
  onScreenText?: { time: string; duration: string; text: string }[];
  script: ScriptPart[];
  voiceTone: string;
  visualStyle: string;
  [key: string]: any;
}
import { ffmpegEffectsService, EffectLayer } from './ffmpeg.effects.service';
import { audioCompositionService } from './audio.composition.service';
import { ffmpegFilterLibrary } from './ffmpeg.filter.library';

// --- Type Definitions for Microservice Communication ---
interface RenderSuccessResponse {
    status: 'success';
    path: string;
}

interface RenderErrorResponse {
    detail: string;
}


class GeminiService {
    private ai: GoogleGenAI;

    /**
     * Escapes text for use in an FFMPEG drawtext filter.
     * @param text The text to escape.
     * @returns The escaped text.
     */
    private escapeFfmpegText(text: string): string {
        return text
            .replace(/'/g, "'\\''") // Escape single quotes
            .replace(/:/g, '\\:')   // Escape colons
            .replace(/%/g, '\\%')   // Escape percentage signs
            .replace(/#/g, '\\#');  // Escape hashtags (comment character)
    }

    constructor(apiKey: string) {
        if (!apiKey) throw new Error("Gemini API key is not configured.");
        this.ai = new GoogleGenAI({ apiKey });
    }
    
    // --- Public Methods ---

    public async scanForCompanies(niche: string): Promise<any> {
        const schema = {
            type: Type.OBJECT,
            properties: {
                companies: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: { name: { type: Type.STRING }, description: { type: Type.STRING } },
                        required: ["name", "description"]
                    }
                }
            },
            required: ["companies"]
        };
        const prompt = `Search for companies with strong affiliate programs and highly-rated products in the '${niche}' niche. Provide a list of company names and a brief description for each.`;
        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json", responseSchema: schema }
        });
        if (!response.text) throw new Error('Empty response from Gemini');
        console.log('[AI Response - scanForCompanies]:', response.text);
        return JSON.parse(response.text);
    }

    /**
     * Generates images using the Imagen 4 model via the Gemini API.
     * @param prompt The base prompt for the image.
     * @param characterDescription An optional description for character consistency.
     * @param aspectRatio The desired aspect ratio of the image.
     * @param sampleCount The number of images to generate.
     * @returns A promise that resolves to an array of base64 encoded image strings.
     */
    public async generateImage(
        prompt: string,
        characterDescription: string | null,
        aspectRatio: string = '1:1',
        sampleCount: number = 1
    ): Promise<string[]> {
        
        // This logic is moved from your frontend to ensure consistency.
        const finalPrompt = characterDescription
            ? `${prompt}. The main character is: ${characterDescription}. Style: cinematic. IMPORTANT: Ensure the character in this image matches this description precisely.`
            : prompt;

        console.log(`Attempting to generate image for final prompt: "${finalPrompt}"`);

        try {
            const response: GenerateImagesResponse = await this.ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: finalPrompt,
                config: {
                    numberOfImages: sampleCount,
                    aspectRatio: aspectRatio as "1:1" | "9:16" | "16:9" | "4:3" | "3:4",
                    outputMimeType: 'image/jpeg',
                },
            });
            
            const images = response.generatedImages?.map(img => img.image?.imageBytes as string) ?? [];
            if (images.length === 0) throw new Error('No images were generated by the model.');
            return images;
        } catch (error: any) {
            console.error("Error generating image with @google/genai:", error.message);
            throw new Error(`Failed to generate image: ${error.message}`);
        }
    }

    public async generateMarketingInsights(companyName: string, companyDescription: string): Promise<any> {
        const schema = {
            type: Type.OBJECT,
            properties: {
                materials: { type: Type.STRING },
                toolkit: { type: Type.STRING }
            },
            required: ["materials", "toolkit"]
        };
        const prompt = `For the company '${companyName}', described as '${companyDescription}', generate a 'materials' and 'toolkit' summary for a content marketer. For 'materials', detail their target audience, key products/services, and brand voice. For 'toolkit', list their primary social media platforms, successful content formats, and core messaging angles.`;
        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json", responseSchema: schema }
        });
        if (!response.text) throw new Error('Empty response from Gemini');
        console.log('[AI Response - generateMarketingInsights]:', response.text);
        return JSON.parse(response.text);
    }
    
    public async runAiCollaboration(company: Company, selectedFramework: string): Promise<any> {
        const prompt = `For "${company.name}", a company described as "${company.description}", create a full viral video content plan using the "${selectedFramework}" framework. Respond ONLY with a valid JSON object.
        **RULES:**
        1.  **Integrated Scene Structure**: The root of the JSON MUST contain a 'scenes' array. Each object in this array represents a complete scene and MUST contain all visual and audio information for that scene. DO NOT create a separate 'script' array at the root level.
        2.  **Scene Properties**: Each scene object must have 'name', 'description' (for the visual), 'duration' (in seconds), and an 'audio' key.
        3.  **Audio Structure**: The 'audio' key within each scene MUST be an array of objects, each with a 'type' ('dialogue', 'sfx', 'music', or 'pause') and 'content'.
        4.  **SFX Constraint (RAG)**: For 'sfx' objects, you must choose the most appropriate sound effect from the following library based on its description. The 'content' of the 'sfx' object MUST be the 'name' of the chosen library item. Do NOT invent new sound effects.
            **SFX Library:** ${JSON.stringify(sfxLibrary)}
        5.  **Pause Constraint**: For 'pause' objects, 'content' MUST be the duration in seconds (e.g., {"type": "pause", "content": 1.5}).
        6.  **Root Properties**: The root JSON object should also contain the following keys: 'coreProblem', 'targetEmotion', 'videoLength', 'ctaGoal', 'voiceTone', 'visualStyle', 'musicPace', 'heading', 'hashtags', 'description', 'preferredPlatform'.
        7.  **Timing Synchronization**: The total duration of all scenes MUST equal the 'videoLength'. The total duration of audio elements (dialogue + pauses) within each scene should be close to that scene's duration.`;
        
       const response = await this.ai.models.generateContent({
           model: 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: "application/json" }
       });
       if (!response.text) throw new Error('Empty response from Gemini on initial video idea generation.');
       console.log('[AI Response - runAiCollaboration - Initial Idea]:', response.text);
       return JSON.parse(response.text);
    }
    
    public async refineVideoIdea(videoIdea: any): Promise<any> {
        const feedbackLog: string[] = [];
        for (const role of roles) {
            const feedbackPrompt = `You are a "${role}". Critique this video concept: ${JSON.stringify(videoIdea)}. Provide concise, actionable feedback based on your role.`;
            const feedbackResponse = await this.ai.models.generateContent({ model: 'gemini-2.5-flash', contents: feedbackPrompt });
            const feedbackText = feedbackResponse.text ?? '';
            console.log(`[AI Feedback - ${role.split(':')[0]}]:`, feedbackText);
            feedbackLog.push(`[${role.split(':')[0]}]: ${feedbackText}`);
        }

        const finalPrompt = `You are a Creative Director. Refine this initial video concept: ${JSON.stringify(videoIdea)} using this feedback from your team: ${feedbackLog.join('\n')}. Your final output MUST be a single, valid JSON object and nothing else.
        **CRITICAL REFINEMENT RULES:**
        1.  **Enforce Integrated Structure**: Your primary task is to ensure the final JSON has a single 'scenes' array. Each scene object MUST contain all its visual and audio information. There must NOT be a separate 'script' array at the root level.
        2.  **Deconstruct for Static Images**: Each scene object in the 'scenes' array MUST represent a single, static photograph. The 'description' must describe a still image, not a video clip. Break down any scene that implies movement into multiple, distinct scene objects.
        3.  **Add Visual & Text Keys**: For each scene object, add a "visualEffects" key (an array of descriptive strings like "cinematic lighting") and an "onScreenText" key (a string containing any text to be displayed).
        4.  **Audio Structure**: Ensure the 'audio' key in each scene is a correctly formatted array of objects, each with a 'type' ('dialogue', 'sfx', 'music', 'pause') and 'content'.
        5.  **SFX Constraint (RAG)**: For 'sfx' objects, the 'content' MUST be a single, exact 'name' string chosen EXCLUSIVELY from the 'name' field of an object in the following library. Do NOT use descriptions or invent new sound effects.
            **SFX Library:** ${JSON.stringify(sfxLibrary)}
        6.  **Synchronize Timing**: The total duration of all scenes must equal the 'videoLength'. Adjust 'pause' objects within each scene's 'audio' array to ensure perfect timing.`;

        const finalResponse = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: finalPrompt,
            config: { responseMimeType: "application/json" }
        });

        if (!finalResponse.text) {
            throw new Error('Empty final response from Gemini during refinement.');
        }

        console.log('[AI Response - Refined Idea]:', finalResponse.text);
        const jsonString = this._extractJson(finalResponse.text);
        if (!jsonString) {
             throw new Error("Failed to extract JSON from Gemini response during refinement.");
        }
        return JSON.parse(jsonString);
    }

    public async findBestSfxMatch(description: string): Promise<string | null> {
        const prompt = `
            You are an audio engineer's assistant. Your task is to find the best sound effect from a library based on a description.
            Analyze the user's description and choose the single best match from the 'name' field of the provided SFX library.

            **User's Description:** "${description}"

            **SFX Library:**
            ${JSON.stringify(sfxLibrary, null, 2)}

            **Instructions:**
            1. Read the user's description carefully.
            2. Compare it to the 'description' of each item in the library.
            3. Respond with ONLY the 'name' of the single best matching item. For example: "chime-notification".
            4. If no reasonable match is found, respond with "null".
        `;
        const response = await this.ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        const match = response.text?.trim();
        return match && match !== 'null' ? match.replace(/"/g, '') : null;
    }

    public async generateCharacterDescription(videoIdea: VideoIdea): Promise<string> {
        const prompt = `Based on the following video idea, create a concise, consistent description of the main character. This description will be used to generate images for every scene. Focus on visual details like age, gender, hair, clothing style, and ethnicity to ensure consistency.

        Video Script: ${JSON.stringify(videoIdea.script, null, 2)}
        Visual Style: ${videoIdea.visualStyle}
        Scenes: ${videoIdea.scenes.map(s => s.description).join(', ')}

        Respond with ONLY the character description. For example: "A woman in her late 20s with messy brown hair, wearing a simple grey hoodie and glasses, looking tired but hopeful."`;
        
        const response = await this.ai.models.generateContent({model: 'gemini-2.5-flash', contents: prompt});
        if (!response.text) return '';
        console.log('[AI Response - generateCharacterDescription]:', response.text);
        return response.text.trim();
    }
    
    /**
     * Validates an FFMPEG filter graph by running a dry-run command.
     * @param command The FFMPEG filter graph string to validate.
     * @returns A promise that resolves to an object with validation status and error message if any.
     */
    private async validateFfmpegCommand(command: string): Promise<{ isValid: boolean; error?: string }> {
        // A simple check for placeholder or error commands.
        if (!command || command.startsWith('Error:') || command.trim() === '{}') {
            return { isValid: false, error: 'Generated command was empty or an error placeholder.' };
        }

        return new Promise((resolve) => {
            // Use a null source and null output to test the filter graph without creating files.
            // This is a "dry run" to check for syntax/filter errors.
            const args = [
                '-f', 'lavfi', '-i', 'nullsrc=s=1080x1920:d=1', // Dummy 1s video input
                '-vf', command,
                '-t', '1',          // Process for only 1 second
                '-f', 'null',      // Discard output
                '-'
            ];

            const ffmpegProcess = spawn('ffmpeg', args);
            let stderr = '';

            ffmpegProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({ isValid: true });
                } else {
                    // Filter out verbose but non-critical messages to get the root error.
                    const errorLines = stderr.split('\n').filter(line => line.trim().length > 0 && !line.startsWith('frame='));
                    resolve({ isValid: false, error: errorLines.join('\n') });
                }
            });

            ffmpegProcess.on('error', (err) => {
                // This happens if ffmpeg is not installed or can't be started.
                resolve({ isValid: false, error: `Failed to start FFmpeg process: ${err.message}` });
            });
        });
    }

    public async generateSingleImage(payload: { sceneDescription: string, visualStyle: string, characterDescription: string | null, visualEffects: string[], outputPath: string }): Promise<{ localPath: string }> {
        const { sceneDescription, visualStyle, characterDescription, visualEffects, outputPath } = payload;
        const effectsString = visualEffects.join(', ');

        const prompt = characterDescription
            ? `${sceneDescription}. The main character is: ${characterDescription}. Style: ${visualStyle}, ${effectsString}. IMPORTANT: Ensure the character in this image matches this description precisely.`
            : `${sceneDescription}. Style: ${visualStyle}, ${effectsString}.`;

        const response = await this.ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '9:16' },
        });

        const img = response.generatedImages?.[0];

        // FIX: Use a type guard to ensure 'img', 'img.image', and 'img.image.imageBytes' are defined.
        // This allows TypeScript to correctly narrow the type for subsequent access.
        if (!img?.image?.imageBytes) {
            throw new Error('No valid image data was returned from the AI model.');
        }
        
        const imageBuffer = Buffer.from(img.image.imageBytes, 'base64');
        await fs.writeFile(outputPath, imageBuffer);

        return { localPath: outputPath };
    }

    /**
     * A lightweight, fluent-style builder for creating complex FFMPEG commands.
     * This avoids manual string concatenation and the limitations of unmaintained libraries.
     */
    private ffmpegCommandBuilder() {
        const inputs: { path: string, options: string[] }[] = [];
        const complexFilter: string[] = [];
        const outputOptions: string[] = [];
        let outputPath = '';

        const builder = {
            addInput: (path: string, options: string[] = []) => {
                inputs.push({ path, options });
                return builder;
            },
            addFilter: (filterString: string) => {
                complexFilter.push(filterString);
                return builder;
            },
            setComplexFilter: (filters: string[]) => {
                complexFilter.push(...filters);
                return builder;
            },
            addOutputOption: (option: string) => {
                outputOptions.push(option);
                return builder;
            },
            setOutputPath: (path: string) => {
                outputPath = path;
                return builder;
            },
            build: (): string[] => {
                const args: string[] = [];

                // Add inputs and their options
                inputs.forEach(input => {
                    args.push(...input.options, '-i', input.path);
                });

                // Add complex filter graph
                if (complexFilter.length > 0) {
                    args.push('-filter_complex', complexFilter.join(';'));
                }

                // Add output options
                args.push(...outputOptions);

                // Add output path
                if (outputPath) {
                    args.push(outputPath);
                }

                return args;
            }
        };

        return builder;
    }

    /**
     * Searches for a file in a predefined list of directories and returns the valid path.
     * @param filename The name of the file to find.
     * @returns The full, correct path to the file.
     * @throws An error if the file is not found in any of the specified directories.
     */
    private findAssetPath(filename: string): string {
        const projectRoot = path.join(__dirname, '..', '..');
        // Define the directories to search in, in order of priority.
        const searchDirs = [
            path.join(projectRoot, 'public', 'assets', 'images'),
            path.join(projectRoot, 'public', 'downloads', 'images')
        ];

        for (const dir of searchDirs) {
            const potentialPath = path.join(dir, filename);
            if (require('fs').existsSync(potentialPath)) {
                return potentialPath; // Return the first path that exists.
            }
        }

        // If the loop finishes, the file was not found.
        throw new Error(`Asset "${filename}" not found in any of the search directories: ${searchDirs.join(', ')}`);
    }

    private async createVideoWithMicroservice(imageFiles: { path: string, duration: number, ffmpegCommand?: string, onScreenText?: string }[], audioFile: string, outputPath: string): Promise<string> {
        return new Promise(async (resolve, reject) => {
            console.log('Routing video creation to Python microservice...');

            // FIX: The `findAssetPath` function is only for pre-existing assets in /public.
            // The image files passed here are newly generated in a temp directory.
            // We just need to ensure their paths are absolute, which `path.resolve` does.
            const resolvedImageFiles = imageFiles.map(file => {
                return {
                    ...file,
                    path: path.resolve(file.path) // Ensure the path is absolute.
                };
            });

            // The audio file path and output path also need to be absolute.
            const resolvedAudioFile = path.resolve(audioFile);
            const resolvedOutputPath = path.resolve(outputPath);
            
            const payload = {
                imageFiles: resolvedImageFiles,
                audioFile: resolvedAudioFile,
                outputPath: resolvedOutputPath
            };

            const rendererUrl = 'http://localhost:8001/render'; // URL of the new Python service
            console.log(`Sending render request to ${rendererUrl}`);
            
            // --- DEBUG LOGGING: Inspect the payload before sending ---
            // This will show the exact data being sent to the Python service.
            console.log('--- PAYLOAD SENT TO PYTHON ---');
            console.log(JSON.stringify(payload, null, 2));
            console.log('------------------------------');

            try {
                const response = await fetch(rendererUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                const result = await response.json() as RenderSuccessResponse | RenderErrorResponse;

                if (response.ok) {
                    console.log('Microservice finished successfully:', result);
                    resolve((result as RenderSuccessResponse).path);
                } else {
                    console.error('Microservice returned an error:', result);
                    // FIX: The 'detail' from a FastAPI validation error is an array of objects.
                    // We need to stringify it to get a readable error message.
                    const errorDetail = (result as RenderErrorResponse).detail;
                    const errorMessage = typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail, null, 2);

                    reject(new Error(`Python microservice failed: ${errorMessage || 'Unknown error'}`));
                }
            } catch (error: any) {
                reject(new Error(`Failed to connect to Python microservice: ${error.message}`));
            }
        });
    }

    public async createVideoFromAssets(imageFiles: { path: string, duration: number, ffmpegCommand?: string, onScreenText?: string }[], audioFile: string, outputPath: string): Promise<string> {
        if (USE_PYTHON_VIDEO_PROCESSOR) {
            return this.createVideoWithMicroservice(imageFiles, audioFile, outputPath);
        }
        return new Promise((resolve, reject) => {
            const commandBuilder = this.ffmpegCommandBuilder();
            // 1. Add image and audio inputs, validating image paths
            imageFiles.forEach(file => {
                try {
                    const imageName = path.basename(file.path);
                    const validPath = this.findAssetPath(imageName);
                    commandBuilder.addInput(validPath, ['-loop', '1', '-t', `${file.duration}`]);
                } catch (error) {
                    // If an image is not found, reject the promise immediately.
                    return reject(error);
                }
            });
            commandBuilder.addInput(audioFile);

            // 2. Build the complex filter graph parts
            const filterParts: string[] = [];
            imageFiles.forEach((file, index) => {
                const isCommandValid = typeof file.ffmpegCommand === 'string' &&
                    file.ffmpegCommand &&
                    file.ffmpegCommand.trim() !== '{}' &&
                    file.ffmpegCommand.trim() !== '';

                let vfCommand = isCommandValid
                    ? file.ffmpegCommand!
                    : `fade=in:st=0:d=0.5,fade=out:st=${(file.duration - 0.5).toFixed(1)}:d=0.5,format=yuv420p`;

                if (file.onScreenText) {
                    const fontPath = 'C:/Windows/Fonts/Arial.ttf'; // NOTE: This path is OS-dependent. For cross-platform, use a bundled font.
                    const escapedText = this.escapeFfmpegText(file.onScreenText);
                    const drawTextFilter = `drawtext=fontfile='${fontPath}':text='${escapedText}':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10`;
                    vfCommand = vfCommand.includes('format=yuv420p')
                        ? vfCommand.replace('format=yuv420p', `${drawTextFilter},format=yuv420p`)
                        : `${vfCommand},${drawTextFilter}`;
                }

                const baseFilter = `[${index}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1`;
                filterParts.push(`${baseFilter}[scaled${index}]`);
                filterParts.push(`[scaled${index}]${vfCommand}[v${index}]`);
            });

            // Add concatenation filter
            const concatFilter = imageFiles.map((_, index) => `[v${index}]`).join('') + `concat=n=${imageFiles.length}:v=1:a=0[v]`;
            filterParts.push(concatFilter);

            commandBuilder.setComplexFilter(filterParts);

            // 3. Map streams, set output options, and build the final command
            commandBuilder.addOutputOption('-map').addOutputOption('[v]');
            commandBuilder.addOutputOption('-map').addOutputOption(`${imageFiles.length}:a`);
            commandBuilder.addOutputOption('-c:v').addOutputOption('libx264');
            commandBuilder.addOutputOption('-c:a').addOutputOption('aac');
            commandBuilder.addOutputOption('-pix_fmt').addOutputOption('yuv420p');
            commandBuilder.addOutputOption('-r').addOutputOption('30');
            commandBuilder.addOutputOption('-shortest');
            commandBuilder.setOutputPath(outputPath);

            const args = commandBuilder.build();

            // 4. Spawn the process and handle events
            console.log('Spawning FFmpeg with args:', ['ffmpeg', ...args].join(' '));
            const ffmpegProcess = spawn('ffmpeg', args);
            let stderr = '';

            ffmpegProcess.stderr.on('data', (data) => {
                stderr += data.toString();
                console.log(`FFmpeg stderr: ${data}`); // For real-time logging
            });

            ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('FFMPEG processing finished successfully.');
                    resolve(outputPath);
                } else {
                    reject(new Error(`FFmpeg process exited with code ${code}:\n${stderr}`));
                }
            });

            ffmpegProcess.on('error', (err) => {
                reject(new Error(`Failed to start FFmpeg process: ${err.message}`));
            });
        });
    }

    public async performTextUtility(task: string, data: any): Promise<any> {
        switch (task) {
            case 'analyzeRenderError':
                return this.analyzeRenderError(data);
            case 'formatBody':
                return this.formatJsonBody(data.body);
            case 'suggestHeaders':
                return this.suggestHttpHeaders(data.body);
            case 'suggestFix':
                return this.suggestApiFix(data);
            default:
                throw new Error(`Unknown text utility task: ${task}`);
        }
    }

    public async formatJsonBody(body: string): Promise<string> {
        try {
            const parsed = JSON.parse(body);
            return JSON.stringify(parsed, null, 2);
        } catch (e) {
            return body; // Not JSON, return as is.
        }
    }

    public async suggestHttpHeaders(body: string): Promise<string> {
        const prompt = `
            Based on the following request body, suggest appropriate HTTP headers.
            If the body is JSON, suggest "Content-Type: application/json".
            Always include a User-Agent.
            Provide ONLY the headers, one per line (e.g., "Header-Name: value").

            Body:
            ${body}
        `;
        const response = await this.ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        if (!response.text) throw new Error("Failed to get analysis from Gemini for the render error.");
        console.log('[AI Response - suggestHttpHeaders]:', response.text);
        return response.text.trim();
    }

    public async suggestApiFix(data: any): Promise<any> {
        const { baseUrl, endpoint, headers, requestBody, responseBody } = data;
        const prompt = `
            I made an API request and got an error. Here are the details:
            - Base URL: ${baseUrl}
            - Endpoint: ${endpoint}
            - Headers:\n${headers}
            - Request Body:\n${requestBody}
            - Response Body:\n${responseBody}

            Analyze the request and response, and suggest a fix. Your response must be a JSON object with three optional keys: "updatedEndpoint", "updatedHeaders", "updatedBody", and a mandatory key "explanation".
            - "explanation": A clear, concise explanation of the problem and the fix.
            - "updated...": Only include a key if you are changing its value.

            Example response if the endpoint was wrong:
            {
                "updatedEndpoint": "/api/v2/users",
                "explanation": "The endpoint '/api/v1/users' seems to be deprecated. I've updated it to '/api/v2/users' which is the current version."
            }
        `;
        const response = await this.ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            },
        });
        
        const responseText = response.text;
        if (!responseText) {
            throw new Error("Failed to get a valid text response from Gemini for API fix suggestion.");
        }
        console.log('[AI Response - suggestApiFix]:', responseText);
        const jsonString = this._extractJson(response.text);
        if (!jsonString) {
             throw new Error("Failed to extract JSON from Gemini response for API fix suggestion.");
        }
        return JSON.parse(jsonString);
    }

    private _extractJson(text: string): string {
        const match = text.match(/```json\n([\s\S]*?)\n```/);
        return match ? match[1].trim() : text.trim();
    }

    public async analyzeRenderError(data: any): Promise<string> {
        const { error, request } = data;
        const prompt = `
            You are an expert FFMPEG and backend engineer. A video rendering process failed.
            Analyze the following error message and the request payload that was sent to the rendering endpoint.

            **Error Message:**
            \`\`\`
            ${error}
            \`\`\`

            **Request Payload (sent to the rendering service):**
            \`\`\`json
            ${JSON.stringify(request, null, 2)}
            \`\`\`

            **Your Task:**
            1.  Identify the root cause of the error. Be specific. For FFMPEG errors, point to the exact filter or parameter that is wrong.
            2.  Provide a clear, step-by-step solution.
            3.  If the error is in the FFMPEG command, provide the corrected command.
            4.  Format your response as a JSON object with two keys: "analysis" and "solution".

            **Example JSON Output:**
            \`\`\`json
            {
              "analysis": "The FFMPEG error 'Filter not found' for 'frei0r_ripple' indicates an incorrect filter name was used. The frei0r filter library syntax requires 'frei0r=filtername', not an underscore.",
              "solution": "The FFMPEG command for the scene with the 'ripple' effect needs to be corrected. The prompt used to generate the command should be updated to enforce the 'frei0r=ripple' syntax. The corrected FFMPEG filter string would be 'frei0r=ripple:amplitude=0.05,format=yuv420p'."
            }
            \`\`\`
        `;

        const response = await this.ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });

        if (!response.text) throw new Error("Failed to get analysis from Gemini for the render error.");
        console.log('[AI Response - analyzeRenderError]:', response.text);
        // The response is expected to be a JSON string, but let's parse it to ensure it's valid
        // before returning, which also helps in catching malformed AI responses early.
        // The return type of the outer function is `any`, so we return the parsed object.
        const jsonString = this._extractJson(response.text);
        if (!jsonString) throw new Error("Failed to extract JSON from Gemini's error analysis.");
        return JSON.parse(jsonString);
    }

    public async generateAndSaveAssets(company: Company, videoIdea: VideoIdea, audioFilePath: string): Promise<string> {
        const generationId = Date.now().toString();
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'narrative-nexus-'));
        console.log(`Created temporary directory for assets: ${tempDir}`);
        
        const characterDescription = await this.generateCharacterDescription(videoIdea);
        
        // 1. Generate FFMPEG commands from the local library
        // NOTE: This assumes the audio has been generated separately and its path will be provided
        // to the video rendering step. This function no longer creates the audio.
        // REMOVED AI DEPENDENCY: We now look up the command from our local library.
        const ffmpegCommandsMap: Record<string, string> = {};
        for (const scene of videoIdea.scenes) {
            const effectName = scene.effects || 'default'; // Fallback to a default effect
            const duration = parseFloat(scene.duration);
            // Look up the filter in the library. If it exists, generate the command.
            // If not, or if the frontend provides a full command, we'd use that.
            // For now, we assume `scene.effects` is a name from our library.
            const commandGenerator = ffmpegFilterLibrary[effectName] || ffmpegFilterLibrary.default;
            ffmpegCommandsMap[scene.id] = commandGenerator(duration);
        }
        console.log('Generated FFMPEG commands from local library:', ffmpegCommandsMap);

        // 2. Generate and save image for each scene directly into the temp directory
        const imageFilePaths: {path: string, duration: number, ffmpegCommand: string, onScreenText?: string}[] = [];
        for (const [index, scene] of videoIdea.scenes.entries()) {
            const scenePrompt = index === 0
                ? `${scene.name}: ${scene.description}`
                : scene.description;
            
            const tempImagePath = path.join(tempDir, `scene_${index}.jpg`);
            await this.generateSingleImage({ 
                sceneDescription: scenePrompt, 
                visualStyle: videoIdea.visualStyle, 
                characterDescription, 
                visualEffects: scene.visualEffects || [],
                outputPath: tempImagePath
            });

            // FIX: Construct the payload object explicitly to prevent serialization errors.
            // The previous implementation had a subtle bug where an undefined `onScreenText`
            // could cause the `ffmpegCommand` to be serialized incorrectly as an empty object. This ensures a default string is always present.
            const imagePayload: { path: string; duration: number; ffmpegCommand: string; onScreenText?: string } = {
                path: tempImagePath,
                duration: parseFloat(scene.duration) || 3,
                // CRITICAL FIX: Ensure a default string is provided if the map lookup is undefined.
                ffmpegCommand: ffmpegCommandsMap[scene.id] || 'format=yuv420p',
            };

            const onScreenTextObject = videoIdea.onScreenText?.find(txt => {
                const sceneStartTime = videoIdea.scenes.slice(0, index).reduce((acc, s) => acc + parseFloat(s.duration), 0);
                const sceneEndTime = sceneStartTime + parseFloat(scene.duration);
                return parseFloat(txt.time) >= sceneStartTime && parseFloat(txt.time) < sceneEndTime;
            });

            if (onScreenTextObject?.text) {
                imagePayload.onScreenText = onScreenTextObject.text;
            }
            imageFilePaths.push(imagePayload);
        }

        // 3. Create the video using the generated assets
        const videoOutputPath = path.join(tempDir, 'output.mp4');
        await this.createVideoFromAssets(imageFilePaths, audioFilePath, videoOutputPath); // CRITICAL FIX: Use the provided audioFilePath

        // 4. Save final assets to GitHub
        const videoBuffer = await fs.readFile(videoOutputPath);
        const videoFileName = `${company.name.toLowerCase().replace(/\s+/g, '_')}_${generationId}.mp4`;
        if (githubService) await githubService.saveAsset('video', videoFileName, videoBuffer.toString('base64'));

        for (const [index, img] of imageFilePaths.entries()) {
            const scene = videoIdea.scenes[index];
            const sceneName = scene.name.toLowerCase().replace(/\s+/g, '_');
            const imageFileName = `${sceneName}_${generationId}_${index}.jpg`;
            const imageContent = await fs.readFile(img.path);
            if (githubService) await githubService.saveAsset('image', imageFileName, imageContent.toString('base64'));
        }

        // 5. Clean up temporary directory
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log(`Cleaned up temporary directory: ${tempDir}`);

        // Return the path or URL of the final video saved to GitHub
        return `path/to/github/video/${videoFileName}`; // Placeholder return value
    }
}


export const geminiService = new GeminiService(config.apiKeys.gemini!);
