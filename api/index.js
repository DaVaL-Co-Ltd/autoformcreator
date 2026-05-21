const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());

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
