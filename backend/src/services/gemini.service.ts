// FIX: Import Buffer to resolve type errors in Node.js environment.
import { Buffer } from 'buffer';
import { GoogleGenAI, Type } from "@google/genai";
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
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
import { elevenlabsService } from './elevenlabs.service';
import { ffmpegEffectsService, EffectLayer } from './ffmpeg.effects.service';

import fetch from 'node-fetch';

// Reuse frontend types
interface Company { name: string; description: string; [key: string]: any; }
interface Scene { id: string; name: string; description: string; duration: string; effects: string; }
interface VideoIdea {
  scenes: Scene[];
  onScreenText?: { time: string; duration: string; text: string }[];
  script: string;
  voiceTone: string;
  visualStyle: string;
  [key: string]: any;
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
        return JSON.parse(response.text);
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
        return JSON.parse(response.text);
    }
    
    public async runAiCollaboration(company: Company): Promise<any> {
        const initialPrompt = `For "${company.name}", a company described as "${company.description}", create a full viral video content plan. The plan should feel emotionally authentic and human, not like a sales pitch. Use the "Unfiltered Human Moment" framework. Respond ONLY with a valid JSON object based on the VideoIdea interface. The JSON should have keys: coreProblem, targetEmotion, scenes (an array of objects with name, description, duration, effects), script, numberOfImages, videoLength, ctaGoal, voiceTone, visualStyle, musicPace, heading, hashtags, description, preferredPlatform (an array).`;
        
       const initialResponse = await this.ai.models.generateContent({
           model: 'gemini-2.5-flash', contents: initialPrompt, config: { responseMimeType: "application/json" }
       });
       if (!initialResponse.text) throw new Error('Empty initial response from Gemini');
       let currentVideoIdea = JSON.parse(initialResponse.text);

        const feedbackLog: string[] = [];
        for (const role of roles) {
            const feedbackPrompt = `You are a "${role}". Critique this video concept: ${JSON.stringify(currentVideoIdea)}. Provide concise, actionable feedback based on your role.`;
            const feedbackResponse = await this.ai.models.generateContent({ model: 'gemini-2.5-flash', contents: feedbackPrompt });
            feedbackLog.push(`[${role.split(':')[0]}]: ${feedbackResponse.text ?? ''}`);
        }

        const finalPrompt = `You are a Creative Director. Refine this initial concept: ${JSON.stringify(currentVideoIdea)} using this feedback from your team: ${feedbackLog.join('\n')}. Output ONLY the final, updated JSON object. Ensure it is a single, valid JSON object and nothing else.`;
        const finalResponse = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash', contents: finalPrompt, config: { responseMimeType: "application/json" }
        });
        if (!finalResponse.text) throw new Error('Empty final response from Gemini');
        return JSON.parse(finalResponse.text);
    }
    
    public async generateCharacterDescription(videoIdea: VideoIdea): Promise<string> {
        const prompt = `Based on the following video idea, create a concise, consistent description of the main character. This description will be used to generate images for every scene. Focus on visual details like age, gender, hair, clothing style, and ethnicity to ensure consistency.

        Video Script: ${videoIdea.script}
        Visual Style: ${videoIdea.visualStyle}
        Scenes: ${videoIdea.scenes.map(s => s.description).join(', ')}

        Respond with ONLY the character description. For example: "A woman in her late 20s with messy brown hair, wearing a simple grey hoodie and glasses, looking tired but hopeful."`;
        
        const response = await this.ai.models.generateContent({model: 'gemini-2.5-flash', contents: prompt});
        if (!response.text) return '';
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

    public async generateFfmpegCommands(scenes: { id: string, effect: string, duration: string }[]): Promise<Record<string, string>> {
        // Using @sinclair/typebox would be a great refactor, but for now, let's fix the native schema.
        // The key is to remove `additionalProperties` from the top-level `params` object
        // and define it as a flexible record-like structure.
        const effectLayerSchema = {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING, description: "The name of the effect, e.g., 'zoom', 'gaussianBlur', 'shake'." },
                startTime: { type: Type.NUMBER, description: "Start time of the effect in seconds from the beginning of the clip." },
                endTime: { type: Type.NUMBER, description: "End time of the effect in seconds from the beginning of the clip." },
                params: {
                    type: Type.OBJECT,
                    nullable: true, // Allow params to be omitted for effects like 'vignette'
                    description: "A dictionary of parameters for the effect. Values can be static or an object for animation.",
                    // FIX: Explicitly define all possible parameter keys to satisfy the API's non-empty `properties` rule.
                    properties: {
                        level: {
                            oneOf: [{ type: Type.NUMBER }, {
                                type: Type.OBJECT,
                                properties: { start: { type: Type.NUMBER }, end: { type: Type.NUMBER }, easing: { type: Type.STRING } },
                                required: ['start', 'end']
                            }]
                        },
                        direction: { type: Type.STRING },
                        type: { type: Type.STRING },
                        sigma: {
                            oneOf: [{ type: Type.NUMBER }, {
                                type: Type.OBJECT,
                                properties: { start: { type: Type.NUMBER }, end: { type: Type.NUMBER }, easing: { type: Type.STRING } },
                                required: ['start', 'end']
                            }]
                        },
                        intensity: {
                            oneOf: [{ type: Type.NUMBER }, {
                                type: Type.OBJECT,
                                properties: { start: { type: Type.NUMBER }, end: { type: Type.NUMBER }, easing: { type: Type.STRING } },
                                required: ['start', 'end']
                            }]
                        }
                    }
                },
            },
            required: ['name', 'startTime', 'endTime'], // `params` is correctly optional
        };

        const sceneEffectSchema = {
            type: Type.OBJECT,
            // Add id to the schema for each item in the array
            properties: {
                id: { type: Type.STRING },
                effects: { type: Type.ARRAY, items: effectLayerSchema }
            },
            required: ['id', 'effects']
        };

        const responseSchema = {
            // The root of the response is now an ARRAY of scene effects
            type: Type.ARRAY,
            items: sceneEffectSchema
        };

        const prompt = `
            You are an expert video effect analyst. Your task is to deconstruct a natural language effect description into a structured, machine-readable JSON array of effect layers.

            **Available Effect Names and their Parameters:**
            - **zoom**: params: { level: { start: 1.0, end: 1.2 } } // level > 1 is zoom in, < 1 is zoom out
            - **pan**: params: { direction: 'left' | 'right' | 'up' | 'down' }
            - **fade**: params: { type: 'in' | 'out' }
            - **gaussianBlur**: params: { sigma: { start: 5, end: 0 } } // sigma is the blur intensity
            - **shake**: params: { intensity: { start: 4, end: 0 } } // intensity is pixel displacement
            - **vignette**: params: {} // No parameters needed
            - **fisheye_wobble**: params: {} // No parameters needed

            **Rules:**
            1. Your response MUST be a JSON array.
            2. Each object in the array represents a scene and MUST contain an "id" and an "effects" key.
            3. The "effects" key must be an array of effect layer objects.
            4. Each effect layer object must have a 'name', 'startTime', and 'endTime'.
            5. 'startTime' and 'endTime' are in seconds, relative to the clip's own duration.
            6. For animated effects (like a blur that fades), use a parameter object with 'start', 'end', and an optional 'easing' ('linear', 'easeIn', 'easeOut', 'easeInOut').
            7. For static effects or simple directional effects, use a direct value (e.g., "direction": "right").
            8. Always try your best to represent the effect using the available primitives. Do not invent new effect names.
            9. Respond ONLY with a valid JSON array matching the schema.

            **Example Request:**
            [{"id": "scene_1", "effect": "Start with a dreamy, soft focus that slowly sharpens over the first 3 seconds. Simultaneously, do a slow zoom-in across the entire 5-second clip."}]

            **Example Response:**
            [
              { "id": "scene_1", "effects": [ { "name": "gaussianBlur", "startTime": 0, "endTime": 3, "params": { "sigma": { "start": 5, "end": 0 } } }, { "name": "zoom", "startTime": 0, "endTime": 5, "params": { "level": { "start": 1.0, "end": 1.15 } } } ] }
            ]

            **INPUT SCENES:**
            ${JSON.stringify(scenes.map(s => ({id: s.id, effect: s.effect})), null, 2)}
        `;

        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json", responseSchema: responseSchema, temperature: 0.0 }
        });

        if (!response.text) throw new Error('AI classification for FFMPEG effects failed.');

        const structuredEffectsArray: {id: string, effects: EffectLayer[]}[] = JSON.parse(response.text);

        const finalCommands: Record<string, string> = {};

        // Create a map for easy lookup
        const effectsMap = new Map(structuredEffectsArray.map(item => [item.id, item.effects]));

        for (const scene of scenes) {
            const effectLayers = effectsMap.get(scene.id);
            if (Array.isArray(effectLayers) && effectLayers.length > 0) {
                console.log(`[${scene.id}] Composing effect from structured layers:`, effectLayers);
                finalCommands[scene.id] = ffmpegEffectsService.composer.compose(effectLayers as EffectLayer[], { duration: parseFloat(scene.duration), width: 1080, height: 1920 });
            } else {
                console.log(`[${scene.id}] No valid effect layers found for '${scene.effect}'. Applying default format.`);
                // This handles cases where the AI might fail to return an entry for a specific scene ID.
                // Apply a default, safe filter if AI fails to provide a structure
                finalCommands[scene.id] = 'format=yuv420p';
            }
        }

        console.log('Final FFMPEG commands:', finalCommands);

        return finalCommands;
    }

    public async generateSingleImage(payload: { sceneDescription: string, visualStyle: string, characterDescription: string | null }): Promise<string> {
        const { sceneDescription, visualStyle, characterDescription } = payload;
        const prompt = characterDescription
            ? `${sceneDescription}. The main character is: ${characterDescription}. Style: ${visualStyle}. IMPORTANT: Ensure the character in this image matches this description precisely.`
            : `${sceneDescription}, ${visualStyle}`;

        const response = await this.ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '9:16' },
        });
        if (!response.generatedImages || response.generatedImages.length === 0) throw new Error('No images generated');
        const img = response.generatedImages[0];
        if (!img || !img.image || !img.image.imageBytes) throw new Error('Malformed image response');
        return img.image.imageBytes as string;
    }

    public async createVideoFromAssets(imageFiles: { path: string, duration: number, ffmpegCommand?: string, onScreenText?: string }[], audioFile: string, outputPath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const args: string[] = [];

            // 1. Add all image inputs
            imageFiles.forEach(file => {
                // For each image, specify it's a looped single-frame input with a specific duration
                args.push('-loop', '1', '-t', `${file.duration}`, '-i', file.path);
            });

            // 2. Add audio input
            args.push('-i', audioFile);

            // 3. Build the complex filter string
            const filterComplexParts = imageFiles.map((file, index) => {
                // FIX: Ensure ffmpegCommand is a string before calling .trim() or other string methods.
                const isCommandValid = typeof file.ffmpegCommand === 'string' &&
                    file.ffmpegCommand &&
                    file.ffmpegCommand.trim() !== '{}' &&
                    file.ffmpegCommand.trim() !== '';

                let vfCommand = isCommandValid
                    // If a command exists, treat it as the primary filter.
                    // The comma ensures it's correctly chained with the subsequent format filter.
                    ? file.ffmpegCommand!
                    // Otherwise, use a default fade in/out.
                    : `fade=in:st=0:d=0.5,fade=out:st=${(file.duration - 0.5).toFixed(1)}:d=0.5,format=yuv420p`;

                if (file.onScreenText) {
                    const fontPath = 'C:/Windows/Fonts/Arial.ttf'; // Example for Windows. Use a reliable, cross-platform path or ensure font is available.
                    const escapedText = this.escapeFfmpegText(file.onScreenText);
                    const drawTextFilter = `drawtext=fontfile='${fontPath}':text='${escapedText}':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10`;
                    // If the command already has a format filter, insert drawtext before it.
                    if (vfCommand.includes('format=yuv420p')) {
                        vfCommand = vfCommand.replace('format=yuv420p', `${drawTextFilter},format=yuv420p`);
                    } else {
                        // Otherwise, append it.
                        vfCommand += `,${drawTextFilter}`;
                    }
                }

                // The base filter chain for scaling and padding.
                const baseFilter = `[${index}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1`;

                return `${baseFilter}[scaled${index}];[scaled${index}]${vfCommand}[v${index}]`;
            });

            const concatFilter = imageFiles.map((_, index) => `[v${index}]`).join('') + `concat=n=${imageFiles.length}:v=1:a=0[v]`;
            const fullFilter = `${filterComplexParts.join(';')};${concatFilter}`;

            args.push('-filter_complex', fullFilter);

            // 4. Map streams and set output options
            args.push(
                '-map', '[v]',
                '-map', `${imageFiles.length}:a`,
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-pix_fmt', 'yuv420p',
                '-r', '30',
                '-shortest',
                outputPath
            );

            // 5. Spawn the process and handle events
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
        return response.text;
    }

    public async generateAndSaveAssets(company: Company, videoIdea: VideoIdea): Promise<void> {
        const generationId = Date.now().toString();
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'narrative-nexus-'));
        
        const characterDescription = await this.generateCharacterDescription(videoIdea);

        const audioBlob = await elevenlabsService.generateAudio(videoIdea.script, videoIdea.voiceTone);
        const audioBuffer = Buffer.from(await audioBlob.arrayBuffer());
        const audioFilePath = path.join(tempDir, 'narration.mp3');
        await fs.writeFile(audioFilePath, audioBuffer);
        
        // Generate FFMPEG commands for all scenes first
        const scenesForFfmpeg = videoIdea.scenes.map(s => ({
            id: s.id,
            effect: s.effects,
            duration: s.duration
        }));
        const ffmpegCommandsMap = await this.generateFfmpegCommands(scenesForFfmpeg);

        const imageFilePaths: {path: string, duration: number, ffmpegCommand: string, onScreenText?: string}[] = [];
        for (const [index, scene] of videoIdea.scenes.entries()) {
            const base64Image = await this.generateSingleImage({ sceneDescription: scene.description, visualStyle: videoIdea.visualStyle, characterDescription });
            const imageBuffer = Buffer.from(base64Image, 'base64');
            const imagePath = path.join(tempDir, `scene_${index}.jpg`);
            await fs.writeFile(imagePath, imageBuffer);
            imageFilePaths.push({ 
                path: imagePath, 
                duration: parseFloat(scene.duration) || 3,
                ffmpegCommand: ffmpegCommandsMap[scene.id] || '', // Add the generated command
                onScreenText: videoIdea.onScreenText?.find(txt => {
                    const sceneStartTime = videoIdea.scenes.slice(0, index).reduce((acc, s) => acc + parseFloat(s.duration), 0);
                    const sceneEndTime = sceneStartTime + parseFloat(scene.duration);
                    const textStartTime = parseFloat(txt.time);
                    // Check if the text's start time falls within the current scene's time range
                    return textStartTime >= sceneStartTime && textStartTime < sceneEndTime;
                })?.text
            });
        }

        // After successful video creation, save any newly generated effects
        const videoOutputPath = path.join(tempDir, 'output.mp4');
        await this.createVideoFromAssets(imageFilePaths, audioFilePath, videoOutputPath);

        const videoBuffer = await fs.readFile(videoOutputPath);
        const videoFileName = `${company.name.toLowerCase().replace(/\s+/g, '_')}_${generationId}.mp4`;
        if (githubService) await githubService.saveAsset('video', videoFileName, videoBuffer.toString('base64'));

        // --- SELF-IMPROVEMENT STEP ---
        // If video generation was successful, add any new AI-generated effects to our library.
        for (const scene of videoIdea.scenes) {
            // The self-improvement logic based on direct generation is no longer needed with the structured approach.
            // We can re-introduce a different kind of learning later if desired.
        }

        // Save audio and images as well
        const audioFileName = `${company.name.toLowerCase().replace(/\s+/g, '_')}_${generationId}.mp3`;
        if (githubService) await githubService.saveAsset('audio', audioFileName, audioBuffer.toString('base64'));
        for (const [index, img] of imageFilePaths.entries()) {
            const scene = videoIdea.scenes[index];
            const sceneName = scene.name.toLowerCase().replace(/\s+/g, '_');
            const imageFileName = `${sceneName}_${generationId}_${index}.jpg`;
            const imageContent = await fs.readFile(img.path);
            if (githubService) await githubService.saveAsset('image', imageFileName, imageContent.toString('base64'));
        }

        // Clean up temporary directory
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

export const geminiService = new GeminiService(config.apiKeys.gemini!);
