import { Router } from 'express';
import { githubService } from '../services/github.service';
import { secretsService } from '../services/secrets.service';
import { google } from 'googleapis';

const router = Router();

router.post('/fetch', async (req, res, next) => {
    try {
        const { socialAccountId } = req.body;
        if (!socialAccountId) {
            return res.status(400).json({ message: 'socialAccountId is required.' });
        }

        const accounts = await githubService.getSocialAccounts();
        const account = accounts.find(a => a.id === socialAccountId);

        if (!account) {
            return res.status(404).json({ message: `Social account with id '${socialAccountId}' not found.` });
        }

        const keyId = account.auth?.keyId;
        if (!keyId) {
            return res.status(400).json({ message: `Account '${socialAccountId}' does not have a configured keyId.` });
        }

        const secret = await secretsService.getSecret(keyId);
        if (!secret) {
            return res.status(404).json({ message: `Secret for keyId '${keyId}' not found. The key may be invalid or expired.` });
        }

        let analyticsData;

        if (account.platform.toLowerCase() === 'youtube') {
            const channelId = account.auth?.channelId;
            if (!channelId) {
                return res.status(400).json({ message: `YouTube account '${socialAccountId}' is missing a channelId.` });
            }

            try {
                const youtube = google.youtube({
                    version: 'v3',
                    auth: secret // Your API key
                });

                const response = await youtube.channels.list({
                    part: ['statistics', 'snippet'],
                    id: [channelId],
                });

                const channel = response.data.items?.[0];
                if (!channel || !channel.statistics) {
                    return res.status(404).json({ message: `Could not find channel statistics for ID '${channelId}'.` });
                }

                const stats = channel.statistics;
                analyticsData = {
                    impressions: stats.viewCount || "0", // Note: viewCount is a proxy for impressions here
                    subscribers: stats.subscriberCount || "0",
                    videoCount: stats.videoCount || "0",
                    lastUpdated: new Date().toISOString(),
                };

            } catch (apiError: any) {
                console.error('YouTube API Error:', apiError.message);
                return res.status(500).json({ message: 'Failed to fetch data from YouTube API.', error: apiError.message });
            }
        } else {
            return res.status(400).json({ message: `Analytics for platform '${account.platform}' is not yet supported.` });
        }

        res.status(200).json(analyticsData);
    } catch (error) {
        next(error);
    }
});

export default router;