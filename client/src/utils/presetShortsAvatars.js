// HeyGen 쇼츠 영상 생성에서 사용할 추천 아바타 프리셋 6종.
// avatar_id 는 video_agent/generate 호출 시 config.avatar_id 자리에 그대로 사용된다.
// kind 는 표시 라벨용 (Person Avatar / Animal Avatar). 실제 API 호출 시 분기는 필요 없음.
// voice_id 는 같은 인물에 어울리는 기본 목소리. 사용자가 다른 voice 선택 시 덮어쓸 수 있음.
// samplePreviewUrl 은 미리듣기 ▶ 버튼 클릭 시 재생할 자기소개 mp3 (scripts/generate_voice_previews.mjs 로 1회 생성).

export const PRESET_SHORTS_AVATARS = [
  {
    id: 'dongwan_ssaem',
    name: '동완쌤',
    kind: 'Person Avatar',
    avatarId: 'bd28ab87ed834bf5a72a5923536182c6',
    defaultVoiceId: '8da71a32beeb45ffa0182276233333c6',
    samplePreviewUrl: '/voice-previews/dongwan_ssaem.mp3',
  },
  {
    id: 'fry_ssaem',
    name: '후라이쌤',
    kind: 'Person Avatar',
    // 후라이쌤 avatar group 안의 실제 룩 — heygenAvatars.js 와 동일하게 유지.
    avatarId: 'adebcddfb2e94c869e484e946bb275ae',
    defaultVoiceId: '3a6f4521058a436ebf97d42152dae017',
    samplePreviewUrl: '/voice-previews/fry_ssaem.mp3',
  },
  {
    id: 'male_student',
    name: '남자 제자',
    kind: 'Person Avatar',
    avatarId: '885c95d7fced49bba5cb230ca5a3e332',
    defaultVoiceId: '3097f9a8fd3b4340b6bbe913177b378f',
    samplePreviewUrl: '/voice-previews/male_student.mp3',
  },
  {
    id: 'female_student',
    name: '여자 제자',
    kind: 'Person Avatar',
    // 9:16 세로 Alexa 룩 — heygenAvatars.js 의 female_student 와 동일하게 유지.
    avatarId: '62b02a920a78424e94f63f2ddb85dc99',
    defaultVoiceId: '86956bc34b7248d7be34eb3a6f69d03b',
    samplePreviewUrl: '/voice-previews/female_student.mp3',
  },
  {
    id: 'dog_student',
    name: '강아지 제자',
    kind: 'Animal Avatar',
    avatarId: 'f51d84b6b19645dbbeedf326379be949',
    defaultVoiceId: 'aceb4659b9e7420483800bbf698e9e24',
    samplePreviewUrl: '/voice-previews/dog_student.mp3',
  },
]

export function findPresetShortsAvatar(avatarId) {
  return PRESET_SHORTS_AVATARS.find((preset) => preset.avatarId === avatarId) || null
}
