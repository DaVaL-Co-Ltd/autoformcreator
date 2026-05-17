export const SHORTS_SUBTITLE_FONT_OPTIONS = [
  { value: 'default', label: '기본', promptLabel: 'clean modern sans-serif' },
  { value: 'bold', label: '볼드', promptLabel: 'bold display-style Korean font' },
  { value: 'dongle', label: '동글체', promptLabel: 'rounded friendly Korean font' },
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

function countDataSignals(text) {
  const source = String(text || '')
  if (!source.trim()) return 0

  const numericMatches = source.match(/\d+(?:[.,]\d+)?/g) || []
  const metricMatches = source.match(/%|조|억|명|개|건|만|천|억원|달러|시간|분|초|kpi|roi|cagr|yoy|mom|qoq/gi) || []
  const comparisonMatches = source.match(/대비|증가|감소|확대|하락|비교|전년|비해|올해|예상|순위|퍼센트|비율|격차/g) || []

  return numericMatches.length + metricMatches.length + comparisonMatches.length
}

function hasDenseDataFormatting(text) {
  const source = String(text || '')
  if (!source.trim()) return false

  const separators = (source.match(/[/|,:]/g) || []).length
  const lineBreaks = (source.match(/\n/g) || []).length
  const parentheticalBits = (source.match(/\([^)]*\)/g) || []).length

  return separators >= 3 || lineBreaks >= 2 || parentheticalBits >= 2
}

function sceneNeedsTextOnlyOverlay(scene) {
  const combined = [scene?.narration, scene?.textOverlay].filter(Boolean).join(' ')
  const dataSignalCount = countDataSignals(combined)
  const overlayLength = String(scene?.textOverlay || '').trim().length
  const denseFormatting = hasDenseDataFormatting(combined)

  return (
    dataSignalCount >= 6 ||
    (dataSignalCount >= 5 && overlayLength >= 30) ||
    (dataSignalCount >= 4 && overlayLength >= 24 && denseFormatting)
  )
}

function buildSceneLines(script) {
  return (script?.scenes || [])
    .map((scene) => {
      const overlay = scene?.textOverlay ? ` / 화면 텍스트: ${scene.textOverlay}` : ''
      const layoutDirection = sceneNeedsTextOnlyOverlay(scene)
        ? ' / Layout direction: this scene is unusually data-dense, so switch away from the avatar and use a clean full-screen text or infographic scene.'
        : ' / Layout direction: keep the avatar on screen and use only a small, compact text overlay away from the subtitle zone and avatar face.'
      return `- 장면 ${scene.sceneNumber} (${scene.duration}초): ${scene.narration}${overlay}${layoutDirection}`
    })
    .join('\n')
}

export function mapShortsSubtitleStyleToBurnStyle(style) {
  return getSubtitleStyleOption(style).burnStyle
}

export function buildShortsVideoAgentPrompt({
  script,
  avatar,
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
  // 음성 캐릭터·톤은 아바타에 미리 묶인 HeyGen voice 가 결정한다.
  // 프롬프트에서는 voice 의 일관성만 강제하고, 특성 지시는 넣지 않는다.
  const resolvedVoiceInstruction = 'Keep the same single narrator voice across the entire video with consistent identity, tone, and pitch from scene to scene.'

  return [
    'Create a polished vertical 9:16 YouTube Shorts video in Korean.',
    `Target duration: about ${duration} seconds.`,
    'Keep the pacing fast, informative, and optimized for short-form retention.',
    'Reference the composition style of a polished social short with a realistic subject in a cozy study or interview environment and a compact rounded text card placed above the subtitle area.',
    'Include burned-in Korean subtitles across the full video by default.',
    `Subtitle font direction: ${fontOption.promptLabel}.`,
    `Subtitle visual treatment: ${styleOption.promptLabel}.`,
    'Place subtitles in the lower portion of the frame inside a safe lower-third area.',
    'Reserve the bottom 25-30% of the frame for subtitles only.',
    'Keep the lower third visually clean and mostly empty except for subtitles.',
    'Treat the middle facial area of the avatar as a protected no-text zone.',
    'Keep subtitle timing clean, readable, and synchronized with each spoken phrase.',
    'Subtitles are mandatory in the final exported video, not optional.',
    'Do not let subtitles overlap the avatar face, mouth, or important facial details.',
    'Keep all subtitles and scene text overlays away from the avatar face.',
    'Never place labels, headlines, highlights, charts, or callout text inside the bottom subtitle zone.',
    'For regular scenes, place compact text overlays in the upper-safe area or the lower-left safe area above subtitles, never over the face.',
    'Prefer top-safe, upper-middle-safe, or lower-left-safe placement for all scene text overlays.',
    'Only switch to a text-only or infographic-only scene when a scene is genuinely crowded with numbers, rankings, percentages, comparisons, or multiple dense factual lines.',
    'For normal scenes, keep the avatar on screen and use only a light, compact overlay.',
    'Use text-only scenes sparingly and only for exceptionally data-dense moments.',
    'When using a text-only scene, keep the center and bottom subtitle area separate so subtitles never collide with the main data card.',
    avatarName
      ? avatarKind === 'talking_photo'
        ? `Use my custom HeyGen talking photo avatar named "${avatarName}".`
        : `Use the HeyGen stock avatar named "${avatarName}".`
      : '',
    resolvedVoiceInstruction,
    videoStyle && videoStyle !== 'auto' ? `Visual direction: ${videoStyle}.` : '',
    narrationTone && narrationTone !== 'auto' ? `Narration tone: ${narrationTone}.` : '',
    script?.title ? `Video title reference: ${script.title}` : '',
    script?.hook ? `Opening hook: ${script.hook}` : '',
    sceneLines ? `Use the following scene plan exactly as the speaking structure:\n${sceneLines}` : '',
    script?.cta ? `Closing CTA: ${script.cta}` : '',
    'Add concise scene-specific on-screen text and preserve the vertical mobile-safe composition.',
    'Never cover the avatar face with subtitles, titles, labels, charts, or numeric overlays.',
    'Do not use the lower third for decorative overlays, scene labels, or emphasis text.',
    'Avoid adding extra scenes or stretching the script beyond the target runtime.',
    extraPrompt ? `Highest-priority user override: ${extraPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
