const express = require('express');
const router = express.Router();

const platforms = [];

// GET /api/platforms
router.get('/', (req, res) => {
  res.json(platforms);
});

// POST /api/platforms/connect
router.post('/connect', (req, res) => {
  const { type } = req.body;
  const allowed = ['youtube', 'instagram', 'naver'];
  if (!type || !allowed.includes(type)) {
    return res.status(400).json({ message: '유효한 플랫폼 타입을 지정해주세요. (youtube, instagram, naver)' });
  }
  const existing = platforms.find(p => p.type === type);
  if (existing) return res.status(409).json({ message: '이미 연결된 플랫폼입니다.' });

  const names = { youtube: 'YouTube', instagram: 'Instagram', naver: '네이버 블로그' };
  const platform = {
    id: crypto.randomUUID(),
    type,
    name: names[type],
    accountName: type === 'youtube' ? '크리에이터 채널' : type === 'instagram' ? '@creator_official' : 'creator_blog',
    status: 'connected',
    connectedAt: new Date().toISOString(),
  };
  platforms.push(platform);
  res.status(201).json(platform);
});

// DELETE /api/platforms/:id
router.delete('/:id', (req, res) => {
  const idx = platforms.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: '플랫폼을 찾을 수 없습니다.' });
  platforms.splice(idx, 1);
  res.status(204).send();
});

// GET /api/platforms/:id/stats
router.get('/:id/stats', (req, res) => {
  const platform = platforms.find(p => p.id === req.params.id);
  if (!platform) return res.status(404).json({ message: '플랫폼을 찾을 수 없습니다.' });
  const mockStats = {
    youtube: { subscribers: 4823, videos: 142, views: 582400, avgViews: 4100 },
    instagram: { followers: 12540, posts: 389, avgLikes: 845, avgComments: 67 },
    naver: { subscribers: 3210, posts: 567, dailyVisits: 1820, totalVisits: 284300 },
  };
  res.json({ platformId: platform.id, type: platform.type, ...(mockStats[platform.type] || {}) });
});

module.exports = router;
module.exports.platforms = platforms;
