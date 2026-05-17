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
    avatarId: 'bd28ab87ed834bf5a72a5923536182c6',
    defaultVoiceId: '8da71a32beeb45ffa0182276233333c6',
  },
  fry_ssaem: {
    id: 'fry_ssaem',
    name: '후라이쌤',
    kind: 'Person Avatar',
    avatarId: 'cfdf4447704f4e44b92cd984dd9b28cc',
    defaultVoiceId: '3a6f4521058a436ebf97d42152dae017',
  },
  male_student: {
    id: 'male_student',
    name: '남자 제자',
    kind: 'Person Avatar',
    avatarId: '885c95d7fced49bba5cb230ca5a3e332',
    defaultVoiceId: '3097f9a8fd3b4340b6bbe913177b378f',
  },
  female_student: {
    id: 'female_student',
    name: '여자 제자',
    kind: 'Person Avatar',
    avatarId: 'a5454d8b999d4e5f87f486605465aae4',
    defaultVoiceId: '86956bc34b7248d7be34eb3a6f69d03b',
  },
  dog_student: {
    id: 'dog_student',
    name: '강아지 제자',
    kind: 'Animal Avatar',
    avatarId: 'f51d84b6b19645dbbeedf326379be949',
    defaultVoiceId: 'aceb4659b9e7420483800bbf698e9e24',
  },
}

export const HEYGEN_AVATAR_LIST = Object.values(HEYGEN_AVATARS)

export const HEYGEN_AVATAR_IDS = Object.fromEntries(
  HEYGEN_AVATAR_LIST.map((a) => [a.id, a.avatarId]),
)

export function findHeygenAvatarByAvatarId(avatarId) {
  return HEYGEN_AVATAR_LIST.find((a) => a.avatarId === avatarId) || null
}
