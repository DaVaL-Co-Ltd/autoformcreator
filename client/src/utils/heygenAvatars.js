// HeyGen 아바타·보이스 ID 의 단일 진실 소스 (Single Source of Truth).
// 새 아바타 추가나 ID 변경은 반드시 이 파일을 먼저 수정한다.
// presetShortsAvatars.js · shortsVideoConcepts.js 가 모두 여기서 import 한다.
// scripts/generate_voice_previews.mjs 는 Node 격리상 같은 데이터를 별도 보관하므로
// 이 파일을 변경하면 그 스크립트도 함께 동기화해야 한다.

export const HEYGEN_AVATARS = {
  dongwan_ssaem: {
    id: 'dongwan_ssaem',
    name: '동완쌤',
    kind: 'Person Avatar',
    // 단일 룩 ID 미사용 — avatarId 자리에 group ID 를 둬서 resolveAvatarGroupLook 이
    // 항상 그룹 안 9:16 룩 중 하나를 자동 선택하도록 한다.
    avatarId: '618714c6b4054f8fbd2d6a17f0e4a1e8',
    defaultVoiceId: '664ed0c5de6b4532adfb951094ff2707',
    avatarGroupId: '618714c6b4054f8fbd2d6a17f0e4a1e8',
  },
  fry_ssaem: {
    id: 'fry_ssaem',
    name: '후라이쌤',
    kind: 'Person Avatar',
    // 단일 룩 ID 미사용 — avatarId 자리에 group ID 를 둬서 resolveAvatarGroupLook 이
    // 항상 그룹 안 9:16 룩 중 하나를 자동 선택하도록 한다.
    avatarId: '45b17934d52348e691547a1240f3e49d',
    defaultVoiceId: 'ab103893aefd45fca1d1eea500f2ee4b',
    avatarGroupId: '45b17934d52348e691547a1240f3e49d',
  },
  male_student: {
    id: 'male_student',
    name: '남자 제자',
    kind: 'Person Avatar',
    avatarId: '4685b2dd1eda48d1902b588b122ed613',
    defaultVoiceId: '3097f9a8fd3b4340b6bbe913177b378f',
  },
  female_student: {
    id: 'female_student',
    name: '여자 제자',
    kind: 'Person Avatar',
    avatarId: '302d291002e840baa235a36786358b85',
    defaultVoiceId: '86956bc34b7248d7be34eb3a6f69d03b',
  },
  dog_student: {
    id: 'dog_student',
    name: '강아지 제자',
    kind: 'Animal Avatar',
    // 단일 룩 ID 미사용 — avatarId 자리에 group ID 를 둬서 resolveAvatarGroupLook 이
    // 항상 그룹 안 룩 중 하나를 자동 선택하도록 한다 (동완·후라이쌤 패턴 동일).
    avatarId: '0c7bfe6c196f4e47acaa2a8f0b967b76',
    defaultVoiceId: '18ff90e66773483e80660e2a6fbda399',
    avatarGroupId: '0c7bfe6c196f4e47acaa2a8f0b967b76',
  },
  cat_student: {
    id: 'cat_student',
    name: '고양이 제자',
    kind: 'Animal Avatar',
    avatarId: '0d58128ab91d4b9297237fd213112a07',
    defaultVoiceId: '18ff90e66773483e80660e2a6fbda399',
  },
  interview_student: {
    id: 'interview_student',
    name: '면접 제자',
    kind: 'Person Avatar',
    // mock_interview(면접 클리닉)의 답변 예시 제자. voice 는 여자 제자 voice 를 공유한다.
    avatarId: 'd5ec954460414a7b97625b859a8ce53d',
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
