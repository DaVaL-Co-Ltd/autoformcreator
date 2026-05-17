// HeyGen 쇼츠 영상 생성에서 사용할 추천 아바타 프리셋 5종.
// 아바타·보이스 ID 는 heygenAvatars.js 의 단일 진실 소스에서 가져오고,
// 여기서는 UI 미리듣기용 sample mp3 경로만 덧붙인다.
// samplePreviewUrl 은 미리듣기 ▶ 버튼 클릭 시 재생할 자기소개 mp3
// (scripts/generate_voice_previews.mjs 로 1회 생성).

import { HEYGEN_AVATARS } from './heygenAvatars'

function withPreview(avatar) {
  return { ...avatar, samplePreviewUrl: `/voice-previews/${avatar.id}.mp3` }
}

export const PRESET_SHORTS_AVATARS = [
  withPreview(HEYGEN_AVATARS.dongwan_ssaem),
  withPreview(HEYGEN_AVATARS.fry_ssaem),
  withPreview(HEYGEN_AVATARS.male_student),
  withPreview(HEYGEN_AVATARS.female_student),
  withPreview(HEYGEN_AVATARS.dog_student),
]

export function findPresetShortsAvatar(avatarId) {
  return PRESET_SHORTS_AVATARS.find((preset) => preset.avatarId === avatarId) || null
}
