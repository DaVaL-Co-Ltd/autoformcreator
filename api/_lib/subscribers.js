const express = require('express');
const router = express.Router();

// In-memory store
const subscribers = [];
const groups = [];

// POST /api/subscribers - Create subscriber (public)
router.post('/', (req, res) => {
  const { name, phone, email, kakaoId, consentNewsletter, consentPrivacy } = req.body;
  if (!name || !phone || !email) {
    return res.status(400).json({ message: '이름, 전화번호, 이메일은 필수입니다.' });
  }
  if (!consentPrivacy) {
    return res.status(400).json({ message: '개인정보 수집 동의는 필수입니다.' });
  }
  const existing = subscribers.find(s => s.email === email);
  if (existing) {
    return res.status(409).json({ message: '이미 등록된 이메일입니다.' });
  }
  const subscriber = {
    id: crypto.randomUUID(),
    name, phone, email,
    kakaoId: kakaoId || null,
    consentNewsletter: !!consentNewsletter,
    consentPrivacy: !!consentPrivacy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  subscribers.push(subscriber);
  res.status(201).json(subscriber);
});

// GET /api/subscribers - List all
router.get('/', (req, res) => {
  res.json(subscribers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// GET /api/subscribers/groups - List groups
router.get('/groups', (req, res) => {
  res.json(groups);
});

// POST /api/subscribers/groups - Create group
router.post('/groups', (req, res) => {
  const { name, memberIds } = req.body;
  if (!name) return res.status(400).json({ message: '그룹 이름은 필수입니다.' });
  const group = {
    id: crypto.randomUUID(),
    name,
    memberIds: memberIds || [],
    createdAt: new Date().toISOString(),
  };
  groups.push(group);
  res.status(201).json(group);
});

// GET /api/subscribers/:id
router.get('/:id', (req, res) => {
  const sub = subscribers.find(s => s.id === req.params.id);
  if (!sub) return res.status(404).json({ message: '구독자를 찾을 수 없습니다.' });
  res.json(sub);
});

// PUT /api/subscribers/:id
router.put('/:id', (req, res) => {
  const idx = subscribers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: '구독자를 찾을 수 없습니다.' });
  const updates = req.body;
  subscribers[idx] = { ...subscribers[idx], ...updates, updatedAt: new Date().toISOString() };
  res.json(subscribers[idx]);
});

// DELETE /api/subscribers/:id
router.delete('/:id', (req, res) => {
  const idx = subscribers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: '구독자를 찾을 수 없습니다.' });
  subscribers.splice(idx, 1);
  res.status(204).send();
});

module.exports = router;
module.exports.subscribers = subscribers;
module.exports.groups = groups;
