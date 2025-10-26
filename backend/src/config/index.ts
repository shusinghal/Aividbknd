
import dotenv from 'dotenv';
dotenv.config();


const config = {
    apiKeys: {
        gemini: process.env.GEMINI_API_KEY,
        elevenlabs: process.env.ELEVENLABS_API_KEY,
        pexels: process.env.PEXELS_API_KEY,
        tts: process.env.tts_key,
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
