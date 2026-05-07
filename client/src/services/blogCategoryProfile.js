const BLOG_IMAGE_STYLE_LABELS = {
  pastel: '파스텔 일러스트',
  '3d': '3D 렌더링',
  photo: '사실적 사진',
  watercolor: '수채화',
  'solid-pattern': '단색/패턴 배경',
}

export const BLOG_CATEGORY_PROFILES = {
  book_promo: {
    id: 'book_promo',
    label: '도서',
    goal: '도서의 관점과 메시지에 관심을 만들고 신뢰를 쌓습니다.',
    titlePattern: '도서명과 핵심 질문을 함께 보여주는 제목',
    introPattern: '책이 다루는 실제 고민이나 현장 문제로 시작합니다.',
    bodyPattern: ['문제 제기', '책의 핵심 메시지', '인상적인 포인트 설명', '독자에게 주는 의미'],
    ctaLevel: 'low',
    recommendedImageStyle: 'watercolor',
    classifierHints: ['도서', '책', '출간', '저자', '읽어보', '독서', '북토크'],
    promptLines: [
      '책 내용을 단순 요약하지 말고, 왜 지금 읽을 가치가 있는지 해석하세요.',
      '교육, 학습, 진로와 연결되는 시사점을 자연스럽게 붙이세요.',
      '홍보성 문구는 약하게 유지하세요.',
    ],
  },
  lecture_event: {
    id: 'lecture_event',
    label: '강연/특강',
    goal: '행사 정보를 명확히 전달하고 신청 의도를 만듭니다.',
    titlePattern: '행사명과 핵심 주제를 먼저 보여주는 제목',
    introPattern: '누가 왜 들어야 하는지부터 짚습니다.',
    bodyPattern: ['행사 주제', '대상 독자', '일정 및 방식', '강연자 소개', '참여 기대효과'],
    ctaLevel: 'high',
    recommendedImageStyle: 'photo',
    classifierHints: ['특강', '강연', '설명회', '세미나', '참여', '신청', '현장', '오프라인', '온라인'],
    promptLines: [
      '대상, 일정, 장소, 신청 조건을 빠뜨리지 말고 분명히 쓰세요.',
      '공지형 글이지만 딱딱하지 않게 참여 가치를 설명하세요.',
      '마지막에는 신청 또는 참여 유도를 분명하게 넣으세요.',
    ],
  },
  concept_digest: {
    id: 'concept_digest',
    label: '교과서 기본 개념 정리',
    goal: '기초 개념을 쉽게 설명하면서 전문성을 보여줍니다.',
    titlePattern: '개념명과 쉬운 비유 또는 학습 포인트를 결합한 제목',
    introPattern: '호기심을 끄는 비유나 익숙한 상황으로 시작합니다.',
    bodyPattern: ['개념 소개', '비유 또는 예시', '배경 설명', '학습 포인트 정리'],
    ctaLevel: 'low',
    recommendedImageStyle: 'pastel',
    classifierHints: ['개념', '정리', '교과서', '기본', '원리', '쉽게', '이해', '왜', '무엇'],
    promptLines: [
      '정의만 나열하지 말고 독자가 이해하기 쉬운 비유를 먼저 제시하세요.',
      '설명은 정확하게 하되 문장은 가볍고 읽기 쉽게 유지하세요.',
      '학습에 바로 도움이 되는 한 줄 정리를 남기세요.',
    ],
  },
  admissions_strategy_style_1: {
    id: 'admissions_strategy_style_1',
    label: '입시 및 학습 전략 스타일 1',
    goal: '성적, 과목, 학습 습관과 관련된 실전 전략을 제공합니다.',
    titlePattern: '대상 + 과목/상황 + 목표 결과 + 실전 가이드',
    introPattern: '왜 지금 이 시점에 중요한지 강하게 설명합니다.',
    bodyPattern: ['상황 진단', '핵심 원칙', '단계별 전략', '실수 방지 포인트'],
    ctaLevel: 'low',
    recommendedImageStyle: 'solid-pattern',
    classifierHints: ['내신', '모의고사', '학습 전략', '공부법', '성적', '과목', '등급', '학년', '준비법'],
    promptLines: [
      '현장 전문가가 즉시 실행 가능한 조언을 주는 느낌으로 쓰세요.',
      '원칙만 말하지 말고 단계별 실행 포인트를 구체적으로 제시하세요.',
      '학생과 학부모가 흔히 하는 실수를 함께 짚어주세요.',
    ],
  },
  admissions_strategy_style_2: {
    id: 'admissions_strategy_style_2',
    label: '입시 및 학습 전략 스타일 2',
    goal: '제도 변화, 활동 운영, 방향 전환에 대한 전략적 판단을 돕습니다.',
    titlePattern: '변화 요소 또는 활동명 + 전략 포인트',
    introPattern: '최근 변화나 이전 맥락과 연결해 시작합니다.',
    bodyPattern: ['무엇이 바뀌었는지', '핵심 포인트 3~5개', '적용 방법', '정리'],
    ctaLevel: 'low',
    recommendedImageStyle: 'solid-pattern',
    classifierHints: ['개편', '변화', '전형', '운영', '활동', '방향', '체제', '포인트', '대응'],
    promptLines: [
      '제도 변화나 운영 포인트를 판단 기준 중심으로 정리하세요.',
      '정보 전달에 그치지 말고 독자가 어떻게 대응해야 하는지 연결하세요.',
      '연재형 맥락이나 최근 변화가 있으면 자연스럽게 이어주세요.',
    ],
  },
  knowledge_insight: {
    id: 'knowledge_insight',
    label: '지식공유',
    goal: '생각거리와 통찰을 제공하면서 브랜드 신뢰를 쌓습니다.',
    titlePattern: '개념, 인물, 질문과 해석을 결합한 제목',
    introPattern: '질문이나 짧은 통찰 문장으로 시작합니다.',
    bodyPattern: ['개념 또는 인물 소개', '예시나 연구 연결', '삶/학습과의 연결', '해석적 결론'],
    ctaLevel: 'low',
    recommendedImageStyle: 'watercolor',
    classifierHints: ['생각', '통찰', '철학', '사회', '심리', '질문', '의미', '왜 이런'],
    promptLines: [
      '정의나 정보보다 해석과 연결에 무게를 두세요.',
      '학습, 삶, 사회와 어떤 관련이 있는지 풀어주세요.',
      '읽고 나서 생각이 남는 마무리를 지향하세요.',
    ],
  },
  resource_share: {
    id: 'resource_share',
    label: '자료나눔 및 공유',
    goal: '자료 배포와 신청 전환을 명확하게 이끕니다.',
    titlePattern: '자료명 + 제공 방식 + 마감/조건을 보여주는 제목',
    introPattern: '현장에서 왜 이 자료가 필요한지부터 말합니다.',
    bodyPattern: ['자료 필요성', '제공 내용', '구성 요소', '신청 조건/마감'],
    ctaLevel: 'high',
    recommendedImageStyle: 'solid-pattern',
    classifierHints: ['자료', '배포', '나눔', '공유', '다운로드', '제공', '신청', '마감', '폼'],
    promptLines: [
      '무엇을 주는지보다 왜 필요한 자료인지 먼저 설명하세요.',
      '구성품, 대상, 신청 방법, 마감을 빠짐없이 정리하세요.',
      '행동 유도는 분명하게 쓰되 과장하지 마세요.',
    ],
  },
  service_promo: {
    id: 'service_promo',
    label: '자체 서비스 홍보',
    goal: '서비스 이해와 문의 전환을 함께 만듭니다.',
    titlePattern: '서비스명 + 활용 장면 또는 기대 효과',
    introPattern: '독자가 겪는 진짜 문제를 먼저 꺼냅니다.',
    bodyPattern: ['문제 인식', '서비스 소개', '핵심 기능', '이용 흐름', '기대 효과'],
    ctaLevel: 'medium',
    recommendedImageStyle: 'photo',
    classifierHints: ['서비스', '상담', '프로그램', '진로', '컨설팅', '소개', '이용', '도움'],
    promptLines: [
      '기능 나열보다 문제 해결 흐름으로 설득하세요.',
      '어떤 독자에게 어떤 장면에서 도움이 되는지 구체적으로 쓰세요.',
      '신뢰를 먼저 만들고 CTA는 후반부에 배치하세요.',
    ],
  },
  interview_prep: {
    id: 'interview_prep',
    label: '대입면접',
    goal: '면접 준비 방향과 답변 포인트를 실전형으로 제공합니다.',
    titlePattern: '면접 주제 + 학과/상황 + 준비 포인트',
    introPattern: '면접에서 무엇을 평가하는지부터 설명합니다.',
    bodyPattern: ['상황 또는 학과 구분', '예상 질문', '답변 포인트', '준비 전략'],
    ctaLevel: 'low',
    recommendedImageStyle: 'solid-pattern',
    classifierHints: ['면접', '질문', '답변', '인성', '전공적합성', '예상 문항', '준비'],
    promptLines: [
      '면접관의 평가 포인트를 먼저 분명히 적으세요.',
      '정답 제시보다 사고 방향과 답변 구조를 알려주세요.',
      '전공, 상황, 전형 유형별로 적용 가능하게 정리하세요.',
    ],
  },
}

export const BLOG_CATEGORY_OPTIONS = [
  { value: '', label: '카테고리를 선택하세요' },
  ...Object.values(BLOG_CATEGORY_PROFILES).map(({ id, label }) => ({ value: id, label })),
]

export function getBlogCategoryProfile(categoryId) {
  if (!categoryId) return null
  return BLOG_CATEGORY_PROFILES[categoryId] || null
}

export function isValidBlogCategoryId(categoryId) {
  return Boolean(getBlogCategoryProfile(categoryId))
}

export function getBlogCategoryLabel(categoryId) {
  return getBlogCategoryProfile(categoryId)?.label || ''
}

export function getBlogImageStyleLabel(styleId) {
  return BLOG_IMAGE_STYLE_LABELS[styleId] || styleId || ''
}

export function inferBlogCategoryHeuristically(sourceText = '') {
  const text = String(sourceText || '').toLowerCase()
  let bestId = 'admissions_strategy_style_1'
  let bestScore = 0

  Object.values(BLOG_CATEGORY_PROFILES).forEach((profile) => {
    const score = profile.classifierHints.reduce((total, keyword) => {
      return total + (text.includes(String(keyword).toLowerCase()) ? 1 : 0)
    }, 0)

    if (score > bestScore) {
      bestScore = score
      bestId = profile.id
    }
  })

  return bestId
}
