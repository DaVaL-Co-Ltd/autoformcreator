const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./auth');
const requestRoutes = require('./requests');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'DaVal API is running' });
});

// Port for local development
const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
