import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { googleTtsService, GoogleTtsVoice } from './tts.service';
import { geminiService } from './gemini.service';

interface ScriptPart {
    type: 'dialogue' | 'sfx' | 'pause';
    content: string | number;
    // Add an optional duration property, to be populated after generation/probing
    duration?: number; 
}

interface AudioSegment {
    type: 'dialogue' | 'sfx';
    path: string;
    startTime: number; // in seconds
    duration: number; // in seconds
}

interface VoiceOptions {
    voice: GoogleTtsVoice;
    speakingRate: number;
    pitch: number;
}

/**
 * A utility service to get metadata from media files using ffprobe.
 */
class FfprobeService {
    public async getDuration(filePath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const args = [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                filePath
            ];
            const ffprobe = spawn('ffprobe', args);
            let output = '';
            let stderr = '';

            ffprobe.stdout.on('data', (data) => output += data.toString());
            ffprobe.stderr.on('data', (data) => stderr += data.toString());

            ffprobe.on('close', (code) => {
                if (code === 0) {
                    resolve(parseFloat(output));
                } else {
                    reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
                }
            });
            ffprobe.on('error', (err) => reject(err));
        });
    }
}
const ffprobeService = new FfprobeService();

class AudioCompositionService {
    /**
     * Retrieves the local path for a sound effect from our standard library.
     * @param sfxName The name of the sound effect, e.g., "swoosh".
     * @returns The full path to the SFX file, or null if it doesn't exist.
     */
    private async getSfxPath(sfxName: string): Promise<string | null> {
        const sfxDir = path.join(process.cwd(), 'public', 'assets', 'sfx');
        const sfxPath = path.join(sfxDir, `${sfxName}.mp3`);
        try {
            await fs.access(sfxPath);
            console.log(`[SFX] Found direct match for "${sfxName}" at ${sfxPath}`);
            return sfxPath;
        } catch {
            console.warn(`[SFX] No direct file match for "${sfxName}". Attempting RAG fallback...`);
            const bestMatchName = await geminiService.findBestSfxMatch(sfxName);
            if (bestMatchName) {
                console.log(`[SFX] RAG fallback found match: "${bestMatchName}"`);
                const bestMatchPath = path.join(sfxDir, `${bestMatchName}.mp3`);
                try {
                    await fs.access(bestMatchPath);
                    return bestMatchPath;
                } catch {}
            }
        }
        console.error(`[SFX] Could not find a match for "${sfxName}" after RAG fallback.`);
        return null;
    }

    /**
     * Extracts the pure text from a script part's content, handling cases where it might be a string or a JSON object.
     * @param content The content from a script part.
     * @returns The text string to be synthesized.
     */
    private getDialogueText(content: string | number): string {
        // With the fix at the route level, this function's only job is to ensure the content is a string.
        // It should no longer handle complex parsing of nested JSON.
        if (typeof content !== 'string') {
            console.warn(`[Audio] Unexpected content type for dialogue: ${typeof content}. Converting to string.`);
            return String(content);
        }
        return content;
    }

    /**
     * Composes a single audio track from a structured script.
     * @param script An array of script parts (dialogue, sfx, pause).
     * @param tempDir A temporary directory for intermediate files.
     * @param voiceOptions Options for Google TTS.
     * @returns The file path of the final composed audio track.
     */
    public async composeAudio(script: ScriptPart[], tempDir: string, voiceOptions: VoiceOptions): Promise<string> {
        const audioFilePaths: string[] = [];

        // --- Single Pass: Generate dialogue and silence, then concatenate ---
        for (const part of script) {
            if (part.type === 'dialogue') {
                const dialogueText = this.getDialogueText(part.content);
                if (!dialogueText || dialogueText.trim() === '') continue; // Skip empty dialogue

                console.log(`[Audio] Synthesizing dialogue: "${dialogueText}"`);
                const audioBlob = await googleTtsService.synthesize({ text: dialogueText, ...voiceOptions });
                const buffer = Buffer.from(await audioBlob.arrayBuffer());
                const segmentPath = path.join(tempDir, `dialogue_${Date.now()}.mp3`);
                await fs.writeFile(segmentPath, buffer);
                audioFilePaths.push(segmentPath);

            } else if (part.type === 'sfx') {
                // Per your instruction, SFX parts are ignored during TTS narration generation.
                // They will be handled separately during the final video composition.
                continue;

            } else if (part.type === 'pause') {
                const duration = typeof part.content === 'number' ? part.content : parseFloat(part.content);
                if (isNaN(duration) || duration <= 0) continue; // Skip invalid pauses

                console.log(`[Audio] Adding pause of ${duration}s`);
                
                // Create a temporary silence file for concatenation
                const silencePath = path.join(tempDir, `silence_${duration}s_${Date.now()}.mp3`);
                await this.createSilence(silencePath, duration);
                audioFilePaths.push(silencePath);
            }
        }

        const finalOutputPath = path.join(tempDir, 'final_narration.mp3');
        if (audioFilePaths.length > 0) {
            await this.concatAudio(audioFilePaths, finalOutputPath);
            return finalOutputPath;
        } else {
            throw new Error("The provided script resulted in no audio content to generate.");
        }
    }

    private async createSilence(outputPath: string, duration: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const args = ['-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo:d=${duration}`, '-y', outputPath];
            const ffmpeg = spawn('ffmpeg', args);
            ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg failed to create silence (code ${code})`)));
            ffmpeg.on('error', reject);
        });
    }

    private async concatAudio(inputPaths: string[], outputPath: string): Promise<void> {
        const listFilePath = path.join(path.dirname(outputPath), 'concat_list.txt');
        const fileContent = inputPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
        await fs.writeFile(listFilePath, fileContent);

        return new Promise((resolve, reject) => {
            const args = ['-f', 'concat', '-safe', '0', '-i', listFilePath, '-c', 'copy', '-y', outputPath];
            const ffmpeg = spawn('ffmpeg', args);
            ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg concatenation failed (code ${code})`)));
            ffmpeg.on('error', reject);
        });
    }

}

export const audioCompositionService = new AudioCompositionService();