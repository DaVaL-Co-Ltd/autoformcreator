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
      // noTextOverlay: true 인 씬은 화면 텍스트 카드를 일절 넣지 않으므로 textOverlay 도 프롬프트에서 제외한다.
      const overlay = scene?.textOverlay && !scene?.noTextOverlay ? ` / 화면 텍스트: ${scene.textOverlay}` : ''
      // layout === 'infographic-full' 은 컨셉이 명시적으로 "이 씬은 아바타 없는 풀화면 인포그래픽" 으로
      // 선언한 것. heuristic 보다 우선해 HeyGen Video Agent 에 강하게 지시한다.
      if (scene?.layout === 'infographic-full') {
        const visual = scene?.visualDescription
          ? ` / Visual content for HeyGen to render: ${scene.visualDescription}`
          : ''
        return `- 장면 ${scene.sceneNumber} (${scene.duration}초, INFOGRAPHIC-ONLY, no avatar visible): voice-over narration "${scene.narration}"${overlay}${visual} / Layout direction: REMOVE the avatar from this scene completely. Render a full-frame data infographic / chart / keyword card that fills the entire canvas based on the Visual content above. The chart, graph, or table MUST be ANIMATED motion graphics — bars grow in, line graphs draw on progressively, pie/donut segments sweep in, key numbers count up — never a flat static image. The avatar must NOT appear in any form, not even small or in a corner. The narration plays as a voice-over only, keeping the same single narrator voice and tone as the avatar scenes.`
      }
      // noTextOverlay: true 면 화면 텍스트 카드/키워드 오버레이를 금지하고 아바타만 풀프레임으로
      // (briefing_dongwan 인트로·아웃트로처럼 깔끔한 등장/마무리 컷). 모션 등 다른 연출은 그대로 둔다.
      const layoutDirection = scene?.noTextOverlay
        ? ' / Layout direction: keep the avatar speaking full-frame; do NOT add any on-screen text card, keyword card, title, caption card, or text overlay anywhere in this scene — the frame shows only the avatar.'
        : sceneNeedsTextOnlyOverlay(scene)
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
  extraPrompt = '',
  videoStyle = 'avatar',
  narrationTone = 'auto',
}) {
  const duration = script?.duration || '30'
  const sceneLines = buildSceneLines(script)
  const avatarName = avatar?.name || ''
  const avatarKind = avatar?.kind || 'avatar'
  // 음성 캐릭터·톤은 아바타에 미리 묶인 HeyGen voice 가 결정한다.
  // 프롬프트에서는 voice 의 일관성만 강제하고, 특성 지시는 넣지 않는다.
  const resolvedVoiceInstruction = 'Keep the same single narrator voice across the entire video with consistent identity, tone, and pitch from scene to scene.'
  // 인포그래픽 씬이 하나라도 있으면 mixed-scene 처리 룰을 상단에 명시한다.
  const hasInfographicScenes = (script?.scenes || []).some((s) => s?.layout === 'infographic-full')
  // 인포그래픽 씬이 2개 이상이면 HeyGen AI 가 씬마다 따로 그려 디자인이 흔들린다
  // (배경색이 씬마다 바뀌는 등). 모든 인포그래픽 씬이 하나의 디자인 시스템을 공유하도록 강제한다.
  const hasMultipleInfographicScenes = (script?.scenes || []).filter((s) => s?.layout === 'infographic-full').length >= 2

  return [
    'Create a polished vertical 9:16 YouTube Shorts video in Korean.',
    `Target duration: about ${duration} seconds.`,
    hasInfographicScenes ? 'This video MIXES AVATAR scenes and INFOGRAPHIC-ONLY scenes — follow each scene\'s Layout direction EXACTLY. In AVATAR scenes the named avatar appears on screen; in INFOGRAPHIC-ONLY scenes the avatar must be completely hidden and the entire frame is replaced with an AI-generated data card / chart / keyword graphic that HeyGen renders from the Visual content given in that scene.' : '',
    hasInfographicScenes ? 'INFOGRAPHIC-ONLY scenes play the narration as a voice-over only — use the same single narrator voice as the avatar scenes so the audio identity is continuous across the whole video.' : '',
    hasMultipleInfographicScenes ? 'CRITICAL — UNIFIED INFOGRAPHIC DESIGN: Every INFOGRAPHIC-ONLY scene in this single video MUST share ONE identical design system — the same background color, the same color palette, the same layout grid and margins, the same typography, and the same chart/graphic styling. They must look like a consistent series of cards generated from one fixed template. NEVER change the background color between infographic scenes (for example, do not show a navy background in one infographic scene and a white background in another) — choose one background treatment and keep it pixel-consistent across all of them.' : '',
    'Keep the pacing fast, informative, and optimized for short-form retention.',
    'Reference the composition style of a polished social short with a realistic subject in a cozy study or interview environment, with any compact rounded text card placed in the upper area of the frame.',
    'CRITICAL — NO SUBTITLES: Do NOT generate, render, or burn in any subtitles, captions, or closed captions. Export the video with zero subtitle/caption text. Korean subtitles are added afterward in a separate post-production step.',
    'CRITICAL — RESERVED BOTTOM BAND: The bottom 30% of the vertical 9:16 frame is a strictly reserved empty zone. Keep it completely clear at all times — no captions, no text, no labels, no headlines, no charts, no callouts, no logos, no decorative graphics. This lower band must stay visually empty so post-production subtitles can sit there cleanly.',
    'CRITICAL — PROTECTED FACE ZONE: The avatar face and the central head area are a protected no-overlay zone. Never place text, labels, headlines, numbers, charts, stickers, or any graphic over the avatar face, mouth, or eyes.',
    'Place every auto-generated scene keyword card or text overlay only in the top-safe area (upper ~25% of the frame) — never in the bottom 30% band and never over the avatar face.',
    'Keep all on-screen text and graphic elements out of both the bottom 30% reserved band and the central avatar-face zone.',
    // 인포그래픽 씬이 명시돼 있으면 "아껴 써라 / 데이터 빽빽할 때만" 류의 옛 heuristic 문구는
    // 씬별 명시 지시와 정면 충돌하므로 넣지 않는다. 대신 마커가 최종임을 못 박는다.
    hasInfographicScenes
      ? 'The scene plan below explicitly labels each scene as either an AVATAR scene or an INFOGRAPHIC-ONLY scene — these labels are FINAL and authoritative. Do NOT reclassify any scene: never turn a labelled INFOGRAPHIC-ONLY scene back into an avatar scene, and never add the avatar to it, regardless of how few numbers its narration has.'
      : 'Only switch to a text-only or infographic-only scene when a scene is genuinely crowded with numbers, rankings, percentages, comparisons, or multiple dense factual lines.',
    hasInfographicScenes
      ? 'Every scene labelled INFOGRAPHIC-ONLY must fill the entire frame with the data / chart / keyword graphic and contain zero avatar pixels; every scene labelled as an avatar scene keeps the avatar on screen.'
      : 'For normal scenes, keep the avatar on screen and use only a light, compact overlay.',
    hasInfographicScenes ? '' : 'Use text-only scenes sparingly and only for exceptionally data-dense moments.',
    'When using a text-only or infographic-only scene, still keep the bottom 30% band completely empty — the data card must not extend into that reserved band.',
    'Whenever a scene presents data, statistics, numbers, charts, graphs, or tables, render them as ANIMATED motion graphics — bars growing in, line graphs drawing on progressively, pie or donut segments sweeping in, key numbers counting up — never a flat static image.',
    'For scenes that are NOT data-heavy, keep the avatar on screen and speaking instead of switching to an infographic.',
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
    'Add concise scene-specific on-screen text in the top-safe area only, and preserve the vertical mobile-safe composition.',
    'Never cover the avatar face with titles, labels, charts, or numeric overlays.',
    'Never use the bottom 30% band for captions, decorative overlays, scene labels, or emphasis text — it stays empty.',
    'Avoid adding extra scenes or stretching the script beyond the target runtime.',
    extraPrompt ? `Highest-priority user override: ${extraPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
