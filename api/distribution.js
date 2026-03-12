const express = require('express');
const router = express.Router();

const distributions = [];

// POST /api/distribution/publish
router.post('/publish', (req, res) => {
  const { contentId, contentTitle, platform } = req.body;
  if (!contentId || !platform) return res.status(400).json({ message: '콘텐츠와 플랫폼을 선택해주세요.' });
  const dist = {
    id: crypto.randomUUID(),
    contentId, contentTitle: contentTitle || '제목 없음',
    platform, type: 'immediate',
    status: 'published',
    publishedAt: new Date().toISOString(),
    scheduledAt: null,
    createdAt: new Date().toISOString(),
  };
  distributions.push(dist);
  res.status(201).json(dist);
});

// POST /api/distribution/schedule
router.post('/schedule', (req, res) => {
  const { contentId, contentTitle, platform, scheduledAt } = req.body;
  if (!contentId || !platform || !scheduledAt) return res.status(400).json({ message: '콘텐츠, 플랫폼, 예약 시간을 지정해주세요.' });
  const dist = {
    id: crypto.randomUUID(),
    contentId, contentTitle: contentTitle || '제목 없음',
    platform, type: 'scheduled',
    status: 'scheduled',
    publishedAt: null,
    scheduledAt,
    createdAt: new Date().toISOString(),
  };
  distributions.push(dist);
  res.status(201).json(dist);
});

// GET /api/distribution
router.get('/', (req, res) => {
  res.json(distributions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// GET /api/distribution/:id
router.get('/:id', (req, res) => {
  const dist = distributions.find(d => d.id === req.params.id);
  if (!dist) return res.status(404).json({ message: '배포 기록을 찾을 수 없습니다.' });
  res.json(dist);
});

module.exports = router;
module.exports.distributions = distributions;
