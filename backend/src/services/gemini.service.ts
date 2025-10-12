import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI, Type } from "@google/genai";
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import config from '../config';


// --- START: Vertex AI Client Configuration ---
const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

const vertexAI = new GoogleGenAI({
  vertexai: true,
  project: project,
  location: location,
});

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
        return JSON.parse(response.text as string);
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
        return JSON.parse(response.text as string);
    }
    
    public async runAiCollaboration(company: Company): Promise<any> {
        const initialPrompt = `For "${company.name}", a company described as "${company.description}", create a full viral video content plan. The plan should feel emotionally authentic and human, not like a sales pitch. Use the "Unfiltered Human Moment" framework. Respond ONLY with a valid JSON object based on the VideoIdea interface. The JSON should have keys: coreProblem, targetEmotion, scenes (an array of objects with name, description, duration, effects), script, numberOfImages, videoLength, ctaGoal, voiceTone, visualStyle, musicPace, heading, hashtags, description, preferredPlatform (an array).`;
        
       const initialResponse = await this.ai.models.generateContent({
           model: 'gemini-2.5-flash', contents: initialPrompt, config: { responseMimeType: "application/json" }
       });
       if (!initialResponse.text) throw new Error('Empty initial response from Gemini');
       let currentVideoIdea = JSON.parse(initialResponse.text as string);

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
        return JSON.parse(finalResponse.text as string);
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
    
    public async generateSingleImage(payload: { sceneDescription: string, visualStyle: string, characterDescription: string | null }): Promise<string> {
        const { sceneDescription, visualStyle, characterDescription } = payload;
        const prompt = characterDescription
            ? `${sceneDescription}. The main character is: ${characterDescription}. Style: ${visualStyle}. IMPORTANT: Ensure the character in this image matches this description precisely.`
            : `${sceneDescription}, ${visualStyle}`;

        const response = await vertexAI.models.generateImages({
            model: 'imagegeneration@0.0.5',
            prompt: prompt,
            config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '4:3' },
        });
        if (!response.generatedImages || response.generatedImages.length === 0) throw new Error('No images generated');
        const img = response.generatedImages[0];
        if (!img || !img.image || !img.image.imageBytes) throw new Error('Malformed image response');
        return img.image.imageBytes as string;
    }

    public async createVideoFromAssets(imageFiles: {path: string, duration: number}[], audioFile: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const command = ffmpeg();

            // Create a complex filter to concatenate images with specified durations
            const videoInputs: string[] = [];
            const filterComplex: string[] = [];
            let streamCounter = 0;

            imageFiles.forEach((img, index) => {
                command.input(img.path);
                videoInputs.push(`[${index}:v]`);
                filterComplex.push(`[${index}:v]format=yuv420p,fade=in:st=0:d=0.5,fade=out:st=${img.duration - 0.5}:d=0.5[v${index}]`);
            });

            command.input(audioFile);

            const concatFilter = videoInputs.map((_, i) => `[v${i}]`).join('') + `concat=n=${imageFiles.length}:v=1:a=0[v]`;
            filterComplex.push(concatFilter);

            command
                .complexFilter(filterComplex)
                .outputOptions([
                    '-map "[v]"',
                    `-map ${imageFiles.length}:a`,
                    '-c:v libx264',
                    '-c:a aac',
                    '-r 30', // framerate
                    '-shortest'
                ])
                .on('error', (err) => reject(err))
                .on('end', () => resolve())
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

        const imageFilePaths: {path: string, duration: number}[] = [];
        for (const [index, scene] of videoIdea.scenes.entries()) {
            const base64Image = await this.generateSingleImage({ sceneDescription: scene.description, visualStyle: videoIdea.visualStyle, characterDescription: characterDescription });
            const imageBuffer = Buffer.from(base64Image, 'base64');
            const imagePath = path.join(tempDir, `scene_${index}.jpg`);
            await fs.writeFile(imagePath, imageBuffer);
            imageFilePaths.push({ path: imagePath, duration: parseFloat(scene.duration) || 3 });
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