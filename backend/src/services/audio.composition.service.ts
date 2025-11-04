import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { googleTtsService } from './tts.service';
import fetch from 'node-fetch';

interface ScriptPart {
    type: 'dialogue' | 'sfx' | 'pause';
    content: string | number;
}

interface AudioSegment {
    filePath: string;
    isSilent: boolean;
}

class AudioCompositionService {
    // A simple cache to avoid re-downloading the same SFX multiple times
    private sfxCache: Map<string, string> = new Map();

    /**
     * Fetches a sound effect based on a search query.
     * This implementation uses the Freesound API.
     * A more robust solution would use a dedicated, licensed SFX library.
     * @param query A description of the sound effect, e.g., "keyboard typing".
     * @param tempDir The temporary directory to store the downloaded file.
     * @returns The local file path of the downloaded sound effect, or null if not found.
     */
    private async getSfx(query: string, tempDir: string): Promise<string | null> {
        if (this.sfxCache.has(query)) {
            return this.sfxCache.get(query)!;
        }

        try {
            // NOTE: This uses a public, non-authenticated API for demonstration.
            // You need to get an API key from https://freesound.org/help/developers/
            const apiKey = process.env.FREESOUND_API_KEY;
            if (!apiKey) {
                console.warn('FREESOUND_API_KEY is not set. Skipping SFX download.');
                return null;
            }

            console.log(`[SFX] Searching for: ${query}`);
            // Search for a sound, filtering by mp3 format and sorting by relevance.
            const searchUrl = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&filter=type:mp3&sort=score_desc&fields=id,previews`;
            const searchResponse = await fetch(searchUrl, {
                headers: { 'Authorization': `Token ${apiKey}` }
            });

            if (!searchResponse.ok) throw new Error(`Freesound search failed with status ${searchResponse.status}`);

            const searchData: any = await searchResponse.json();
            if (!searchData.results || searchData.results.length === 0) {
                console.warn(`[SFX] No results found for "${query}".`);
                return null;
            }

            // Get the URL for the high-quality MP3 preview of the first result.
            const sfxUrl = searchData.results[0].previews['preview-hq-mp3'];
            if (!sfxUrl) {
                console.warn(`[SFX] No downloadable MP3 found for the top result of "${query}".`);
                return null;
            }

            console.log(`[SFX] Downloading from: ${sfxUrl}`);
            const sfxResponse = await fetch(sfxUrl);
            if (!sfxResponse.ok) throw new Error(`Failed to download SFX file with status ${sfxResponse.status}`);

            const sfxBuffer = await sfxResponse.arrayBuffer();
            const sfxFilePath = path.join(tempDir, `sfx_${query.replace(/\s+/g, '_')}_${Date.now()}.mp3`);
            await fs.writeFile(sfxFilePath, Buffer.from(sfxBuffer));

            this.sfxCache.set(query, sfxFilePath);
            return sfxFilePath;

        } catch (error) {
            console.error(`[SFX] Error fetching sound effect for "${query}":`, error);
            return null;
        }
    }

    /**
     * Creates a silent audio file of a specific duration.
     * @param duration The duration of the silence in seconds.
     * @param tempDir The temporary directory to store the silent file.
     * @returns The file path of the generated silent audio file.
     */
    private async createSilentAudio(duration: number, tempDir: string): Promise<string> {
        const silentFilePath = path.join(tempDir, `silent_${duration.toFixed(2).replace('.', '_')}s.mp3`);
        return new Promise((resolve, reject) => {
            const ffmpegProcess = spawn('ffmpeg', [
                '-f', 'lavfi',
                '-i', `anullsrc=r=44100:cl=stereo`,
                '-t', `${duration}`,
                '-q:a', '9', // Lower quality for silence to save space
                '-y', // Overwrite output file if it exists
                silentFilePath
            ]);

            ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    resolve(silentFilePath);
                } else {
                    reject(new Error(`FFmpeg process for silence creation exited with code ${code}`));
                }
            });

            ffmpegProcess.on('error', (err) => reject(err));
        });
    }

    /**
     * Composes a single audio track from a structured script.
     * @param script An array of script parts (dialogue, sfx, pause).
     * @param tempDir A temporary directory for intermediate files.
     * @param voiceOptions Options for Google TTS.
     * @returns The file path of the final composed audio track.
     */
    public async composeAudio(script: ScriptPart[], tempDir: string, voiceOptions: any): Promise<string> {
        const audioSegments: AudioSegment[] = [];

        for (const part of script) {
            let segmentPath: string | null = null;
            let isSilent = false;

            if (part.type === 'dialogue') {
                console.log(`[Audio] Synthesizing dialogue: "${part.content}"`);
                const audioBlob = await googleTtsService.synthesize({ text: part.content as string, ...voiceOptions });
                const buffer = Buffer.from(await audioBlob.arrayBuffer());
                segmentPath = path.join(tempDir, `dialogue_${Date.now()}.mp3`);
                await fs.writeFile(segmentPath, buffer);
            } else if (part.type === 'sfx') {
                console.log(`[Audio] Handling SFX: "${part.content}"`);
                segmentPath = await this.getSfx(part.content as string, tempDir);
                if (!segmentPath) {
                    // If SFX is not found, fall back to a short pause as a placeholder.
                    console.warn(`[Audio] SFX for "${part.content}" not found. Inserting a 0.5s pause instead.`);
                    segmentPath = await this.createSilentAudio(0.5, tempDir);
                    isSilent = true;
                } else {
                    isSilent = false; // It's a real audio file, not silence.
                }
            } else if (part.type === 'pause') {
                const duration = typeof part.content === 'number' ? part.content : parseFloat(part.content);
                console.log(`[Audio] Creating pause of ${duration}s`);
                segmentPath = await this.createSilentAudio(duration, tempDir);
                isSilent = true;
            }

            if (segmentPath) {
                audioSegments.push({ filePath: segmentPath, isSilent });
            }
        }

        const outputAudioPath = path.join(tempDir, 'final_narration.mp3');
        const fileListPath = path.join(tempDir, 'audiolist.txt');
        const fileListContent = audioSegments.map(segment => `file '${segment.filePath}'`).join('\n');
        await fs.writeFile(fileListPath, fileListContent);

        return new Promise((resolve, reject) => {
            const ffmpegProcess = spawn('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', fileListPath, '-c', 'copy', '-y', outputAudioPath]);
            ffmpegProcess.on('close', code => code === 0 ? resolve(outputAudioPath) : reject(new Error(`FFmpeg audio concat exited with code ${code}`)));
            ffmpegProcess.on('error', err => reject(err));
        });
    }
}

export const audioCompositionService = new AudioCompositionService();