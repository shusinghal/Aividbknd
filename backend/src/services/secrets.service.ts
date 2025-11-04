import * as fs from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'crypto';

const LOCAL_DATA_PATH = path.resolve(__dirname, '..', '..', 'data');
const SECRETS_FILE_PATH = path.join(LOCAL_DATA_PATH, 'secrets.json');

class SecretsService {
    private secrets: Map<string, string> = new Map();

    public async initialize(): Promise<void> {
        try {
            await fs.access(SECRETS_FILE_PATH);
            const fileContent = await fs.readFile(SECRETS_FILE_PATH, 'utf-8');
            const secretsObject = JSON.parse(fileContent);
            this.secrets = new Map(Object.entries(secretsObject));
            console.log(`Loaded ${this.secrets.size} secrets.`);
        } catch {
            await fs.writeFile(SECRETS_FILE_PATH, '{}', 'utf-8');
            console.log('Created empty secrets.json');
        }
    }

    private async persist(): Promise<void> {
        const secretsObject = Object.fromEntries(this.secrets);
        await fs.writeFile(SECRETS_FILE_PATH, JSON.stringify(secretsObject, null, 2));
    }

    public async saveSecret(secretValue: string): Promise<string> {
        const randomSuffix = randomBytes(3).toString('hex');
        const keyId = `key_${Date.now()}_${randomSuffix}`;
        this.secrets.set(keyId, secretValue);
        await this.persist();
        return keyId;
    }

    public async getSecret(keyId: string): Promise<string | undefined> {
        // In a real application, this would fetch from a secure vault.
        // For local dev, we read from our map which was loaded from the file.
        return this.secrets.get(keyId);
    }
}

export const secretsService = new SecretsService();