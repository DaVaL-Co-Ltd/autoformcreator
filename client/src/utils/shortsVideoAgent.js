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
      // layout === 'infographic-full' 은 컨셉이 명시적으로 "이 씬은 아바타 없는 풀화면 인포그래픽" 으로
      // 선언한 것. heuristic 보다 우선해 HeyGen Video Agent 에 강하게 지시한다.
      if (scene?.layout === 'infographic-full') {
        const visual = scene?.visualDescription
          ? ` / Visual content for HeyGen to render: ${scene.visualDescription}`
          : ''
        return `- 장면 ${scene.sceneNumber} (${scene.duration}초, INFOGRAPHIC-ONLY, no avatar visible): voice-over narration "${scene.narration}"${overlay}${visual} / Layout direction: REMOVE the avatar from this scene completely. Render a full-frame data infographic / chart / keyword card that fills the entire canvas based on the Visual content above. The avatar must NOT appear in any form, not even small or in a corner. The narration plays as a voice-over only, keeping the same single narrator voice and tone as the avatar scenes.`
      }
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
  // 인포그래픽 씬이 하나라도 있으면 mixed-scene 처리 룰을 상단에 명시한다.
  const hasInfographicScenes = (script?.scenes || []).some((s) => s?.layout === 'infographic-full')

  return [
    'Create a polished vertical 9:16 YouTube Shorts video in Korean.',
    `Target duration: about ${duration} seconds.`,
    hasInfographicScenes ? 'This video MIXES AVATAR scenes and INFOGRAPHIC-ONLY scenes — follow each scene\'s Layout direction EXACTLY. In AVATAR scenes the named avatar appears on screen; in INFOGRAPHIC-ONLY scenes the avatar must be completely hidden and the entire frame is replaced with an AI-generated data card / chart / keyword graphic that HeyGen renders from the Visual content given in that scene.' : '',
    hasInfographicScenes ? 'INFOGRAPHIC-ONLY scenes play the narration as a voice-over only — use the same single narrator voice as the avatar scenes so the audio identity is continuous across the whole video.' : '',
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
    // 인포그래픽 씬이 명시돼 있으면 "아껴 써라 / 데이터 빽빽할 때만" 류의 옛 heuristic 문구는
    // 씬별 명시 지시와 정면 충돌하므로 넣지 않는다. 대신 마커가 최종임을 못 박는다.
    hasInfographicScenes
      ? 'The scene plan below explicitly labels each scene as either an AVATAR scene or an INFOGRAPHIC-ONLY scene — these labels are FINAL and authoritative. Do NOT reclassify any scene: never turn a labelled INFOGRAPHIC-ONLY scene back into an avatar scene, and never add the avatar to it, regardless of how few numbers its narration has.'
      : 'Only switch to a text-only or infographic-only scene when a scene is genuinely crowded with numbers, rankings, percentages, comparisons, or multiple dense factual lines.',
    hasInfographicScenes
      ? 'Every scene labelled INFOGRAPHIC-ONLY must fill the entire frame with the data / chart / keyword graphic and contain zero avatar pixels; every scene labelled as an avatar scene keeps the avatar on screen.'
      : 'For normal scenes, keep the avatar on screen and use only a light, compact overlay.',
    hasInfographicScenes ? '' : 'Use text-only scenes sparingly and only for exceptionally data-dense moments.',
    'When using a text-only or infographic-only scene, keep the center and bottom subtitle area separate so subtitles never collide with the main data card.',
    avatarName
      ? avatarKind === 'talking_photo'
        ? `Use my custom HeyGen talking photo avatar named "${avatarName}"${hasInfographicScenes ? ' in AVATAR scenes only — it must NOT appear in INFOGRAPHIC-ONLY scenes' : ''}.`
        : `Use the HeyGen stock avatar named "${avatarName}"${hasInfographicScenes ? ' in AVATAR scenes only — it must NOT appear in INFOGRAPHIC-ONLY scenes' : ''}.`
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
