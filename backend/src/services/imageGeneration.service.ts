// src/services/imageGeneration.service.ts

// At the very top of your main application file (e.g., app.js or server.js)
require('dotenv').config(); // If you're using dotenv to load your .env file

import { PredictionServiceClient } from '@google-cloud/aiplatform';

// Ensure your project ID and location are set, either directly or via GOOGLE_CLOUD_PROJECT
const project = process.env.GOOGLE_CLOUD_PROJECT; // e.g., 'aivideo-474823'
const location = 'us-central1'; // Or your desired region (e.g., 'asia-southeast1')

// Initialize the client
const clientOptions = {
    apiEndpoint: `${location}-aiplatform.googleapis.com`,
};
const predictionServiceClient = new PredictionServiceClient(clientOptions);

async function generateImage(prompt: string, aspectRatio = '1:1', sampleCount = 1): Promise<string[]> {
    if (!project) {
        throw new Error("GOOGLE_CLOUD_PROJECT environment variable not set.");
    }

    const endpoint = `projects/${project}/locations/${location}/publishers/google/models/imagen-3.0-generate-001:predict`; // Or your chosen model

    const instance = {
        prompt: prompt,
        // Add other parameters if needed, e.g., negative_prompt
    };

    const parameters = {
        sampleCount: sampleCount,
        aspectRatio: aspectRatio,
        // You can add more parameters like `seed`, `safetyFilterLevel`, etc.
        // Refer to the Imagen model documentation for all available parameters.
    };

    const request = {
        endpoint: endpoint,
        instances: [instance],
        parameters: parameters,
    };

    try {
        const [response] = await predictionServiceClient.predict(request);

        // Process the response
        const predictions = response.predictions;
        if (!predictions || predictions.length === 0) {
            throw new Error('No predictions received from the model.');
        }

        // Each prediction contains an encoded image
        const images = predictions.map(prediction => {
            const imageBytes = prediction.bytesBase64Encoded as string;
            // You might want to decode and save this image (e.g., to a file or send as base64 in API response)
            return imageBytes; // This is the base64 encoded image string
        });

        return images; // Returns an array of base64 image strings
    } catch (err: any) {
        console.error('Error generating image:', err);
        throw err;
    }
}

// Example usage in your route handler:
/*
// Assuming this is within your router.post('/single-image', ...)
router.post('/single-image', async (req, res, next) => {
    try {
        const { sceneDescription, visualStyle, characterDescription } = req.body;
        if (!sceneDescription || !visualStyle) return res.status(400).json({ message: 'sceneDescription and visualStyle are required.' });

        const prompt = `${sceneDescription}, ${visualStyle}` + (characterDescription ? `, featuring ${characterDescription}` : '');
        const base64Images = await generateImage(prompt, '1:1', 1); // Request one 1:1 image

        res.json({ base64Image: base64Images[0] }); // Assuming you want to return the first image
    } catch(error) {
        next(error);
    }
});
*/

// You can export this function if you want to use it from other modules
export const imageGenerationService = { generateImage };