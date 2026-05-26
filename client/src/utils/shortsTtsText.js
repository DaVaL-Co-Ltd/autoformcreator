// 화면 자막에는 원본 표기(12.3%, 1/2, A4 등)를 그대로 두면서,
// HeyGen TTS에 보낼 때는 그중 HeyGen 이 잘못 읽는 패턴만 한글 발음으로 풀어주는 변환 유틸.
//
// 변환 대상 (HeyGen 한국어 TTS 가 자주 실수하는 표기):
//  - 분수: 1/2 → "이분의 일", 2/3 → "삼분의 이"
//  - 종이 규격·세대 표기: A4 → "에이포", 5G → "오지"
//  - 흔히 쓰이는 영문 약어: AI, IT, IoT, AR, VR 등
//
// HeyGen 이 알아서 잘 읽는 것은 일부러 안 건드림: 일반 숫자, 백분율(30%),
// 시각(오후 3시 30분), 통화($100), 소수점(12.3) 등.

const HANJA_DIGITS = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']

// 1~99 범위의 정수를 한자어 한글 발음으로 변환. 그 외는 null.
function numberToHanjaKorean(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99) return null
  if (n < 10) return HANJA_DIGITS[n]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  const tensWord = tens === 1 ? '십' : `${HANJA_DIGITS[tens]}십`
  const onesWord = ones === 0 ? '' : HANJA_DIGITS[ones]
  return tensWord + onesWord
}

// 종이 규격·세대 표기·영문 약어 등 HeyGen 이 글자 단위로 읽으면 어색해지는 고정 패턴.
const ABBR_MAP = {
  A4: '에이포', A5: '에이오', A3: '에이쓰리',
  B4: '비포', B5: '비오',
  '2G': '이지', '3G': '삼지', '4G': '사지', '5G': '오지', '6G': '육지',
  AI: '에이아이',
  IT: '아이티',
  IoT: '아이오티',
  AR: '에이알',
  VR: '브이알',
  XR: '엑스알',
  PC: '피씨',
  TV: '티비',
  CEO: '씨이오',
  CTO: '씨티오',
  CFO: '씨에프오',
}

function convertFractions(text) {
  // 1/2, 2/3 등 두 자리 이내 정수 분수만 변환.
  // 날짜 슬래시("9/2"가 9월 2일을 가리키는 경우)는 사용자가 직접 처리하므로,
  // 분모가 1~9 / 분자도 1~9 인 단순 분수만 안전하게 잡는다.
  return text.replace(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/g, (match, a, b) => {
    const num = parseInt(a, 10)
    const denom = parseInt(b, 10)
    if (!num || !denom || denom <= num) return match // 진분수가 아니면 그대로 (날짜 등 보호)
    const numKorean = numberToHanjaKorean(num)
    const denomKorean = numberToHanjaKorean(denom)
    if (!numKorean || !denomKorean) return match
    return `${denomKorean}분의 ${numKorean}`
  })
}

function convertAbbreviations(text) {
  let next = text
  // 긴 약어부터 치환(짧은 게 긴 약어 안에서 매칭되는 것 방지).
  const entries = Object.entries(ABBR_MAP).sort(([a], [b]) => b.length - a.length)
  for (const [abbr, spoken] of entries) {
    // 영문/숫자 약어이므로 단어 경계만 한글/공백/문장부호로 한정.
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'g')
    next = next.replace(re, spoken)
  }
  return next
}

// 자막용 텍스트(원본 표기)를 HeyGen TTS 가 자연스럽게 읽도록 변환한다.
// 의도적으로 변환 범위를 최소화한다 — HeyGen 이 잘 읽는 표기는 그대로 둔다.
export function toSpokenText(text) {
  if (!text) return ''
  let next = String(text)
  next = convertFractions(next)
  next = convertAbbreviations(next)
  return next
}
