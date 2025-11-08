
import fetch from 'node-fetch';
import config from '../config';

export interface GoogleTtsVoice {
    languageCode: string;
    name: string;
}

interface SynthesizeSpeechOptions {
    text: string;
    voice: GoogleTtsVoice;
    speakingRate: number;
    pitch: number;
}

class GoogleTtsService {
    private apiKey = config.apiKeys.tts;

    public async synthesize(options: SynthesizeSpeechOptions): Promise<Blob> {
        if (!this.apiKey) {
            throw new Error("TTS API key is not configured for Google TTS service.");
        }

        // Handle either plain text or SSML
        const isSsml = options.text.trim().startsWith('<speak>');
        const input = isSsml ? { ssml: options.text } : { text: options.text };

        const body = {
            input: input,
            voice: options.voice,
            audioConfig: {
                audioEncoding: 'MP3',
                speakingRate: options.speakingRate,
                pitch: options.pitch,
            },
        };

        // Log the raw JSON payload being sent to the Google TTS API
        console.log(`[TTS Service] Sending to Google TTS (raw payload):`, JSON.stringify(body, null, 2));

        const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            let errorBody = 'Could not read error response body.';
            try {
                errorBody = await response.text();
            } catch (e) { /* ignore */ }
            console.error(`Google TTS API Error: Status ${response.status}. Response: ${errorBody}`);
            throw new Error(`Google TTS API request failed with status ${response.status}: ${errorBody}`);
        }

        const data: any = await response.json();
        const audioBuffer = Buffer.from(data.audioContent, 'base64');
        return new Blob([audioBuffer], { type: 'audio/mpeg' });
    }
}

export const googleTtsService = new GoogleTtsService();
