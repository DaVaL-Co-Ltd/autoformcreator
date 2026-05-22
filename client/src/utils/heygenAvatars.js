// HeyGen 아바타·보이스 ID 의 단일 진실 소스 (Single Source of Truth).
// 새 아바타 추가나 ID 변경은 반드시 이 파일을 먼저 수정한다.
// presetShortsAvatars.js · shortsVideoConcepts.js 가 모두 여기서 import 한다.
// scripts/generate_voice_previews.mjs 는 Node 격리상 같은 데이터를 별도 보관하므로
// 이 파일을 변경하면 그 스크립트도 함께 동기화해야 한다.

// 강아지 제자는 두 사진 아바타를 번갈아 쓴다.
// 모듈 로드 시(스크립트 실행 / 앱 세션)마다 풀에서 1개를 랜덤으로 골라 그 세션 동안 사용한다.
// presetShortsAvatars.js 가 DOG_STUDENT_AVATAR_ID 를 import 해 같은 값을 공유한다.
const DOG_STUDENT_AVATAR_POOL = [
  '0217c7e94ab548df9f4422d29cbd0fea',
  'f51d84b6b19645dbbeedf326379be949',
]
export const DOG_STUDENT_AVATAR_ID =
  DOG_STUDENT_AVATAR_POOL[Math.floor(Math.random() * DOG_STUDENT_AVATAR_POOL.length)]

export const HEYGEN_AVATARS = {
  dongwan_ssaem: {
    id: 'dongwan_ssaem',
    name: '동완쌤',
    kind: 'Person Avatar',
    avatarId: 'bd28ab87ed834bf5a72a5923536182c6',
    defaultVoiceId: '8da71a32beeb45ffa0182276233333c6',
    // avatarGroupId: HeyGen avatar group — 영상 생성 시 그룹 안 룩 중 9:16 하나를 랜덤 선택.
    // HeyGen 에서 그룹에 룩을 추가하면 코드 수정 없이 자동 반영된다.
    avatarGroupId: 'e173e545a897462cb3979eece141d6ed',
  },
  fry_ssaem: {
    id: 'fry_ssaem',
    name: '후라이쌤',
    kind: 'Person Avatar',
    // avatarId 는 그룹 안 룩 중 하나(폴백용 기본값) — "책상에 앉은 선생님" 9:16(1536x2752).
    avatarId: 'adebcddfb2e94c869e484e946bb275ae',
    defaultVoiceId: '3a6f4521058a436ebf97d42152dae017',
    avatarGroupId: 'cfdf4447704f4e44b92cd984dd9b28cc',
  },
  male_student: {
    id: 'male_student',
    name: '남자 제자',
    kind: 'Person Avatar',
    avatarId: '29708244eaa5487e976af960aa51e207',
    defaultVoiceId: '3097f9a8fd3b4340b6bbe913177b378f',
  },
  female_student: {
    id: 'female_student',
    name: '여자 제자',
    kind: 'Person Avatar',
    // 9:16 세로 Alexa 룩(창가 미소). 쇼츠(9:16) 프레이밍을 위해 세로 룩만 사용한다.
    // (이전 a5454d8b… 룩은 16:9 가로라 세로 영상에서 프레이밍이 깨져 교체함)
    avatarId: '59fbce86969e49d5bb33cd0a443b8cff',
    defaultVoiceId: '86956bc34b7248d7be34eb3a6f69d03b',
  },
  dog_student: {
    id: 'dog_student',
    name: '강아지 제자',
    kind: 'Animal Avatar',
    avatarId: DOG_STUDENT_AVATAR_ID,
    defaultVoiceId: 'aceb4659b9e7420483800bbf698e9e24',
  },
  interview_student: {
    id: 'interview_student',
    name: '면접 제자',
    kind: 'Person Avatar',
    // mock_interview(면접 클리닉)의 답변 예시 제자. voice 는 여자 제자 voice 를 쓴다.
    avatarId: '035099a76bb048d49ea59ec8d34588e0',
    defaultVoiceId: '86956bc34b7248d7be34eb3a6f69d03b',
  },
}

export const HEYGEN_AVATAR_LIST = Object.values(HEYGEN_AVATARS)

export const HEYGEN_AVATAR_IDS = Object.fromEntries(
  HEYGEN_AVATAR_LIST.map((a) => [a.id, a.avatarId]),
)

export function findHeygenAvatarByAvatarId(avatarId) {
  return HEYGEN_AVATAR_LIST.find((a) => a.avatarId === avatarId) || null
}
