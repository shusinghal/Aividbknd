
import dotenv from 'dotenv';
dotenv.config();


const config = {
    server: {
        host: process.env.SERVER_HOST || 'http://localhost',
        port: process.env.SERVER_PORT || 3001,
        // Use a dedicated public URL for externally facing links (e.g., from ngrok).
        // Falls back to host:port for local development.
        publicUrl: process.env.PUBLIC_SERVER_URL || `${process.env.SERVER_HOST || 'http://localhost'}:${process.env.SERVER_PORT || 3001}`,
    },
    apiKeys: {
        gemini: process.env.GEMINI_API_KEY,
        elevenlabs: process.env.ELEVENLABS_API_KEY,
        pexels: process.env.PEXELS_API_KEY,
        tts: process.env.TTS_KEY,
    },
    googleTts: {
        clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL,
        privateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }
};

// Basic validation: require at least the AI API key.
if (!config.apiKeys.gemini) {
    throw new Error("Missing critical environment variables. Check your .env file. GEMINI_API_KEY is required.");
}


export default config;
