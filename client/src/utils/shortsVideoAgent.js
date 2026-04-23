export const SHORTS_SUBTITLE_FONT_OPTIONS = [
  { value: 'default', label: '기본', promptLabel: 'clean modern sans-serif' },
  { value: 'bold', label: '볼드', promptLabel: 'bold display-style Korean font' },
  { value: 'dongle', label: '동글', promptLabel: 'rounded friendly Korean font' },
  { value: 'handwriting', label: '손글씨', promptLabel: 'handwritten Korean font' },
  { value: 'gothic', label: '고딕', promptLabel: 'sharp gothic Korean font' },
]

export const SHORTS_SUBTITLE_STYLE_OPTIONS = [
  {
    value: 'style1',
    label: 'Style1',
    burnStyle: 'classic',
    promptLabel: 'white subtitles inside a soft dark translucent box',
  },
  {
    value: 'style2',
    label: 'Style2',
    burnStyle: 'classic2',
    promptLabel: 'white subtitles with a clean outline and no background box',
  },
]

function getSubtitleFontOption(font) {
  return SHORTS_SUBTITLE_FONT_OPTIONS.find((option) => option.value === font) || SHORTS_SUBTITLE_FONT_OPTIONS[0]
}

function getSubtitleStyleOption(style) {
  return SHORTS_SUBTITLE_STYLE_OPTIONS.find((option) => option.value === style) || SHORTS_SUBTITLE_STYLE_OPTIONS[0]
}

function buildSceneLines(script) {
  return (script?.scenes || [])
    .map((scene) => {
      const overlay = scene?.textOverlay ? ` / 화면 텍스트: ${scene.textOverlay}` : ''
      return `- 장면 ${scene.sceneNumber} (${scene.duration}초): ${scene.narration}${overlay}`
    })
    .join('\n')
}

export function mapShortsSubtitleStyleToBurnStyle(style) {
  return getSubtitleStyleOption(style).burnStyle
}

export function buildShortsVideoAgentPrompt({
  script,
  avatar,
  voice,
  subtitleStyle = 'style1',
  subtitleFont = 'default',
  extraPrompt = '',
  videoStyle = 'avatar',
  narrationTone = 'auto',
}) {
  const fontOption = getSubtitleFontOption(subtitleFont)
  const styleOption = getSubtitleStyleOption(subtitleStyle)
  const duration = script?.duration || '30'
  const sceneLines = buildSceneLines(script)
  const avatarName = avatar?.name || ''
  const avatarKind = avatar?.kind || 'avatar'
  const voiceName = voice?.name || voice?.display_name || ''

  return [
    'Create a polished vertical 9:16 YouTube Shorts video in Korean.',
    `Target duration: about ${duration} seconds.`,
    'Keep the pacing fast, informative, and optimized for short-form retention.',
    'Include burned-in Korean subtitles across the full video by default.',
    `Subtitle font direction: ${fontOption.promptLabel}.`,
    `Subtitle visual treatment: ${styleOption.promptLabel}.`,
    'Place subtitles in the lower portion of the frame inside a safe lower-third area.',
    'Reserve the bottom 25-30% of the frame for subtitles only.',
    'Keep the lower third visually clean and mostly empty except for subtitles.',
    'Keep subtitle timing clean, readable, and synchronized with each spoken phrase.',
    'Do not let subtitles overlap the avatar face, mouth, or important facial details.',
    'Keep all subtitles and scene text overlays away from the avatar face.',
    'Never place labels, headlines, highlights, charts, or callout text inside the bottom subtitle zone.',
    'Place scene-level text overlays in the upper area or side-safe area, never over the face.',
    'Prefer top-safe or upper-middle-safe placement for all scene text overlays.',
    avatarName
      ? avatarKind === 'talking_photo'
        ? `Use my custom HeyGen talking photo avatar named "${avatarName}".`
        : `Use the HeyGen stock avatar named "${avatarName}".`
      : '',
    voiceName ? `Use a Korean voice similar to the HeyGen voice named "${voiceName}".` : '',
    videoStyle && videoStyle !== 'auto' ? `Visual direction: ${videoStyle}.` : '',
    narrationTone && narrationTone !== 'auto' ? `Narration tone: ${narrationTone}.` : '',
    script?.title ? `Video title reference: ${script.title}` : '',
    script?.hook ? `Opening hook: ${script.hook}` : '',
    sceneLines ? 'Use the following scene plan exactly as the speaking structure:\n' + sceneLines : '',
    script?.cta ? `Closing CTA: ${script.cta}` : '',
    'Add concise scene-specific on-screen text and preserve the vertical mobile-safe composition.',
    'Never cover the avatar face with subtitles, titles, labels, charts, or numeric overlays.',
    'Do not use the lower third for decorative overlays, scene labels, or emphasis text.',
    'Avoid adding extra scenes or stretching the script beyond the target runtime.',
    extraPrompt || '',
  ]
    .filter(Boolean)
    .join('\n')
}
