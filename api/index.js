const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors({ exposedHeaders: ['Retry-After'] }));

// Body parser, but skip llamaparse upload (it reads raw stream)
app.use((req, res, next) => {
  if (req.url.startsWith('/api/llamaparse/upload')) return next();
  return express.json({ limit: '50mb' })(req, res, next);
});

// Express routers (CRUD style)
app.use('/api/auth', require('./_lib/auth'));
app.use('/api/subscribers', require('./_lib/subscribers'));
app.use('/api/content', require('./_lib/content'));
app.use('/api/distribution', require('./_lib/distribution'));
app.use('/api/platforms', require('./_lib/platforms'));
app.use('/api/notifications', require('./_lib/notifications'));
app.use('/api/requests', require('./_lib/requests'));

// Adapter: Vercel-style handler -> Express middleware
// Express ":id" params are merged into req.query so handlers reading req.query.id keep working.
function vercel(handler) {
  return async (req, res, next) => {
    req.query = { ...req.query, ...req.params };
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_err) {
    return { error: text };
  }
}

function getHeygenApiKey(res) {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' });
    return null;
  }
  return apiKey;
}

// Health
app.get('/api/health', vercel(require('./_lib/health')));

// Extractions
app.get('/api/extractions', vercel(require('./_lib/extractions/index')));
app.post('/api/extractions', vercel(require('./_lib/extractions/index')));
app.patch('/api/extractions/:id/media', vercel(require('./_lib/extractions/[id]/media')));
app.patch('/api/extractions/:id/content', vercel(require('./_lib/extractions/[id]/content')));
app.patch('/api/extractions/:id/upload-status', vercel(require('./_lib/extractions/[id]/upload-status')));
app.delete('/api/extractions/:id/channels/:channel', vercel(require('./_lib/extractions/[id]/channels/[channel]')));
app.get('/api/extractions/:id', vercel(require('./_lib/extractions/[id]/index')));
app.delete('/api/extractions/:id', vercel(require('./_lib/extractions/[id]/index')));

// Gemini
app.post('/api/gemini/generate-content', vercel(require('./_lib/gemini/generate-content')));
app.get('/api/gemini/validate', vercel(require('./_lib/gemini/validate')));

// HeyGen v3 proxy routes used by direct Avatar IV/V shorts generation.
app.post('/api/heygen/v3/videos', async (req, res) => {
  const apiKey = getHeygenApiKey(res);
  if (!apiKey) return;
  try {
    const response = await fetch('https://api.heygen.com/v3/videos', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const data = await readJsonResponse(response);
    if (!response.ok) return res.status(response.status).json(data);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/heygen/v3/videos/:videoId', async (req, res) => {
  const apiKey = getHeygenApiKey(res);
  if (!apiKey) return;
  try {
    const videoId = encodeURIComponent(req.params.videoId);
    const response = await fetch(`https://api.heygen.com/v3/videos/${videoId}`, {
      headers: { 'X-Api-Key': apiKey },
    });
    const data = await readJsonResponse(response);
    if (!response.ok) return res.status(response.status).json(data);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/heygen/v3/avatar-look/:lookId', async (req, res) => {
  const apiKey = getHeygenApiKey(res);
  if (!apiKey) return;
  try {
    const lookId = encodeURIComponent(req.params.lookId);
    const response = await fetch(`https://api.heygen.com/v3/avatars/looks/${lookId}`, {
      headers: { 'X-Api-Key': apiKey },
    });
    const data = await readJsonResponse(response);
    if (!response.ok) return res.status(response.status).json(data);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Instagram
app.get('/api/instagram/auth-status', vercel(require('./_lib/instagram/auth-status')));
app.get('/api/instagram/auth-url', vercel(require('./_lib/instagram/auth-url')));
app.post('/api/instagram/logout', vercel(require('./_lib/instagram/logout')));
app.get('/api/instagram/oauth/callback', vercel(require('./_lib/instagram/oauth/callback')));

// YouTube
app.get('/api/youtube/auth-status', vercel(require('./_lib/youtube/auth-status')));
app.get('/api/youtube/auth-url', vercel(require('./_lib/youtube/auth-url')));
app.post('/api/youtube/logout', vercel(require('./_lib/youtube/logout')));
app.get('/api/youtube/oauth/callback', vercel(require('./_lib/youtube/oauth/callback')));

// Llamaparse: mounted for local dev (Vercel routes to standalone files via file-system match).
// Map ":jobId" route param to req.query.jobId so handlers reading req.query keep working.
app.post('/api/llamaparse/upload', vercel(require('./llamaparse/upload')));
app.get('/api/llamaparse/job/:jobId', vercel(require('./llamaparse/job/[jobId]/index')));
app.get('/api/llamaparse/job/:jobId/result/markdown', vercel(require('./llamaparse/job/[jobId]/result/markdown')));

// Serve uploaded files
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Local dev server
const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
