// cta(마무리 멘트)를 영상의 진짜 마지막 씬으로 append 하고 cta 필드를 비운 사본을 반환.
// 표준 endpoint 는 scenes 만 렌더하므로 cta 가 영상에 들어가지 않는 문제, Video Agent 는
// "Closing CTA: ..." 프롬프트만 보고 임의 위치(때로는 마지막 씬 직전)에 끼워넣는 문제를
// 동시에 해결한다 — 항상 마지막 위치에 우리가 직접 씬으로 박아 순서를 고정.
// cta 가 이미 마지막 씬 caption 과 사실상 같으면 새 씬을 추가하지 않고 cta 만 비운다.
// 원본 script 는 그대로 두고 새 객체를 반환(편집/저장 데이터는 cta 필드 유지).
export function appendCtaAsLastScene(script, options = {}) {
  const ctaText = String(script?.cta || '').trim()
  if (!ctaText) return script
  // 일부 컨셉(예: 동완쌤 1퍼센트 입시 데이터 브리핑)은 마무리에 아바타가 다시 등장해
  // "구독하세요" 를 말하는 별도 CTA 씬을 원치 않는다. 이 경우 씬을 추가하지 않고
  // cta 필드만 비워 영상(표준 endpoint·Video Agent 프롬프트) 어디에도 들어가지 않게 한다.
  if (options.dropCtaScene) return { ...script, cta: '' }
  const scenes = Array.isArray(script?.scenes) ? script.scenes : []

  const sceneSpokenText = (s) => String(s?.caption || s?.narration || '').trim()
  // 발화 텍스트가 있는 마지막 씬(무음/카운트다운 제외) — cta 와의 중복 판단 기준.
  let lastSpokenIdx = -1
  for (let i = scenes.length - 1; i >= 0; i -= 1) {
    const s = scenes[i]
    if (s && s.layout !== 'quiz-countdown' && sceneSpokenText(s)) { lastSpokenIdx = i; break }
  }
  const lastCaption = lastSpokenIdx >= 0 ? sceneSpokenText(scenes[lastSpokenIdx]) : ''

  // cta 와 마지막 씬 대사가 사실상 같으면(가끔 Gemini 가 동일 문구 생성) 같은 말이 두 번 나오므로
  // 별도 마무리 씬을 추가하지 않고 cta 만 비운다(기존 마지막 씬이 곧 마무리 역할).
  const norm = (t) => String(t || '').replace(/[\s.,!?。！？·…"']/g, '').toLowerCase()
  const nCta = norm(ctaText)
  const nLast = norm(lastCaption)
  const isDuplicate = !!nCta && !!nLast && (nCta === nLast || nLast.includes(nCta) || nCta.includes(nLast))
  if (isDuplicate) {
    return { ...script, cta: '' }
  }

  // cta 를 마지막 씬으로 append. 풀화면 아바타가 말하는 짧은 마무리 컷.
  // 직전 발화 씬의 avatarId·visualDescription 을 그대로 물려받아 같은 무대·인물 유지.
  const baseScene = lastSpokenIdx >= 0 ? scenes[lastSpokenIdx] : null
  const lastNumber = scenes.reduce((max, s, i) => Math.max(max, Number(s?.sceneNumber) || (i + 1)), 0)
  const ctaScene = {
    sceneNumber: lastNumber + 1,
    duration: '3',
    layout: 'full',
    caption: ctaText,
    narration: ctaText,
    textOverlay: '',
    visualDescription: baseScene?.visualDescription || '',
    ...(baseScene?.avatarId ? { avatarId: baseScene.avatarId } : {}),
    noTextOverlay: true,
  }
  return { ...script, scenes: [...scenes, ctaScene], cta: '' }
}

// 오프닝 훅을 첫 'speaking' 씬의 caption 에 흡수시키고 hook 필드를 비운 사본을 반환.
// HeyGen 표준 endpoint, Video Agent, SRT 자막 모두 동일한 변환된 script 를 사용하므로
// hook 이 별도 첫 대사로 한 번, 첫 씬 본문으로 또 한 번 — 식의 중복 진행을 막는다.
// caption 은 자막이자 TTS 입력으로 함께 쓰이는 단일 필드.
// 옛 스크립트는 narration 만 있을 수 있어 fallback 으로 함께 본다.
// 원본 script 는 그대로 두고 새 객체를 반환(편집/저장 데이터는 hook 필드 유지).
export function absorbHookIntoFirstScene(script) {
  const hookText = String(script?.hook || '').trim()
  if (!hookText) return script
  const scenes = Array.isArray(script?.scenes) ? script.scenes : []
  if (scenes.length === 0) return script

  const sceneSpokenText = (s) => String(s?.caption || s?.narration || '').trim()
  // 발화 텍스트가 있는 첫 씬(무음/카운트다운 제외) — 훅과의 중복 판단 기준.
  const firstSpokenIdx = scenes.findIndex((s) => s && s.layout !== 'quiz-countdown' && sceneSpokenText(s))
  const firstCaption = firstSpokenIdx >= 0 ? sceneSpokenText(scenes[firstSpokenIdx]) : ''

  // 훅이 첫 씬 대사와 사실상 같으면(가끔 Gemini 가 비슷하게 생성) 같은 말이 두 번 나오므로,
  // 훅 씬을 따로 추가하지 않고 hook 만 비운다(기존 첫 씬이 곧 훅 역할).
  const norm = (t) => String(t || '').replace(/[\s.,!?。！？·…"']/g, '').toLowerCase()
  const nHook = norm(hookText)
  const nFirst = norm(firstCaption)
  const isDuplicate = !!nHook && !!nFirst && (nHook === nFirst || nFirst.includes(nHook) || nHook.includes(nFirst))
  if (isDuplicate) {
    return { ...script, hook: '' }
  }

  // 훅을 "씬 1"로 만들고 기존 씬 번호를 +1 (씬1,2,3 → 2,3,4). 훅은 아바타가 말하는 풀화면 씬.
  const hookScene = {
    sceneNumber: 1,
    duration: '3',
    layout: 'full',
    caption: hookText,
    narration: hookText,
    textOverlay: '',
    visualDescription: (firstSpokenIdx >= 0 ? scenes[firstSpokenIdx]?.visualDescription : '') || '',
  }
  const shifted = scenes.map((s, i) => ({ ...s, sceneNumber: (Number(s?.sceneNumber) || (i + 1)) + 1 }))
  return { ...script, scenes: [hookScene, ...shifted], hook: '' }
}

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
  // caption 이 새 표준. 옛 데이터 호환을 위해 narration 도 함께 본다.
  const spoken = scene?.caption || scene?.narration
  const combined = [spoken, scene?.textOverlay].filter(Boolean).join(' ')
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
      // caption 이 새 표준. 옛 데이터(narration 만 있음)도 지원하기 위해 fallback.
      const spokenText = scene?.caption || scene?.narration || ''
      // noTextOverlay: true 인 씬은 화면 텍스트 카드를 일절 넣지 않으므로 textOverlay 도 프롬프트에서 제외한다.
      const overlay = scene?.textOverlay && !scene?.noTextOverlay ? ` / 화면 텍스트: ${scene.textOverlay}` : ''
      // layout === 'infographic-full' 은 컨셉이 명시적으로 "이 씬은 아바타 없는 풀화면 인포그래픽" 으로
      // 선언한 것. heuristic 보다 우선해 HeyGen Video Agent 에 강하게 지시한다.
      if (scene?.layout === 'infographic-full') {
        const visual = scene?.visualDescription
          ? ` / Visual content for HeyGen to render: ${String(scene.visualDescription).slice(0, 600)}`
          : ''
        return `- 장면 ${scene.sceneNumber} (${scene.duration}초, INFOGRAPHIC-ONLY, no avatar visible): voice-over narration "${spokenText}"${overlay}${visual} / Layout direction: REMOVE the avatar from this scene completely. Render a full-frame data infographic / chart / keyword card that fills the entire canvas based on the Visual content above. The chart, graph, or table MUST be ANIMATED motion graphics — bars grow in, line graphs draw on progressively, pie/donut segments sweep in, key numbers count up — never a flat static image. The avatar must NOT appear in any form, not even small or in a corner. The narration plays as a voice-over only, keeping the same single narrator voice and tone as the avatar scenes.`
      }
      // noTextOverlay: true 면 화면 텍스트 카드/키워드 오버레이를 금지하고 아바타만 풀프레임으로
      // (briefing_dongwan 인트로·아웃트로처럼 깔끔한 등장/마무리 컷). 모션 등 다른 연출은 그대로 둔다.
      const layoutDirection = scene?.noTextOverlay
        ? ' / Layout direction: keep the avatar speaking full-frame; do NOT add any on-screen text card, keyword card, title, caption card, or text overlay anywhere in this scene — the frame shows only the avatar.'
        : sceneNeedsTextOnlyOverlay(scene)
          ? ' / Layout direction: this scene is unusually data-dense, so switch away from the avatar and use a clean full-screen text or infographic scene.'
          : ' / Layout direction: keep the avatar on screen and use only a small, compact text overlay away from the subtitle zone and avatar face.'
      return `- 장면 ${scene.sceneNumber} (${scene.duration}초): ${spokenText}${overlay}${layoutDirection}`
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
  const duration = script?.duration || '60'
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

  // HeyGen Video Agent 의 prompt 는 최대 10000 자. 고정 지시문 + 씬 플랜 + 컨셉 direction(extra)
  // 합이 이를 넘으면 요청이 거부되므로, 필수 지시는 항상 넣고 부가 지시는 남는 예산만큼만 넣는다.
  const MAX_PROMPT_CHARS = 10000
  const cappedExtra = String(extraPrompt || '').slice(0, 2000)

  // 필수 — 영상 정확성·핵심 제약·씬 플랜·사용자 오버라이드. 항상 포함한다.
  const essentialLines = [
    'Create a polished vertical 9:16 YouTube Shorts video in Korean.',
    `Target duration: about ${duration} seconds.`,
    hasInfographicScenes ? 'This video MIXES AVATAR scenes and INFOGRAPHIC-ONLY scenes — follow each scene\'s Layout direction EXACTLY. In AVATAR scenes the named avatar appears on screen; in INFOGRAPHIC-ONLY scenes the avatar must be completely hidden and the entire frame is replaced with an AI-generated data card / chart / keyword graphic that HeyGen renders from the Visual content given in that scene.' : '',
    hasInfographicScenes ? 'INFOGRAPHIC-ONLY scenes play the narration as a voice-over only — use the same single narrator voice as the avatar scenes so the audio identity is continuous across the whole video.' : '',
    hasMultipleInfographicScenes ? 'CRITICAL — UNIFIED INFOGRAPHIC DESIGN: Every INFOGRAPHIC-ONLY scene in this single video MUST share ONE identical design system — the same background color, the same color palette, the same layout grid and margins, the same typography, and the same chart/graphic styling. They must look like a consistent series of cards generated from one fixed template. NEVER change the background color between infographic scenes (for example, do not show a navy background in one infographic scene and a white background in another) — choose one background treatment and keep it pixel-consistent across all of them.' : '',
    'CRITICAL — NO SUBTITLES: Do NOT generate, render, or burn in any subtitles, captions, or closed captions. Export the video with zero subtitle/caption text. Korean subtitles are added afterward in a separate post-production step.',
    'CRITICAL — RESERVED BOTTOM BAND: The bottom 30% of the vertical 9:16 frame is a strictly reserved empty zone. Keep it completely clear at all times — no captions, no text, no labels, no headlines, no charts, no callouts, no logos, no decorative graphics. This lower band must stay visually empty so post-production subtitles can sit there cleanly.',
    'CRITICAL — PROTECTED FACE ZONE: The avatar face and the central head area are a protected no-overlay zone. Never place text, labels, headlines, numbers, charts, stickers, or any graphic over the avatar face, mouth, or eyes.',
    hasInfographicScenes
      ? 'The scene plan below explicitly labels each scene as either an AVATAR scene or an INFOGRAPHIC-ONLY scene — these labels are FINAL and authoritative. Do NOT reclassify any scene: never turn a labelled INFOGRAPHIC-ONLY scene back into an avatar scene, and never add the avatar to it, regardless of how few numbers its narration has.'
      : 'Only switch to a text-only or infographic-only scene when a scene is genuinely crowded with numbers, rankings, percentages, comparisons, or multiple dense factual lines.',
    hasInfographicScenes
      ? 'Every scene labelled INFOGRAPHIC-ONLY must fill the entire frame with the data / chart / keyword graphic and contain zero avatar pixels; every scene labelled as an avatar scene keeps the avatar on screen.'
      : 'For normal scenes, keep the avatar on screen and use only a light, compact overlay.',
    avatarName
      ? avatarKind === 'talking_photo'
        ? `Use my custom HeyGen talking photo avatar named "${avatarName}"${hasInfographicScenes ? ' in AVATAR scenes only — it must NOT appear in INFOGRAPHIC-ONLY scenes' : ''}.`
        : `Use the HeyGen stock avatar named "${avatarName}"${hasInfographicScenes ? ' in AVATAR scenes only — it must NOT appear in INFOGRAPHIC-ONLY scenes' : ''}.`
      : '',
    resolvedVoiceInstruction,
    // hook 은 영상 생성 직전에 첫 씬 narration 에 흡수되므로 별도 인트로로 노출하지 않는다.
    sceneLines ? `Use the following scene plan exactly as the speaking structure:\n${sceneLines}` : '',
    script?.cta ? `Closing CTA: ${script.cta}` : '',
    cappedExtra ? `Highest-priority user override: ${cappedExtra}` : '',
  ].filter(Boolean)

  // 부가 — 품질 향상용. 10000 자 예산이 허락하는 만큼만 포함한다(초과 시 생략돼도 동작엔 지장 없음).
  const optionalLines = [
    'Keep the pacing fast, informative, and optimized for short-form retention.',
    'Reference the composition style of a polished social short with a realistic subject in a cozy study or interview environment, with any compact rounded text card placed in the upper area of the frame.',
    'Place every auto-generated scene keyword card or text overlay only in the top-safe area (upper ~25% of the frame) — never in the bottom 30% band and never over the avatar face.',
    'Keep all on-screen text and graphic elements out of both the bottom 30% reserved band and the central avatar-face zone.',
    hasInfographicScenes ? '' : 'Use text-only scenes sparingly and only for exceptionally data-dense moments.',
    'When using a text-only or infographic-only scene, still keep the bottom 30% band completely empty — the data card must not extend into that reserved band.',
    'Whenever a scene presents data, statistics, numbers, charts, graphs, or tables, render them as ANIMATED motion graphics — bars growing in, line graphs drawing on progressively, pie or donut segments sweeping in, key numbers counting up — never a flat static image.',
    'For scenes that are NOT data-heavy, keep the avatar on screen and speaking instead of switching to an infographic.',
    videoStyle && videoStyle !== 'auto' ? `Visual direction: ${videoStyle}.` : '',
    narrationTone && narrationTone !== 'auto' ? `Narration tone: ${narrationTone}.` : '',
    script?.title ? `Video title reference: ${script.title}` : '',
    'Add concise scene-specific on-screen text in the top-safe area only, and preserve the vertical mobile-safe composition.',
    'Never cover the avatar face with titles, labels, charts, or numeric overlays.',
    'Never use the bottom 30% band for captions, decorative overlays, scene labels, or emphasis text — it stays empty.',
    'Avoid adding extra scenes or stretching the script beyond the target runtime.',
  ].filter(Boolean)

  let prompt = essentialLines.join('\n')
  for (const line of optionalLines) {
    if (prompt.length + 1 + line.length > MAX_PROMPT_CHARS - 50) continue
    prompt += `\n${line}`
  }
  // 최후 안전망: 필수 지시만으로도 한도를 넘는 극단 케이스에서 잘라 API 거부를 막는다.
  if (prompt.length > MAX_PROMPT_CHARS) prompt = prompt.slice(0, MAX_PROMPT_CHARS)
  return prompt
}
