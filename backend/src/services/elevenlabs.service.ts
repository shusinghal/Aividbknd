
import fetch from 'node-fetch';
import config from '../config';

class ElevenLabsService {
    private apiKey = config.apiKeys.elevenlabs;
    private baseUrl = 'https://api.elevenlabs.io/v1';

    private async request(endpoint: string, options: any = {}) {
        if (!this.apiKey) throw new Error("ElevenLabs API key is not configured.");
        const headers = {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
            ...options.headers,
        };
        const response = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });
        if (!response.ok) {
            const errorText = await response.text();
            const message = `ElevenLabs API Error: ${response.status} ${response.statusText} - ${errorText}`;
            console.error(message);
            throw new Error(message);
        }
        return response;
    }

    public async getVoices() {
        const response = await this.request('/voices');
        return response.json();
    }

    public async generateAudio(script: string, tone: string): Promise<Blob> {
        // Note: The iterative voice selection logic would live in the Gemini service,
        // which would then call this method with the final chosen voice ID.
        // For simplicity here, we'll just pick a default. A real implementation would pass the voiceId.
        const voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel (default)
        const response = await this.request(`/text-to-speech/${voiceId}`, {
            method: 'POST',
            body: JSON.stringify({
                text: script,
                model_id: 'eleven_multilingual_v2'
            }),
        });
        return response.blob();
    }
}

export const elevenlabsService = new ElevenLabsService();
