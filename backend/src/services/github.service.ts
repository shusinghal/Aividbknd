import * as fs from 'fs/promises';
import * as path from 'path';

// Type definitions
interface Company { name: string; description: string; [key: string]: any; }
interface Niche { name: string; [key: string]: any; }
interface Asset { name: string; url: string; sha: string; } // sha can be empty string for local

const LOCAL_DATA_PATH = path.resolve(__dirname, '..', '..', 'data');
const COMPANIES_FILE_PATH = path.join(LOCAL_DATA_PATH, 'companies.json');
const NICHES_FILE_PATH = path.join(LOCAL_DATA_PATH, 'niches.json');
const ASSETS_PATH = path.join(LOCAL_DATA_PATH, 'assets');
const IMAGE_ASSETS_PATH = path.join(ASSETS_PATH, 'images');
const AUDIO_ASSETS_PATH = path.join(ASSETS_PATH, 'audio');
const VIDEO_ASSETS_PATH = path.join(ASSETS_PATH, 'videos');


class GithubService {

    // --- Initialization ---
    public async initializeLocalData(): Promise<void> {
        console.log('Initializing local data storage...');
        await fs.mkdir(LOCAL_DATA_PATH, { recursive: true });
        await fs.mkdir(ASSETS_PATH, { recursive: true });
        await fs.mkdir(IMAGE_ASSETS_PATH, { recursive: true });
        await fs.mkdir(AUDIO_ASSETS_PATH, { recursive: true });
        await fs.mkdir(VIDEO_ASSETS_PATH, { recursive: true });


        try {
            await fs.access(COMPANIES_FILE_PATH);
        } catch {
            await fs.writeFile(COMPANIES_FILE_PATH, '[]', 'utf-8');
            console.log('Created empty companies.json');
        }

        try {
            await fs.access(NICHES_FILE_PATH);
        } catch {
            await fs.writeFile(NICHES_FILE_PATH, '[]', 'utf-8');
            console.log('Created empty niches.json');
        }
        console.log('Local data storage initialized.');
    }

    // --- Local File Methods for Company/Niche ---
    private async readLocalFile<T>(filePath: string): Promise<T[]> {
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(fileContent) as T[];
        } catch (error) {
            if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    private async writeLocalFile<T>(filePath: string, data: T[]): Promise<void> {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }

    // Company Methods
    public async getCompanies(): Promise<Company[]> {
        return this.readLocalFile<Company>(COMPANIES_FILE_PATH);
    }
    public async saveCompany(company: Company): Promise<Company> {
        const companies = await this.getCompanies();
        const index = companies.findIndex(c => c.name === company.name);
        if (index > -1) companies[index] = company;
        else companies.push(company);
        await this.writeLocalFile(COMPANIES_FILE_PATH, companies);
        return company;
    }
    public async deleteCompany(companyName: string): Promise<void> {
        const companies = await this.getCompanies();
        const updated = companies.filter(c => c.name !== companyName);
        if (updated.length === companies.length) return; // No change
        await this.writeLocalFile(COMPANIES_FILE_PATH, updated);
    }

    // Niche Methods
    public async getNiches(): Promise<Niche[]> {
        return this.readLocalFile<Niche>(NICHES_FILE_PATH);
    }
    public async saveNiche(niche: Niche): Promise<Niche> {
        const niches = await this.getNiches();
        const index = niches.findIndex(n => n.name === niche.name);
        if (index > -1) niches[index] = niche;
        else niches.push(niche);
        await this.writeLocalFile(NICHES_FILE_PATH, niches);
        return niche;
    }

    // Asset Methods
    private getAssetPath(assetType: 'image' | 'audio' | 'video'): string {
        switch (assetType) {
            case 'image': return IMAGE_ASSETS_PATH;
            case 'audio': return AUDIO_ASSETS_PATH;
            case 'video': return VIDEO_ASSETS_PATH;
        }
    }

    public async saveAsset(assetType: 'image' | 'audio' | 'video', fileName: string, base64Content: string): Promise<void> {
        const assetPath = this.getAssetPath(assetType);
        const filePath = path.join(assetPath, fileName);
        const buffer = Buffer.from(base64Content, 'base64');
        await fs.writeFile(filePath, buffer);
        console.log(`Saved asset to ${filePath}`);
    }

    public async getAssets(assetType: 'image' | 'audio' | 'video'): Promise<Asset[]> {
        const assetPath = this.getAssetPath(assetType);
        try {
            const files = await fs.readdir(assetPath);
            return files.map(file => ({
                name: file,
                url: path.join(assetPath, file),
                sha: '' // Not applicable for local storage
            }));
        } catch (error) {
            if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    public async deleteAsset(assetType: 'image' | 'audio' | 'video', fileName: string, sha: string): Promise<void> {
        const assetPath = this.getAssetPath(assetType);
        const filePath = path.join(assetPath, fileName);
        try {
            await fs.unlink(filePath);
            console.log(`Deleted asset from ${filePath}`);
        } catch (error) {
            if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
                console.warn(`Asset not found for deletion: ${filePath}`);
                return;
            }
            throw error;
        }
    }

    public async getGroupedAssets() {
        const [images, audio, videos] = await Promise.all([
            this.getAssets('image'),
            this.getAssets('audio'),
            this.getAssets('video'),
        ]);

        const groups = new Map<string, any>();
        const imageRegex = /(.+)_(\d+)_(\d+)\.(jpg|jpeg|png)/;
        const audioRegex = /(.+)_(\d+)\.mp3/;
        const videoRegex = /(.+)_(\d+)\.mp4/;

        images.forEach(image => {
            const match = image.name.match(imageRegex);
            if (!match) return;
            const groupId = match[2];
            if (!groups.has(groupId)) {
                groups.set(groupId, {
                    id: groupId,
                    companyName: 'Unknown',
                    date: new Date(parseInt(groupId, 10)),
                    images: [],
                    audio: null,
                    video: null,
                    thumbnailUrl: image.url,
                });
            }
            groups.get(groupId)!.images.push(image);
        });

        audio.forEach(a => {
            const match = a.name.match(audioRegex);
            if (!match) return;
            const companyNameRaw = match[1];
            const groupId = match[2];
            const companyName = companyNameRaw.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (groups.has(groupId)) {
                const group = groups.get(groupId)!;
                group.audio = a;
                group.companyName = companyName;
            }
        });

        videos.forEach(v => {
             const match = v.name.match(videoRegex);
             if (!match) return;
             const companyNameRaw = match[1];
             const groupId = match[2];
             const companyName = companyNameRaw.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
             if (groups.has(groupId)) {
                 const group = groups.get(groupId)!;
                 group.video = v;
                 group.companyName = companyName;
             }
        });

        return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
    }
}

export const githubService = new GithubService();