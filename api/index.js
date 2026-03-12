const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require('./auth');
const subscriberRoutes = require('./subscribers');
const contentRoutes = require('./content');
const distributionRoutes = require('./distribution');
const platformRoutes = require('./platforms');
const notificationRoutes = require('./notifications');

app.use('/api/auth', authRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/distribution', distributionRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/notifications', notificationRoutes);

// Serve uploaded files
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CreatorHub API ACTIVE' });
});

// Port for local development
const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
