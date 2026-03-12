const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Mock user for now, will integrate with Notion later
const MOCK_USERS = [
    {
        email: 'admin',
        password: '$2b$10$Dz6xKlXGlkQr8tAvUaQlouZOEbUvgmoG5MgtFJ4.v3uqfwHEwcmsm',
        role: 'admin'
    },
    {
        email: 'user',
        password: '$2b$10$Dz6xKlXGlkQr8tAvUaQlouZOEbUvgmoG5MgtFJ4.v3uqfwHEwcmsm',
        role: 'customer'
    }
];

router.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { email, password: hashedPassword, role: email.includes('admin') ? 'admin' : 'customer' };
    MOCK_USERS.push(newUser);

    const token = jwt.sign({ email: newUser.email, role: newUser.role }, process.env.JWT_SECRET || 'secret');
    res.json({ user: { email: newUser.email, role: newUser.role }, token });
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = MOCK_USERS.find(u => u.email === email);

    if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET || 'secret');
        return res.json({ user: { email: user.email, role: user.role }, token });
    }

    res.status(401).json({ message: 'Invalid credentials' });
});

module.exports = router;
