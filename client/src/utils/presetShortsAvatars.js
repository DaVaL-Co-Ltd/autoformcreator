// HeyGen 쇼츠 영상 생성에서 사용할 추천 아바타 프리셋 6종.
// avatar_id 는 video_agent/generate 호출 시 config.avatar_id 자리에 그대로 사용된다.
// kind 는 표시 라벨용 (Person Avatar / Animal Avatar). 실제 API 호출 시 분기는 필요 없음.
// voice_id 는 같은 인물에 어울리는 기본 목소리. 사용자가 다른 voice 선택 시 덮어쓸 수 있음.
// samplePreviewUrl 은 미리듣기 ▶ 버튼 클릭 시 재생할 자기소개 mp3 (scripts/generate_voice_previews.mjs 로 1회 생성).

import { DOG_STUDENT_AVATAR_ID } from './heygenAvatars'

export const PRESET_SHORTS_AVATARS = [
  {
    id: 'dongwan_ssaem',
    name: '동완쌤',
    kind: 'Person Avatar',
    // avatarId 는 group ID — heygenAvatars.js 와 동일. resolveAvatarGroupLook 이 그룹 안 룩으로 변환.
    avatarId: '618714c6b4054f8fbd2d6a17f0e4a1e8',
    defaultVoiceId: '664ed0c5de6b4532adfb951094ff2707',
    samplePreviewUrl: '/voice-previews/dongwan_ssaem.mp3',
  },
  {
    id: 'fry_ssaem',
    name: '후라이쌤',
    kind: 'Person Avatar',
    // avatarId 는 group ID — heygenAvatars.js 와 동일. resolveAvatarGroupLook 이 그룹 안 룩으로 변환.
    avatarId: '45b17934d52348e691547a1240f3e49d',
    defaultVoiceId: 'ab103893aefd45fca1d1eea500f2ee4b',
    samplePreviewUrl: '/voice-previews/fry_ssaem.mp3',
  },
  {
    id: 'male_student',
    name: '남자 제자',
    kind: 'Person Avatar',
    avatarId: '4685b2dd1eda48d1902b588b122ed613',
    defaultVoiceId: '3097f9a8fd3b4340b6bbe913177b378f',
    samplePreviewUrl: '/voice-previews/male_student.mp3',
  },
  {
    id: 'female_student',
    name: '여자 제자',
    kind: 'Person Avatar',
    avatarId: '302d291002e840baa235a36786358b85',
    defaultVoiceId: '86956bc34b7248d7be34eb3a6f69d03b',
    samplePreviewUrl: '/voice-previews/female_student.mp3',
  },
  {
    id: 'dog_student',
    name: '강아지 제자',
    kind: 'Animal Avatar',
    avatarId: DOG_STUDENT_AVATAR_ID,
    defaultVoiceId: '18ff90e66773483e80660e2a6fbda399',
    samplePreviewUrl: '/voice-previews/dog_student.mp3',
  },
  {
    id: 'cat_student',
    name: '고양이 제자',
    kind: 'Animal Avatar',
    avatarId: '0d58128ab91d4b9297237fd213112a07',
    defaultVoiceId: '18ff90e66773483e80660e2a6fbda399',
    samplePreviewUrl: '/voice-previews/cat_student.mp3',
  },
  {
    id: 'interview_student',
    name: '면접 제자',
    kind: 'Person Avatar',
    // mock_interview 답변 예시 제자 — 여자 제자 voice 와 동일하므로 preview 도 공유한다.
    avatarId: 'd5ec954460414a7b97625b859a8ce53d',
    defaultVoiceId: '86956bc34b7248d7be34eb3a6f69d03b',
    samplePreviewUrl: '/voice-previews/female_student.mp3',
  },
]

export function findPresetShortsAvatar(avatarId) {
  return PRESET_SHORTS_AVATARS.find((preset) => preset.avatarId === avatarId) || null
}
