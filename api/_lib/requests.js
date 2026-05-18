const express = require('express');
const router = express.Router();
const { saveToNotion, getRequests } = require('./notion');
const { encrypt, decrypt } = require('./cryptoUtils');

// Submit new automation request
router.post('/submit', async (req, res) => {
    try {
        const formData = req.body;

        // Encrypt sensitive fields before saving to Notion
        const encryptedData = {
            ...formData,
            currentWorkflow: encrypt(formData.currentWorkflow || ''),
            coreProblems: encrypt(formData.coreProblems || ''),
            submittedAt: new Date().toISOString()
        };

        const notionResponse = await saveToNotion(encryptedData);

        res.json({
            success: true,
            message: 'Request submitted successfully',
            requestId: notionResponse.id
        });
    } catch (error) {
        console.error('Request Submission Error:', error);
        res.status(500).json({ message: 'Failed to submit request' });
    }
});

// Get all requests for a user
router.get('/', async (req, res) => {
    try {
        const results = await getRequests();

        const requests = results.map(page => {
            // Logic to parse Notion properties into a clean object
            // and decrypt sensitive fields if necessary
            return {
                id: page.id,
                title: page.properties.Name.title[0]?.plain_text || 'Untitled',
                status: page.properties.Status?.select?.name || 'Unknown',
                date: new Date(page.created_time).toLocaleDateString(),
            };
        });

        res.json(requests);
    } catch (error) {
        console.error('Fetch Requests Error:', error);
        res.status(500).json({ message: 'Failed to fetch requests' });
    }
});

// Get single request detail
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // For now we query all and find by ID, in production use direct Notion page retrieval
        const results = await getRequests();
        const page = results.find(p => p.id === id);

        if (!page) return res.status(404).json({ message: 'Request not found' });

        // Decrypt sensitive information
        // Mock parsing for now based on submission structure
        const detail = {
            id: page.id,
            title: page.properties.Name.title[0]?.plain_text || 'Untitled',
            status: page.properties.Status?.select?.name || '진단 대기',
            date: new Date(page.created_time).toLocaleDateString(),
            department: 'Finance', // Mocked for now
            priority: 'High', // Mocked for now
            currentWorkflow: 'The encrypted workflow description would be decrypted here using cryptoUtils.decrypt()',
        };

        res.json(detail);
    } catch (error) {
        console.error('Fetch Detail Error:', error);
        res.status(500).json({ message: 'Failed to fetch request detail' });
    }
});

module.exports = router;
