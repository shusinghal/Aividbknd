/**
 * A library of pre-defined, validated FFMPEG filter graph functions.
 * This approach ensures reliability and avoids runtime errors from malformed commands.
 */

interface EffectOptions {
    duration: number; // duration in seconds
    width: number;    // output width
    height: number;   // output height
}

type EffectGenerator = (options: EffectOptions) => string;

const FRAME_RATE = 30;

export const effectLibrary: Record<string, EffectGenerator> = {
    /**
     * A gentle, continuous zoom-in over the entire clip duration.
     */
    slow_zoom_in: ({ duration, width, height }) => {
        const totalFrames = Math.ceil(duration * FRAME_RATE);
        return `zoompan=z='min(zoom+0.001,1.2)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height},format=yuv420p`;
    },

    /**
     * A gentle, continuous zoom-out, starting from a slightly zoomed-in state.
     */
    slow_zoom_out: ({ duration, width, height }) => {
        const totalFrames = Math.ceil(duration * FRAME_RATE);
        return `zoompan=z='if(gte(zoom,1.001),max(1,zoom-0.001),1.2)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height},format=yuv420p`;
    },

    /**
     * A slow, continuous pan from left to right.
     */
    pan_right: ({ duration, width, height }) => {
        const panSpeed = 50; // pixels per second
        return `zoompan=z=1.1:x='min(iw/2-iw/2/1.1,t*${panSpeed})':y='ih/2-ih/2/1.1':d=${Math.ceil(duration * FRAME_RATE)}:s=${width}x${height},format=yuv420p`;
    },

    /**
     * A slow, continuous pan from right to left.
     */
    pan_left: ({ duration, width, height }) => {
        const panSpeed = 50; // pixels per second
        return `zoompan=z=1.1:x='iw/2-iw/2/1.1-t*${panSpeed}':y='ih/2-ih/2/1.1':d=${Math.ceil(duration * FRAME_RATE)}:s=${width}x${height},format=yuv420p`;
    },

    /**
     * Fades the clip in from black at the beginning.
     */
    fade_in: ({ duration }) => {
        return `fade=t=in:st=0:d=0.5,format=yuv420p`;
    },

    /**
     * Fades the clip out to black at the end.
     */
    fade_out: ({ duration }) => {
        const startTime = Math.max(0, duration - 1);
        return `fade=t=out:st=${startTime.toFixed(1)}:d=1,format=yuv420p`;
    },

    /**
     * Applies a subtle vignette effect, darkening the corners.
     */
    vignette: () => {
        // FFMPEG's eval doesn't know 'PI', so we use its numerical value.
        return `vignette=angle=PI/5,format=yuv420p`.replace('PI', '3.1415926535');
    },
    /**
     * A static effect for when no motion is needed. Ensures format compatibility.
     */
    static: () => {
        return `format=yuv420p`;
    },
};

export const availableEffects = Object.keys(effectLibrary);