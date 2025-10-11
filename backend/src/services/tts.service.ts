
import { JWT } from 'google-auth-library';
import fetch from 'node-fetch';
import config from '../config';

interface SynthesizeSpeechOptions {
    text: string;
    voice: { languageCode: string; name: string; };
    speakingRate: number;
    pitch: number;
}

class GoogleTtsService {
    private clientEmail = config.googleTts.clientEmail;
    private privateKey = config.googleTts.privateKey;
    private jwtClient: JWT | null = null;

    private async initialize() {
        if (this.jwtClient) return;
        if (!this.clientEmail || !this.privateKey) {
            throw new Error("Google TTS service account credentials are not configured.");
        }
        this.jwtClient = new JWT({
            email: this.clientEmail,
            key: this.privateKey,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
    }

    public async synthesize(options: SynthesizeSpeechOptions): Promise<Blob> {
        await this.initialize();
        const accessToken = await this.jwtClient!.getAccessToken();
        
        const body = {
            input: { text: options.text },
            voice: options.voice,
            audioConfig: {
                audioEncoding: 'MP3',
                speakingRate: options.speakingRate,
                pitch: options.pitch,
            },
        };

        const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken.token}`,
            },
            body: JSON.stringify(body),
        });

        const data: any = await response.json();
        if (!response.ok) {
            const errorDetails = data?.error?.message || 'An unknown Google TTS error occurred.';
            throw new Error(`Google TTS API Error: ${errorDetails}`);
        }

        const audioBuffer = Buffer.from(data.audioContent, 'base64');
        return new Blob([audioBuffer], { type: 'audio/mpeg' });
    }
}

export const googleTtsService = new GoogleTtsService();
