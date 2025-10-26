import * as fs from 'fs/promises';
import * as path from 'path';

const CUSTOM_EFFECTS_PATH = path.resolve(__dirname, '..', '..', 'data', 'custom-effects.json');
type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

interface AnimatedParam {
    start: number | string;
    end: number | string;
    easing?: Easing;
}

function isAnimatedParam(param: any): param is AnimatedParam {
    return typeof param === 'object' && param !== null && 'start' in param && 'end' in param;
}
export interface EffectLayer {
    name: 'zoom' | 'pan' | 'fade' | 'static' | 'fisheye_wobble' | 'vignette' | 'gaussianBlur' | 'shake';
    startTime: number;
    endTime: number;
    params?: {
        level?: number | AnimatedParam; // for zoom
        [key: string]: any;
    };
}

interface EffectContext {
    duration: number;
    width: number;
    height: number;
}

const FRAME_RATE = 30;

class EffectComposer {
    private getExpression(param: number | AnimatedParam, layer: EffectLayer, context: EffectContext): string {
        if (!isAnimatedParam(param)) {
            return param.toString();
        }

        const { start, end, easing = 'linear' } = param;
        const { startTime, endTime } = layer;
        const duration = endTime - startTime;

        // Normalized time `nt` goes from 0 to 1 over the effect's duration
        const nt = `(t-${startTime})/${duration}`;

        let easedTime: string;
        switch (easing) {
            case 'easeIn':
                easedTime = `pow(${nt},2)`;
                break;
            case 'easeOut':
                easedTime = `1-pow(1-${nt},2)`;
                break;
            case 'easeInOut':
                easedTime = `if(lt(${nt},0.5),2*pow(${nt},2),1-pow(-2*${nt}+2,2)/2)`;
                break;
            case 'linear':
            default:
                easedTime = nt;
                break;
        }

        const expression = `${start}+(${end}-(${start}))*${easedTime}`;
        // Clamp the expression to the layer's time range
        return `if(between(t,${startTime},${endTime}),${expression},if(lt(t,${startTime}),${start},${end}))`;
    }

    public compose(layers: EffectLayer[], context: EffectContext): string {
        const zoomLayers = layers.filter(l => l.name === 'zoom');
        const panLayers = layers.filter(l => l.name === 'pan');
        const shakeLayers = layers.filter(l => l.name === 'shake');
        const otherLayers = layers.filter(l => !['zoom', 'pan', 'shake'].includes(l.name));

        let zoomExpression = '1.0';
        let panXExpression = '0';
        let panYExpression = '0';

        // --- Handle Zoom ---
        if (zoomLayers.length > 0) {
            // For simplicity, we'll use the first zoom layer. A more advanced version could stack them.
            const zoomLayer = zoomLayers[0];
            if (zoomLayer.params?.level) {
                zoomExpression = this.getExpression(zoomLayer.params.level, zoomLayer, context);
            }
        }

        // --- Handle Pan ---
        if (panLayers.length > 0) {
            const panLayer = panLayers[0];
            const panSpeed = 80; // pixels per second
            const panAmount = `min(t-${panLayer.startTime}, ${panLayer.endTime - panLayer.startTime})*${panSpeed}`;
            switch (panLayer.params?.direction) {
                case 'left': panXExpression = `-(${panAmount})`; break;
                case 'right': panXExpression = `+(${panAmount})`; break;
                case 'up': panYExpression = `-(${panAmount})`; break;
                case 'down': panYExpression = `+(${panAmount})`; break;
            }
        }

        // --- Handle Shake ---
        if (shakeLayers.length > 0) {
            const shakeLayer = shakeLayers[0];
            const intensity = shakeLayer.params?.intensity ? this.getExpression(shakeLayer.params.intensity, shakeLayer, context) : '0';
            panXExpression += `+(${intensity}*sin(2*PI*t*10))`;
            panYExpression += `+(${intensity}*cos(2*PI*t*13))`;
        }

        const hasZoomPan = zoomLayers.length > 0 || panLayers.length > 0 || shakeLayers.length > 0;

        const allFilters: string[] = [];

        if (hasZoomPan) {
            const totalFrames = Math.ceil(context.duration * FRAME_RATE);
            // If there's panning or shaking but no zoom, apply a slight zoom to create space to move.
            const finalZoomExpr = `max(${zoomExpression}, ${panLayers.length > 0 || shakeLayers.length > 0 ? '1.1' : '1.0'})`;

            const zoompanFilter = `zoompan=z='${finalZoomExpr}':x='iw/2-(iw/zoom/2)+${panXExpression}':y='ih/2-(ih/zoom/2)+${panYExpression}':d=${totalFrames}:s=${context.width}x${context.height}`;
            allFilters.push(zoompanFilter);
        }

        // --- Handle Other Filters ---
        for (const layer of otherLayers) {
            const enableExpr = `enable='between(t,${layer.startTime},${layer.endTime})'`;
            switch (layer.name) {
                case 'fade':
                    if (layer.params?.type === 'in') {
                        allFilters.push(`fade=t=in:st=${layer.startTime}:d=${layer.endTime - layer.startTime}`);
                    } else if (layer.params?.type === 'out') {
                        allFilters.push(`fade=t=out:st=${layer.startTime}:d=${layer.endTime - layer.startTime}`);
                    }
                    break;
                case 'vignette':
                    allFilters.push(`vignette=angle=PI/5:${enableExpr}`.replace('PI', '3.14159'));
                    break;
                case 'fisheye_wobble':
                    // FIX: Apply the enable expression to the filters to respect timing.
                    const fisheyeFilter = `lenscorrection=cx=0.5:cy=0.5:k1='if(between(t,${layer.startTime},${layer.endTime}),-0.2,0)':k2='if(between(t,${layer.startTime},${layer.endTime}),-0.1,0)'`;
                    const wobbleFilter = `displace=x='if(between(t,${layer.startTime},${layer.endTime}),5*sin(2*PI*t/2),0)':y='if(between(t,${layer.startTime},${layer.endTime}),3*cos(2*PI*t/1.5),0)'`;
                    allFilters.push(`${fisheyeFilter},${wobbleFilter}`.replace(/PI/g, '3.14159'));
                    break;
                case 'gaussianBlur':
                    if (layer.params?.sigma) {
                        const sigmaExpr = this.getExpression(layer.params.sigma, layer, context);
                        allFilters.push(`gblur=sigma='${sigmaExpr}':${enableExpr}`);
                    }
                    break;
            }
        }

        allFilters.push('format=yuv420p');

        return allFilters.filter(f => f).join(',');
    }
}

class FfmpegEffectsService {
    private customEffectLibrary: Record<string, string> = {};
    public readonly composer = new EffectComposer();
    public readonly availableEffects: EffectLayer['name'][] = ['zoom', 'pan', 'fade', 'static', 'vignette', 'fisheye_wobble', 'gaussianBlur', 'shake'];

    constructor() {}

    public async initialize(): Promise<void> {
        try {
            await fs.access(CUSTOM_EFFECTS_PATH);
            const customEffectsJson = await fs.readFile(CUSTOM_EFFECTS_PATH, 'utf-8');
            this.customEffectLibrary = JSON.parse(customEffectsJson);
            console.log(`Loaded ${Object.keys(this.customEffectLibrary).length} custom FFMPEG effects.`);
        } catch (error) {
            console.log('No custom effects file found or it is empty. Initializing with base effects.');
            await fs.writeFile(CUSTOM_EFFECTS_PATH, '{}', 'utf-8');
        }
    }

    public getCustomEffect(key: string): string | undefined {
        return this.customEffectLibrary[key];
    }

    public getAvailableEffects(): string[] {
        return [...this.availableEffects, ...Object.keys(this.customEffectLibrary)];
    }

    public async saveCustomEffect(effectKey: string, command: string): Promise<void> {
        if (this.availableEffects.includes(effectKey as any) || this.customEffectLibrary[effectKey]) {
            console.log(`Effect key '${effectKey}' already exists. Skipping save.`);
            return;
        }

        console.log(`Saving new custom effect: '${effectKey}'`);
        const customEffectsJson = await fs.readFile(CUSTOM_EFFECTS_PATH, 'utf-8');
        const currentCustomEffects = JSON.parse(customEffectsJson);

        currentCustomEffects[effectKey] = command;

        await fs.writeFile(CUSTOM_EFFECTS_PATH, JSON.stringify(currentCustomEffects, null, 2), 'utf-8');
        
        // Add to the current session's library
        this.customEffectLibrary[effectKey] = command;
    }
}

export const ffmpegEffectsService = new FfmpegEffectsService();