


// FIX: Import Buffer to resolve type errors in Node.js environment.
import { Buffer } from 'buffer';
import { GoogleGenAI, Type } from "@google/genai";
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
import ffmpeg from 'fluent-ffmpeg';
import fetch from 'node-fetch';

// Reuse frontend types
interface Company { name: string; description: string; [key: string]: any; }
interface Scene { id: string; name: string; description: string; duration: string; effects: string; }
interface VideoIdea {
  scenes: Scene[];
  script: string;
  voiceTone: string;
  visualStyle: string;
  [key: string]: any;
}

class GeminiService {
    private ai: GoogleGenAI;

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
    
    public async generateFfmpegCommands(scenes: { id: string, effect: string, duration: string }[]): Promise<Record<string, string>> {
        const schemaProperties: Record<string, any> = {};
        scenes.forEach(scene => {
            schemaProperties[scene.id] = {
                type: Type.STRING,
                description: `The FFMPEG -vf command for the effect: '${scene.effect}' for a ${scene.duration} second clip.`
            };
        });

        const responseSchema = {
            type: Type.OBJECT,
            properties: schemaProperties,
            required: scenes.map(s => s.id)
        };
        
        const model = 'gemini-2.5-pro';

        const prompt = `
            You are an expert FFMPEG engineer. Your task is to convert natural language descriptions of video effects into precise FFMPEG filter graph strings for the "-vf" flag.

            **IMPORTANT RULES:**
            1.  **Output Format:** You MUST return ONLY a valid JSON object that matches the provided schema. Do not include any markdown, explanations, or any text outside of the JSON structure.
            2.  **Command Content:** Provide ONLY the filter graph string itself. DO NOT include "ffmpeg -i input.jpg" or the output filename.
            3.  **Dimensions:** Assume all source images are for vertical video with dimensions 1080x1920 (width x height).
            4.  **Duration:** Use the provided scene duration (in seconds) to calculate timings. Assume a frame rate of 30fps for calculations (e.g., duration in frames = scene_duration * 30).
            5.  **Escaping:** Be careful with quotes inside the filter graph. Escape them properly with a backslash (e.g., \\"text\\").
            6.  **Pixel Format:** Ensure the output has a widely compatible pixel format by ending the filter chain with ",format=yuv420p".

            **INPUT SCENES:**
            ${JSON.stringify(scenes.map(s => ({id: s.id, effect: s.effect, duration: s.duration})), null, 2)}

            **EXAMPLE:**
            If the input is:
            [
              {"id": "scene_1", "effect": "slow zoom in", "duration": "5"},
              {"id": "scene_2", "effect": "fade to black at the end", "duration": "4"}
            ]

            Your JSON output should be:
            {
              "scene_1": "zoompan=z='min(zoom+0.001,1.2)':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,format=yuv420p",
              "scene_2": "fade=t=out:st=3:d=1,format=yuv420p"
            }

            Now, generate the commands for the provided input scenes.
        `;

        try {
            const response = await this.ai.models.generateContent({
                model: model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                    temperature: 0.2,
                }
            });
            
            if (!response.text) {
                throw new Error('Empty response from Gemini while generating FFMPEG commands.');
            }
            
            const jsonText = response.text.trim();
            const commandsMap = JSON.parse(jsonText);
            
            console.log('Successfully generated FFMPEG commands:', commandsMap);
            return commandsMap;

        } catch (error) {
            console.error("Error calling Gemini API for FFMPEG commands:", error);
            const errorMap: Record<string, string> = {};
            scenes.forEach(scene => {
                errorMap[scene.id] = 'Error: AI command generation failed.';
            });
            return errorMap;
        }
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

    public async createVideoFromAssets(imageFiles: {path: string, duration: number, ffmpegCommand?: string}[], audioFile: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const command = ffmpeg();
    
            const filterComplex: string[] = [];
    
            // Add inputs and build the filter graph for each image
            imageFiles.forEach((img, index) => {
                command.input(img.path)
                    .inputOptions([
                        '-loop 1',          // Loop the image
                        `-t ${img.duration}`  // Set duration for this input
                    ]);
                
                // Check if a valid, non-error command was provided
                const isCommandValid = img.ffmpegCommand && 
                                     img.ffmpegCommand.trim() !== '{}' && 
                                     img.ffmpegCommand.trim() !== '' && 
                                     !img.ffmpegCommand.startsWith('Error');
    
                // Use the provided command or a default fade effect
                let vfCommand = isCommandValid
                    ? img.ffmpegCommand
                    : `fade=in:st=0:d=0.5,fade=out:st=${img.duration - 0.5}:d=0.5`;
    
                // The AI is prompted to add format=yuv420p. If not present, we add it for compatibility.
                if (vfCommand && !vfCommand.includes('format=yuv420p')) {
                    vfCommand += ',format=yuv420p';
                }
    
                // Define a complete filter chain for this input: scale to 1080x1920, then apply the effect.
                const filterString = `[${index}:v]scale=1080:1920,setsar=1[scaled${index}]; [scaled${index}]${vfCommand}[v${index}]`;
                filterComplex.push(filterString);
            });
    
            // Add the audio input
            command.input(audioFile);
    
            // Build the final concat filter string to combine all processed video streams
            const concatStreams = imageFiles.map((_, i) => `[v${i}]`).join('');
            const concatFilter = `${concatStreams}concat=n=${imageFiles.length}:v=1:a=0[v]`;
            filterComplex.push(concatFilter);
    
            command
                .complexFilter(filterComplex)
                .outputOptions([
                    '-map "[v]"',                  // Map the final video stream
                    `-map ${imageFiles.length}:a`, // Map the audio stream
                    '-c:v libx264',                // Use a common video codec
                    '-c:a aac',                    // Use a common audio codec
                    '-r 30',                       // Set framerate to 30
                    '-pix_fmt yuv420p',            // Ensure output pixel format is compatible
                    '-shortest'                    // Finish encoding when the shortest stream ends (the audio)
                ])
                .on('start', function(commandLine) {
                    console.log('Spawned Ffmpeg with command: ' + commandLine);
                })
                .on('error', (err, stdout, stderr) => {
                    console.error('FFMPEG Error:', err.message);
                    console.error('FFMPEG stdout:', stdout);
                    console.error('FFMPEG stderr:', stderr);
                    reject(new Error(`FFMPEG error: ${err.message}\n${stderr}`));
                })
                .on('end', () => {
                    console.log('FFMPEG processing finished successfully.');
                    resolve();
                })
                .save(outputPath);
        });
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

        const imageFilePaths: {path: string, duration: number, ffmpegCommand: string}[] = [];
        for (const [index, scene] of videoIdea.scenes.entries()) {
            const base64Image = await this.generateSingleImage({ sceneDescription: scene.description, visualStyle: videoIdea.visualStyle, characterDescription });
            const imageBuffer = Buffer.from(base64Image, 'base64');
            const imagePath = path.join(tempDir, `scene_${index}.jpg`);
            await fs.writeFile(imagePath, imageBuffer);
            imageFilePaths.push({ 
                path: imagePath, 
                duration: parseFloat(scene.duration) || 3,
                ffmpegCommand: ffmpegCommandsMap[scene.id] || '' // Add the generated command
            });
        }

        const videoOutputPath = path.join(tempDir, 'output.mp4');
        await this.createVideoFromAssets(imageFilePaths, audioFilePath, videoOutputPath);

        const videoBuffer = await fs.readFile(videoOutputPath);
        const videoFileName = `${company.name.toLowerCase().replace(/\s+/g, '_')}_${generationId}.mp4`;
        if (githubService) await githubService.saveAsset('video', videoFileName, videoBuffer.toString('base64'));

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
