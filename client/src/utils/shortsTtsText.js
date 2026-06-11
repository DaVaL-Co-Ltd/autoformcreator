// 화면 자막에는 원본 표기(12.3%, 1/2, A4 등)를 그대로 두면서,
// HeyGen TTS에 보낼 때는 그중 HeyGen 이 잘못 읽는 패턴만 한글 발음으로 풀어주는 변환 유틸.
//
// 변환 대상 (HeyGen 한국어 TTS 가 자주 실수하는 표기):
//  - 분수: 1/2 → "이분의 일", 2/3 → "삼분의 이"
//  - 종이 규격·세대 표기: A4 → "에이포", 5G → "오지"
//  - 흔히 쓰이는 영문 약어: AI, IT, IoT, AR, VR 등
//  - 연도/학년도·퍼센트·간단한 정수: 2028학년도 → "이천이십팔학년도", 0.1% → "영점 일 퍼센트"
//  - 화면용 기호/목록 구분: "1."·"·"·":" 등은 말하기용 쉼으로 정리
//
// HeyGen 이 알아서 잘 읽거나 문맥 오해 위험이 큰 것은 일부러 안 건드림:
// 시각(오후 3시 30분), 통화($100), 전화번호/ID 같은 긴 숫자열 등.

const HANJA_DIGITS = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
const NATIVE_COUNTER_DIGITS = {
  1: '한',
  2: '두',
  3: '세',
  4: '네',
  5: '다섯',
  6: '여섯',
  7: '일곱',
  8: '여덟',
  9: '아홉',
  10: '열',
}
const PUNCTUATION_RE = /[.!?。！？]$/

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

// 0~9999 범위의 정수를 한자어 한글 발음으로 변환. TTS가 숫자 뭉치를 끊어 읽는 경우를 줄인다.
function integerToHanjaKorean(n) {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return null
  if (n <= 99) return numberToHanjaKorean(n)
  const units = [
    { value: 1000, word: '천' },
    { value: 100, word: '백' },
    { value: 10, word: '십' },
  ]
  let rest = n
  let out = ''
  for (const unit of units) {
    const digit = Math.floor(rest / unit.value)
    if (digit > 0) {
      out += digit === 1 ? unit.word : `${HANJA_DIGITS[digit]}${unit.word}`
      rest %= unit.value
    }
  }
  if (rest > 0) out += HANJA_DIGITS[rest]
  return out || HANJA_DIGITS[0]
}

function decimalToHanjaKorean(value) {
  const raw = String(value)
  if (!raw.includes('.')) return integerToHanjaKorean(Number(raw))
  const [integerPart, decimalPart] = raw.split('.')
  const integerWord = integerToHanjaKorean(Number(integerPart))
  if (!integerWord || !decimalPart) return null
  return `${integerWord}점 ${decimalPart.split('').map((d) => HANJA_DIGITS[Number(d)] || d).join(' ')}`
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

function convertSpeechNumbers(text) {
  let next = text

  // 2028학년도, 2026년처럼 읽히는 단위가 명확한 4자리 숫자만 변환한다.
  next = next.replace(/(?<![\d.])(\d{4})(학년도|년도|년)(?!\d)/g, (match, raw, suffix) => {
    const spoken = integerToHanjaKorean(Number(raw))
    return spoken ? `${spoken}${suffix}` : match
  })

  // 백분율은 HeyGen이 퍼센트 앞 숫자를 끊어 읽는 경우가 많아 발음으로 풀어준다.
  next = next.replace(/(?<![\d.])(\d{1,4}(?:\.\d{1,2})?)\s*%/g, (match, raw) => {
    const spoken = decimalToHanjaKorean(raw)
    return spoken ? `${spoken} 퍼센트` : match
  })

  // "5등급제", "3학년"처럼 붙여 읽어야 자연스러운 교육 용어를 먼저 처리한다.
  next = next.replace(/(?<![\d.])(\d{1,2})(등급제|등급|학년|학기|단계)(?!\d)/g, (match, raw, suffix) => {
    const spoken = numberToHanjaKorean(Number(raw))
    return spoken ? `${spoken}${suffix}` : match
  })

  // "상위 1등", "3가지"처럼 짧고 단위가 붙은 숫자만 보수적으로 변환한다.
  next = next.replace(/(?<![\d.])(\d{1,2})(가지|개|명|등|위|초|분)(?![\d가-힣])/g, (match, raw, suffix) => {
    const value = Number(raw)
    const useNativeCounter = ['가지', '개', '명'].includes(suffix)
    const spoken = useNativeCounter
      ? NATIVE_COUNTER_DIGITS[value]
      : numberToHanjaKorean(value)
    return spoken ? `${spoken} ${suffix}` : match
  })

  return next
}

function normalizeSpeechPacing(text) {
  let next = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  // 화면에서는 보기 좋은 구분 기호지만 TTS에는 단어 중간 끊김처럼 들릴 수 있어 쉼으로 바꾼다.
  next = next
    .replace(/\bScene\s*(\d{1,2})\b/gi, '씬 $1')
    .replace(/\s*[•·]\s*/g, '. ')
    .replace(/\s*[|]\s*/g, '. ')
    .replace(/\s*[:：]\s*/g, '. ')
    .replace(/^\s*\d{1,2}[.)]\s+/g, '')
    .replace(/\s+-\s+/g, '. ')

  // 한글 단어 사이의 슬래시는 말로 풀고, 숫자 분수/날짜 가능성이 있는 슬래시는 앞 단계에 맡긴다.
  next = next.replace(/([가-힣])\s*\/\s*([가-힣])/g, '$1 또는 $2')

  // 너무 촘촘한 쉼표는 짧은 호흡으로 바꾸되, 숫자 소수점/천 단위에는 관여하지 않는다.
  next = next.replace(/\s*,\s*/g, ', ')
  next = next.replace(/([가-힣]{6,}),\s*([가-힣]{6,})/g, '$1. $2')

  // 문장 끝 부호가 없으면 TTS가 다음 문장과 붙여 읽기 쉬워 마침표를 보강한다.
  if (next && !PUNCTUATION_RE.test(next)) next += '.'
  return next.replace(/\s+/g, ' ').trim()
}

// 자막용 텍스트(원본 표기)를 HeyGen TTS 가 자연스럽게 읽도록 변환한다.
// 의도적으로 변환 범위를 최소화한다 — HeyGen 이 잘 읽는 표기는 그대로 둔다.
export function toSpokenText(text) {
  if (!text) return ''
  let next = String(text)
  next = convertFractions(next)
  next = convertAbbreviations(next)
  next = convertSpeechNumbers(next)
  next = normalizeSpeechPacing(next)
  return next
}
