import { Router, Request, Response, NextFunction } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { githubService } from '../services/github.service';
import fetch from 'node-fetch';

const CUSTOM_DATA_PATH = path.resolve(__dirname, '..', '..', 'data', 'custom');

const router = Router();

interface AssetRequestBody {
    fileName: string;
    content: string; // base64 encoded
}

/**
 * Middleware to validate the filename for JSON file operations.
 */
const validateJsonFilename = (req: Request, res: Response, next: NextFunction) => {
    const filename = req.body.filename || req.params.filename;

    if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ message: 'Filename is required.' });
    }

    // Basic validation: ensure filename is simple and ends with .json
    if (!/^[a-zA-Z0-9_-]+\.json$/.test(filename)) {
        return res.status(400).json({ message: 'Invalid filename. Only alphanumeric characters, underscores, and hyphens are allowed, and it must end with .json' });
    }

    // Prevent directory traversal
    if (filename.includes('..')) {
        return res.status(400).json({ message: 'Invalid filename.' });
    }

    next();
};

// POST /api/files - Add/update a JSON file
router.post('/', validateJsonFilename, async (req, res, next) => {
    try {
        const { filename, content } = req.body;

        if (typeof content !== 'object' || content === null) {
            return res.status(400).json({ message: 'Request body must contain a valid JSON object as content.' });
        }

        const filePath = path.join(CUSTOM_DATA_PATH, filename);

        await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
        res.status(201).json({ message: `File '${filename}' saved successfully.` });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/files - Delete a JSON file
router.delete('/', validateJsonFilename, async (req, res, next) => {
    try {
        const { filename } = req.body;

        const filePath = path.join(CUSTOM_DATA_PATH, filename);

        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ message: `File '${filename}' not found.` });
        }

        await fs.unlink(filePath);
        res.status(200).json({ message: `File '${filename}' deleted successfully.` });
    } catch (error) {
        next(error);
    }
});

// POST /api/files/content - Get content of a JSON file
router.post('/content', validateJsonFilename, async (req, res, next) => {
    try {
        const { filename } = req.body;

        const filePath = path.join(CUSTOM_DATA_PATH, filename);

        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ message: `File '${filename}' not found.` });
        }

        const fileContent = await fs.readFile(filePath, 'utf-8');
        res.status(200).json(JSON.parse(fileContent));
    } catch (error) {
        next(error);
    }
});

// GET /api/files/images - Retrieves image assets
router.get('/images', async (req, res, next) => {
    try {
        const count = req.query.count ? parseInt(req.query.count as string, 10) : undefined;
        let images = await githubService.getAssets('image');
        if (count !== undefined && count > 0) images = images.slice(0, count);
        res.json(images);
    } catch (error) {
        next(error);
    }
});

// GET /api/files/audio/:name - Retrieves a single audio asset by name
router.get('/audio/', async (req, res, next) => {
    try {
        const count = req.query.count ? parseInt(req.query.count as string, 10) : undefined;
        let audios = await githubService.getAssets('audio');
        if (count !== undefined && count > 0) audios = audios.slice(0, count);
        res.json(audios);
    } catch (error) {
        next(error);
    }
});

// POST /api/files/image - Saves a new image asset
router.post('/image', async (req, res, next) => {
    try {
        const { fileName, content } = req.body as AssetRequestBody;
        if (!fileName || !content) {
            return res.status(400).send('Missing fileName or content in request body.');
        }
        await githubService.saveAsset('image', fileName, content);
        res.status(201).send({ message: `Image asset '${fileName}' saved successfully.` });
    } catch (error) {
        next(error);
    }
});

// POST /api/assets/save-from-url - Downloads an image from a URL and saves it
router.post('/save-from-url', async (req, res, next) => {
    try {
        const { imageUrl, fileName } = req.body;

        if (!imageUrl || typeof imageUrl !== 'string') {
            return res.status(400).json({ success: false, message: 'A valid imageUrl is required.' });
        }
        if (!fileName || typeof fileName !== 'string') {
            return res.status(400).json({ success: false, message: 'A valid fileName is required.' });
        }

        console.log(`[Asset] Downloading image from URL: ${imageUrl}`);
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to download image. Status: ${response.status} ${response.statusText}`);
        }

        const imageBuffer = await response.buffer();
        const base64Content = imageBuffer.toString('base64');

        await githubService.saveAsset('image', fileName, base64Content);

        res.status(200).json({ success: true, message: 'Image saved successfully.', fileName });

    } catch (error) {
        next(error);
    }
});

// POST /api/files/audio - Saves a new audio asset
router.post('/audio', async (req, res, next) => {
    try {
        const { fileName, content } = req.body as AssetRequestBody;
        if (!fileName || !content) {
            return res.status(400).send('Missing fileName or content in request body.');
        }
        await githubService.saveAsset('audio', fileName, content);
        res.status(201).send({ message: `Audio asset '${fileName}' saved successfully.` });
    } catch (error) {
        next(error);
    }
});

export default router;
