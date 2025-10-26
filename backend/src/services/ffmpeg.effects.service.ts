import * as fs from 'fs/promises';
import * as path from 'path';

const CUSTOM_EFFECTS_PATH = path.resolve(__dirname, '..', '..', 'data', 'custom-effects.json');

interface EffectOptions {
    duration: number;
    width: number;
    height: number;
}

type EffectGenerator = (options: EffectOptions) => string;

const FRAME_RATE = 30;

/**
 * This is the static, built-in library of trusted FFMPEG effects.
 * These are version-controlled and serve as the reliable baseline.
 */
const baseEffectLibrary: Record<string, EffectGenerator> = {
    slow_zoom_in: ({ duration, width, height }) => {
        const totalFrames = Math.ceil(duration * FRAME_RATE);
        return `zoompan=z='min(zoom+0.001,1.2)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height},format=yuv420p`;
    },
    slow_zoom_out: ({ duration, width, height }) => {
        const totalFrames = Math.ceil(duration * FRAME_RATE);
        return `zoompan=z='if(gte(zoom,1.001),max(1,zoom-0.001),1.2)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height},format=yuv420p`;
    },
    pan_right: ({ duration, width, height }) => {
        const panSpeed = 50;
        return `zoompan=z=1.1:x='min(iw/2-iw/2/1.1,t*${panSpeed})':y='ih/2-ih/2/1.1':d=${Math.ceil(duration * FRAME_RATE)}:s=${width}x${height},format=yuv420p`;
    },
    pan_left: ({ duration, width, height }) => {
        const panSpeed = 50;
        return `zoompan=z=1.1:x='iw/2-iw/2/1.1-t*${panSpeed}':y='ih/2-ih/2/1.1':d=${Math.ceil(duration * FRAME_RATE)}:s=${width}x${height},format=yuv420p`;
    },
    fade_in: ({ duration }) => `fade=t=in:st=0:d=0.5,format=yuv420p`,
    fade_out: ({ duration }) => {
        const startTime = Math.max(0, duration - 1);
        return `fade=t=out:st=${startTime.toFixed(1)}:d=1,format=yuv420p`;
    },
    vignette: () => `vignette=angle=PI/5,format=yuv420p`.replace('PI', '3.1415926535'),
    static: () => `format=yuv420p`,
};

class FfmpegEffectsService {
    private effectLibrary: Record<string, EffectGenerator> = {};

    constructor() {
        this.effectLibrary = { ...baseEffectLibrary };
    }

    public async initialize(): Promise<void> {
        try {
            await fs.access(CUSTOM_EFFECTS_PATH);
            const customEffectsJson = await fs.readFile(CUSTOM_EFFECTS_PATH, 'utf-8');
            const customEffects = JSON.parse(customEffectsJson);

            for (const key in customEffects) {
                // The command is a string, so we create a generator function for it.
                this.effectLibrary[key] = () => customEffects[key];
            }
            console.log(`Loaded ${Object.keys(customEffects).length} custom FFMPEG effects.`);
        } catch (error) {
            console.log('No custom effects file found or it is empty. Initializing with base effects.');
            await fs.writeFile(CUSTOM_EFFECTS_PATH, '{}', 'utf-8');
        }
    }

    public getEffect(key: string): EffectGenerator | undefined {
        return this.effectLibrary[key];
    }

    public getAvailableEffects(): string[] {
        return Object.keys(this.effectLibrary);
    }

    public async saveCustomEffect(effectKey: string, command: string): Promise<void> {
        if (baseEffectLibrary[effectKey] || this.effectLibrary[effectKey]) {
            console.log(`Effect key '${effectKey}' already exists. Skipping save.`);
            return;
        }

        console.log(`Saving new custom effect: '${effectKey}'`);
        const customEffectsJson = await fs.readFile(CUSTOM_EFFECTS_PATH, 'utf-8');
        const customEffects = JSON.parse(customEffectsJson);

        customEffects[effectKey] = command;

        await fs.writeFile(CUSTOM_EFFECTS_PATH, JSON.stringify(customEffects, null, 2), 'utf-8');
        
        // Add to the current session's library
        this.effectLibrary[effectKey] = () => command;
    }
}

export const ffmpegEffectsService = new FfmpegEffectsService();