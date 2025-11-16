import { Router } from 'express';
import { githubService } from '../services/github.service';
import { secretsService } from '../services/secrets.service';

const router = Router();

// GET /api/social-accounts - Retrieve all social accounts
router.get('/', async (req, res, next) => {
    try {
        const accounts = await githubService.getSocialAccounts();
        res.status(200).json(accounts);
    } catch (error) {
        next(error);
    }
});

// POST /api/social-accounts - Create a new social account
router.post('/', async (req, res, next) => {
    try {
        const { platform, accountName, auth } = req.body;
        if (!platform || !accountName || !auth || !auth.keyId) {
            return res.status(400).json({ message: 'platform, accountName, and auth object with keyId are required.' });
        }

        // Verify that the keyId corresponds to an actual secret before creating the account.
        const secretExists = await secretsService.getSecret(auth.keyId);
        if (!secretExists) {
            return res.status(400).json({ message: `The provided keyId '${auth.keyId}' is invalid or does not correspond to a saved secret.` });
        }

        const newAccount = await githubService.createSocialAccount({ platform, accountName, auth });
        res.status(201).json(newAccount);
    } catch (error) {
        next(error);
    }
});

// PUT /api/social-accounts/:id - Update an existing social account
router.put('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const accountData = req.body;

        if (!id || accountData.id !== id) {
            return res.status(400).json({ message: 'ID in URL and body must match.' });
        }

        const accounts = await githubService.getSocialAccounts();
        const existingAccount = accounts.find(a => a.id === id);

        if (!existingAccount) {
            return res.status(404).json({ message: `Account with id '${id}' not found.` });
        }

        const updatedAccount = await githubService.updateSocialAccount(accountData);
        res.status(200).json(updatedAccount);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/social-accounts/:id - Delete an existing social account
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const accounts = await githubService.getSocialAccounts();
        const existingAccount = accounts.find(a => a.id === id);

        if (!existingAccount) {
            return res.status(404).json({ message: `Account with id '${id}' not found.` });
        }

        await githubService.deleteSocialAccount(id);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export default router;