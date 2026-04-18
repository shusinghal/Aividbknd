/**
 * A library of predefined FFMPEG filter commands.
 * The frontend can reference these by name (e.g., "slowZoomIn").
 * This library can be expanded with more complex, parameterized effects.
 */
export const ffmpegFilterLibrary: Record<string, (duration: number) => string> = {
    default: (duration) => `fade=in:st=0:d=0.5,fade=out:st=${Math.max(0, duration - 0.5)}:d=0.5,format=yuv420p`,
    slowZoomIn: (duration) => `zoompan=z='min(zoom+0.001,1.1)':d=${Math.floor(duration * 25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920,format=yuv420p`,
    panLeft: (duration) => `zoompan=z=1:d=${Math.floor(duration * 25)}:x='iw/2-(iw/zoom/2)-t*50':y='ih/2-(ih/zoom/2)':s=1080x1920,format=yuv420p`,
    panRight: (duration) => `zoompan=z=1:d=${Math.floor(duration * 25)}:x='iw/2-(iw/zoom/2)+t*50':y='ih/2-(ih/zoom/2)':s=1080x1920,format=yuv420p`,
    subtleShake: (duration) => `frei0r=shake:intensity=0.01,format=yuv420p`,
    noEffect: (_duration) => `format=yuv420p`,
};