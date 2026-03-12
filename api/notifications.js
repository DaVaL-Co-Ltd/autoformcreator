const express = require('express');
const router = express.Router();

const notifications = [];

// POST /api/notifications/send
router.post('/send', (req, res) => {
  const { title, message, channels, targetGroup, targetCount, contentId } = req.body;
  if (!title || !message || !channels?.length) {
    return res.status(400).json({ message: '제목, 메시지, 발송 채널은 필수입니다.' });
  }
  const notification = {
    id: crypto.randomUUID(),
    title, message,
    channels, // ['email', 'kakao', 'sms']
    targetGroup: targetGroup || '전체',
    targetCount: targetCount || 0,
    contentId: contentId || null,
    status: 'sent',
    sentAt: new Date().toISOString(),
    stats: {
      total: targetCount || Math.floor(Math.random() * 100) + 20,
      success: 0, failed: 0, openRate: 0, clickRate: 0,
    },
    createdAt: new Date().toISOString(),
  };
  // Mock stats
  notification.stats.success = Math.floor(notification.stats.total * (0.9 + Math.random() * 0.1));
  notification.stats.failed = notification.stats.total - notification.stats.success;
  notification.stats.openRate = Math.floor(40 + Math.random() * 35);
  notification.stats.clickRate = Math.floor(10 + Math.random() * 25);

  notifications.push(notification);
  res.status(201).json(notification);
});

// GET /api/notifications
router.get('/', (req, res) => {
  res.json(notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// GET /api/notifications/:id/stats
router.get('/:id/stats', (req, res) => {
  const noti = notifications.find(n => n.id === req.params.id);
  if (!noti) return res.status(404).json({ message: '알림을 찾을 수 없습니다.' });
  res.json(noti.stats);
});

module.exports = router;
module.exports.notifications = notifications;
