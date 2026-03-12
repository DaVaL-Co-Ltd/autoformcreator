const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, fileFilter: (req, file, cb) => {
  if (file.mimetype === 'application/pdf') cb(null, true);
  else cb(new Error('PDF 파일만 업로드 가능합니다.'), false);
}});

// In-memory store
const contents = [];

// Mock AI analysis
const mockAnalyze = (title) => ({
  summary: `"${title}"의 핵심 내용을 AI가 분석했습니다. 이 책은 현대 사회에서의 자기 성장과 변화의 필요성을 강조하며, 실질적인 행동 전략을 제시합니다. 저자는 10년간의 연구와 현장 경험을 바탕으로, 개인과 조직 모두에게 적용 가능한 혁신적 사고 방식을 소개합니다.`,
  highlights: [
    '변화는 선택이 아닌 필수이다. 현재의 안정에 안주하는 것은 미래의 위험을 키우는 것과 같다.',
    '매일 1%의 개선이 1년 후 37배의 성장을 만든다. 작은 습관의 힘을 과소평가하지 마라.',
    '성공한 사람들의 공통점은 실패를 두려워하지 않는 것이 아니라, 실패에서 빠르게 배우는 능력이다.',
    '디지털 시대에서 가장 중요한 역량은 기술이 아니라 적응력과 학습 능력이다.',
    '진정한 리더십은 명령이 아닌 영감에서 시작된다. 사람들이 스스로 움직이게 만드는 것이 핵심이다.',
    '네트워킹의 본질은 받는 것이 아니라 주는 것이다. 먼저 가치를 제공하면 관계는 자연스럽게 따라온다.',
    '시간 관리의 핵심은 할 일을 늘리는 것이 아니라, 하지 않을 일을 정하는 것이다.',
  ],
});

// Mock content generation
const mockGenerate = (title, highlights) => {
  const hl = highlights.join('\n');
  return {
    blog: `# ${title} - 핵심 요약 및 리뷰\n\n## 들어가며\n오늘은 "${title}"의 핵심 내용을 정리해보겠습니다. 이 책에서 가장 인상 깊었던 부분들을 선별하여 여러분과 나누고자 합니다.\n\n## 핵심 인사이트\n\n${highlights.map((h, i) => `### ${i + 1}. ${h.slice(0, 20)}...\n${h}\n\n이 메시지는 우리에게 매일의 실천이 얼마나 중요한지 다시 한번 상기시켜 줍니다.`).join('\n\n')}\n\n## 마무리\n이 책은 변화의 시대를 살아가는 모든 이에게 실질적인 가이드를 제공합니다. 특히 자기 성장에 관심 있는 분들에게 강력히 추천합니다.\n\n#자기계발 #독서리뷰 #성장마인드셋`,

    instagram: {
      caption: `📚 "${title}" 핵심 요약\n\n${highlights[0]}\n\n이 한 문장이 제 삶을 바꿨습니다.\n\n변화는 거창한 것이 아닙니다.\n매일 조금씩, 꾸준히.\n그것이 진짜 성장입니다. 💪\n\n👉 프로필 링크에서 전체 리뷰를 확인하세요!\n\n#독서그램 #자기계발 #성장 #동기부여 #책추천 #오늘의명언 #독서스타그램 #북스타그램`,
      imagePrompt: `Minimalist book cover art with Korean text "${title}", warm gradient background from coral to golden yellow, floating geometric shapes, modern typography, inspirational mood, clean design`,
    },

    longformScript: `[롱폼 영상 스크립트 - "${title}"]\n\n[인트로 - 0:00~0:30]\n(카메라 정면, 책을 들고)\n안녕하세요, 오늘은 제가 최근 읽은 "${title}"에 대해 이야기해보려고 합니다.\n이 책은 정말 많은 생각을 하게 만들었는데요.\n\n[본론 1 - 0:30~3:00]\n(B-roll: 책 페이지 넘기는 장면)\n먼저 가장 인상 깊었던 내용부터 말씀드릴게요.\n\n"${highlights[0]}"\n\n이 부분을 읽으면서 저는 정말 많이 반성했습니다.\n우리가 변화를 미루는 이유는 뭘까요?\n\n[본론 2 - 3:00~6:00]\n두 번째로 중요한 포인트는...\n"${highlights[1]}"\n\n1%의 개선이라는 개념이 정말 와닿았습니다.\n\n[본론 3 - 6:00~8:00]\n"${highlights[2]}"\n\n실패에 대한 관점을 바꾸면 모든 것이 달라집니다.\n\n[마무리 - 8:00~10:00]\n오늘 이야기한 내용 정리해드릴게요.\n1. 변화는 필수다\n2. 작은 습관이 큰 차이를 만든다\n3. 실패에서 배우는 능력이 핵심이다\n\n이 책 정말 추천드립니다. 구독과 좋아요 부탁드려요!`,

    shortformScript: `[숏폼 영상 스크립트 - 60초]\n\n[0~5초] Hook\n(텍스트 오버레이: "${title}")\n"이 한 문장이 제 인생을 바꿨습니다"\n\n[5~15초]\n${highlights[0]}\n\n[15~30초]\n(빠른 컷 전환)\n매일 1%만 성장하면\n1년 후에 37배가 됩니다\n\n[30~45초]\n성공한 사람들의 비밀?\n실패를 두려워하지 않는 게 아닙니다\n실패에서 빠르게 배우는 겁니다\n\n[45~55초]\n오늘부터 시작하세요\n작은 변화가 큰 차이를 만듭니다\n\n[55~60초] CTA\n더 자세한 내용은 프로필 링크에서!\n팔로우하고 매일 성장 인사이트 받으세요 🔥`,

    newsletter: `안녕하세요!\n\n오늘은 최근 읽은 "${title}"에서 얻은 인사이트를 공유드립니다.\n\n━━━━━━━━━━━━━━━━━━━━\n\n📖 이번 주의 핵심 메시지\n\n${highlights.slice(0, 3).map((h, i) => `${i + 1}. ${h}`).join('\n\n')}\n\n━━━━━━━━━━━━━━━━━━━━\n\n💡 실천 포인트\n\n이번 주에 하나만 실천해보세요:\n• 매일 10분씩 독서하기\n• 하루 끝에 배운 것 1가지 적기\n• 작은 습관 하나 시작하기\n\n━━━━━━━━━━━━━━━━━━━━\n\n📺 관련 콘텐츠\n• 블로그 전체 리뷰 보기\n• 유튜브 영상으로 보기\n• 인스타그램에서 핵심 카드뉴스 보기\n\n다음 주에도 유용한 콘텐츠로 찾아뵙겠습니다.\n감사합니다! 🙏\n\n- CreatorHub 팀 드림\n\n※ 본 메일은 뉴스레터 수신에 동의하신 분들에게 발송됩니다.\n수신 거부를 원하시면 아래 링크를 클릭해주세요.`,
  };
};

// POST /api/content/upload
router.post('/upload', upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'PDF 파일이 필요합니다.' });
  const content = {
    id: crypto.randomUUID(),
    title: req.body.title || req.file.originalname.replace('.pdf', ''),
    filename: req.file.filename,
    originalName: req.file.originalname,
    fileSize: req.file.size,
    status: 'uploaded',
    summary: null,
    highlights: [],
    selectedHighlights: [],
    generatedContent: null,
    imageUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  contents.push(content);
  res.status(201).json(content);
});

// POST /api/content/:id/analyze
router.post('/:id/analyze', (req, res) => {
  const content = contents.find(c => c.id === req.params.id);
  if (!content) return res.status(404).json({ message: '콘텐츠를 찾을 수 없습니다.' });

  content.status = 'analyzing';
  // Simulate AI delay
  setTimeout(() => {
    const result = mockAnalyze(content.title);
    content.summary = result.summary;
    content.highlights = result.highlights;
    content.status = 'analyzed';
    content.updatedAt = new Date().toISOString();
  }, 500);

  // Return immediately with analyzing status, then after delay it updates
  setTimeout(() => {
    res.json({ summary: content.summary || mockAnalyze(content.title).summary, highlights: content.highlights.length ? content.highlights : mockAnalyze(content.title).highlights });
    if (content.status === 'analyzing') {
      const result = mockAnalyze(content.title);
      content.summary = result.summary;
      content.highlights = result.highlights;
      content.status = 'analyzed';
      content.updatedAt = new Date().toISOString();
    }
  }, 800);
});

// PUT /api/content/:id/highlights
router.put('/:id/highlights', (req, res) => {
  const content = contents.find(c => c.id === req.params.id);
  if (!content) return res.status(404).json({ message: '콘텐츠를 찾을 수 없습니다.' });
  content.selectedHighlights = req.body.selectedHighlights || [];
  content.updatedAt = new Date().toISOString();
  res.json(content);
});

// POST /api/content/:id/generate
router.post('/:id/generate', (req, res) => {
  const content = contents.find(c => c.id === req.params.id);
  if (!content) return res.status(404).json({ message: '콘텐츠를 찾을 수 없습니다.' });
  const hl = content.selectedHighlights.length > 0 ? content.selectedHighlights : content.highlights;
  const generated = mockGenerate(content.title, hl);
  content.generatedContent = generated;
  content.status = 'generated';
  content.updatedAt = new Date().toISOString();
  res.json(generated);
});

// POST /api/content/:id/image
router.post('/:id/image', (req, res) => {
  const content = contents.find(c => c.id === req.params.id);
  if (!content) return res.status(404).json({ message: '콘텐츠를 찾을 수 없습니다.' });
  content.imageUrl = `https://placehold.co/800x600/6366f1/ffffff?text=${encodeURIComponent(content.title)}`;
  content.updatedAt = new Date().toISOString();
  res.json({ imageUrl: content.imageUrl });
});

// GET /api/content
router.get('/', (req, res) => {
  res.json(contents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// GET /api/content/:id
router.get('/:id', (req, res) => {
  const content = contents.find(c => c.id === req.params.id);
  if (!content) return res.status(404).json({ message: '콘텐츠를 찾을 수 없습니다.' });
  res.json(content);
});

// PUT /api/content/:id
router.put('/:id', (req, res) => {
  const idx = contents.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: '콘텐츠를 찾을 수 없습니다.' });
  const updates = req.body;
  contents[idx] = { ...contents[idx], ...updates, updatedAt: new Date().toISOString() };
  res.json(contents[idx]);
});

// DELETE /api/content/:id
router.delete('/:id', (req, res) => {
  const idx = contents.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ message: '콘텐츠를 찾을 수 없습니다.' });
  contents.splice(idx, 1);
  res.status(204).send();
});

module.exports = router;
module.exports.contents = contents;
