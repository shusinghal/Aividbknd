import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';

const CUSTOM_DATA_PATH = path.resolve(__dirname, '..', '..', 'data', 'custom');

const router = Router();

// POST /api/files - Add/update a JSON file
router.post('/', async (req, res, next) => {
    try {
        const { filename, content } = req.body;

        if (!filename || typeof filename !== 'string') {
            return res.status(400).json({ message: 'Filename is required in the request body.' });
        }

        // Basic validation: ensure filename is simple and ends with .json
        if (!/^[a-zA-Z0-9_-]+\.json$/.test(filename)) {
            return res.status(400).json({ message: 'Invalid filename. Only alphanumeric characters, underscores, and hyphens are allowed, and it must end with .json' });
        }
        // Prevent directory traversal
        if (filename.includes('..')) {
            return res.status(400).json({ message: 'Invalid filename.' });
        }

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
router.delete('/', async (req, res, next) => {
    try {
        const { filename } = req.body;

        if (!filename || typeof filename !== 'string') {
            return res.status(400).json({ message: 'Filename is required in the request body.' });
        }

        // Basic validation: ensure filename is simple and ends with .json
        if (!/^[a-zA-Z0-9_-]+\.json$/.test(filename)) {
            return res.status(400).json({ message: 'Invalid filename. Only alphanumeric characters, underscores, and hyphens are allowed, and it must end with .json' });
        }
        // Prevent directory traversal
        if (filename.includes('..')) {
            return res.status(400).json({ message: 'Invalid filename.' });
        }

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
router.post('/content', async (req, res, next) => {
    try {
        const { filename } = req.body;

        if (!filename || typeof filename !== 'string') {
            return res.status(400).json({ message: 'Filename is required in the request body.' });
        }

        // Basic validation: ensure filename is simple and ends with .json
        if (!/^[a-zA-Z0-9_-]+\.json$/.test(filename)) {
            return res.status(400).json({ message: 'Invalid filename. Only alphanumeric characters, underscores, and hyphens are allowed, and it must end with .json' });
        }
        // Prevent directory traversal
        if (filename.includes('..')) {
            return res.status(400).json({ message: 'Invalid filename.' });
        }

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

export default router;
