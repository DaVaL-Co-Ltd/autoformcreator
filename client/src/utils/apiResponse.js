export async function readApiResponse(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { rawText: text }
  }
}

export function getApiErrorMessage(data, fallbackMessage) {
  if (typeof data?.error === 'string' && data.error.trim()) {
    return data.error.trim()
  }

  if (data?.error && typeof data.error === 'object') {
    if (typeof data.error.message === 'string' && data.error.message.trim()) {
      return data.error.message.trim()
    }

    if (typeof data.error.detail === 'string' && data.error.detail.trim()) {
      return data.error.detail.trim()
    }
  }

  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message.trim()
  }

  if (typeof data?.rawText === 'string' && data.rawText.trim()) {
    return data.rawText.trim()
  }

  return fallbackMessage
}

const HEYGEN_ERROR_MESSAGES = {
  unauthorized: 'HeyGen API 키가 유효하지 않거나 만료되었습니다. 서버의 HeyGen API 키 설정을 확인해주세요.',
  authentication_failed: 'HeyGen API 키 인증에 실패했습니다. 서버의 HeyGen API 키 설정을 확인해주세요.',
  forbidden: '현재 HeyGen API 키에는 이 작업을 실행할 권한이 없습니다.',
  resource_access_denied: '선택한 HeyGen 리소스에 접근할 수 없습니다. 아바타/목소리가 같은 계정에 있는지 확인해주세요.',
  ai_vendor_access_restricted: 'HeyGen 워크스페이스 정책상 이 AI 기능 사용이 제한되어 있습니다. 관리자 설정을 확인해주세요.',
  voice_not_usable: '선택한 HeyGen 목소리를 현재 영상 생성에 사용할 수 없습니다. 다른 목소리를 선택해주세요.',
  rate_limit_exceeded: 'HeyGen 요청이 너무 많아 잠시 제한되었습니다. 잠시 후 다시 시도해주세요.',
  quota_exceeded: 'HeyGen 사용 한도를 초과했습니다. 플랜 한도 또는 초기화 시점을 확인해주세요.',
  insufficient_credit: 'HeyGen 크레딧이 부족해 영상을 생성할 수 없습니다. 크레딧을 충전하거나 영상 길이/씬 수를 줄여주세요.',
  trial_limit_exceeded: 'HeyGen 체험 계정의 영상 생성 한도를 초과했습니다. 유료 플랜 전환이 필요합니다.',
  plan_upgrade_required: '현재 HeyGen 플랜에서 사용할 수 없는 기능 또는 리소스입니다. 플랜 업그레이드가 필요합니다.',
  video_not_found: 'HeyGen 영상 ID를 찾을 수 없습니다. 영상이 삭제되었거나 다른 계정에서 생성되었을 수 있습니다.',
  avatar_not_found: '선택한 HeyGen 아바타를 찾을 수 없습니다. 아바타가 준비 완료 상태이고 같은 계정에 있는지 확인해주세요.',
  voice_not_found: '선택한 HeyGen 목소리를 찾을 수 없습니다. 다른 목소리를 선택해주세요.',
  template_not_found: 'HeyGen 템플릿을 찾을 수 없습니다.',
  asset_not_found: 'HeyGen에 업로드된 파일을 찾을 수 없습니다. 업로드가 완료된 뒤 다시 시도해주세요.',
  webhook_not_found: 'HeyGen 웹훅 엔드포인트를 찾을 수 없습니다.',
  resource_not_found: 'HeyGen 리소스를 찾을 수 없습니다. 요청에 사용된 ID를 확인해주세요.',
  invalid_parameter: 'HeyGen 요청 값이 올바르지 않습니다. 선택한 아바타, 목소리, 대본 또는 영상 설정을 확인해주세요.',
  conflict: 'HeyGen 요청이 현재 리소스 상태와 충돌했습니다. 잠시 후 다시 시도하거나 다른 설정을 사용해주세요.',
  resource_not_ready: 'HeyGen 리소스가 아직 준비되지 않았습니다. 처리 완료 후 다시 시도해주세요.',
  request_in_progress: '동일한 HeyGen 요청이 아직 처리 중입니다. 잠시 후 다시 확인해주세요.',
  content_policy_violation: 'HeyGen 콘텐츠 정책에 의해 요청이 거부되었습니다. 대본, 이미지, 프롬프트 내용을 수정해주세요.',
  unlimited_mode_disabled: '선택한 HeyGen 아바타는 unlimited mode를 지원하지 않습니다. 다른 아바타를 선택해주세요.',
  avatar_consent_required: '선택한 HeyGen 아바타는 사용 동의 절차가 필요합니다. HeyGen에서 동의를 완료한 뒤 다시 시도해주세요.',
  resource_limit_reached: 'HeyGen 계정의 리소스 생성 한도에 도달했습니다. 사용하지 않는 리소스를 정리하거나 한도 상향이 필요합니다.',
  voice_unavailable: '선택한 HeyGen 목소리가 사용할 수 없는 상태입니다. 다른 목소리를 선택해주세요.',
  script_too_short: 'HeyGen 대본이 너무 짧아 영상을 생성할 수 없습니다. 한 문장 이상으로 대본을 늘려주세요.',
  tts_text_invalid: 'HeyGen이 읽을 수 없는 대본입니다. 빈 문장, 기호만 있는 문장, 발화하기 어려운 텍스트를 수정해주세요.',
  download_failed: 'HeyGen이 요청에 포함된 파일 URL을 내려받지 못했습니다. URL이 공개 접근 가능한지 확인해주세요.',
  video_delete_failed: 'HeyGen 영상 삭제 중 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  ephemeral_upload_disabled: '현재 HeyGen 계정에서 임시 업로드 방식이 비활성화되어 있습니다. 잠시 후 다시 시도해주세요.',
  internal_error: 'HeyGen 서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  gateway_timeout: 'HeyGen이 요청한 파일을 제한 시간 안에 내려받지 못했습니다. 파일 URL 접근성과 응답 속도를 확인해주세요.',
  hyperframes_project_invalid: 'HeyGen HyperFrames 프로젝트 형식이 올바르지 않습니다.',
  hyperframes_project_too_large: 'HeyGen HyperFrames 프로젝트 파일 크기가 너무 큽니다.',
  hyperframes_render_not_found: 'HeyGen HyperFrames 렌더 ID를 찾을 수 없습니다.',
}

export function getHeygenErrorMessage(data, fallbackMessage = 'HeyGen 요청에 실패했습니다.') {
  const error = data?.error && typeof data.error === 'object' ? data.error : null
  const code = typeof error?.code === 'string' ? error.code.trim() : ''
  const officialMessage = typeof error?.message === 'string' ? error.message.trim() : ''
  const param = typeof error?.param === 'string' && error.param.trim() ? ` (${error.param.trim()})` : ''
  const friendlyMessage = HEYGEN_ERROR_MESSAGES[code]

  if (friendlyMessage) {
    return officialMessage
      ? `${friendlyMessage}\n\nHeyGen 원문: ${officialMessage}${param}`
      : friendlyMessage
  }

  const message = getApiErrorMessage(data, fallbackMessage)
  return code ? `${message}\n\nHeyGen 오류 코드: ${code}${param}` : message
}

const SERVER_ERROR_PATTERNS = [
  {
    test: /unauthorized/i,
    message: '로그인 또는 서버 인증이 만료되었습니다. 다시 로그인한 뒤 시도해주세요.',
  },
  {
    test: /method not allowed/i,
    message: '서버 요청 방식이 올바르지 않습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.',
  },
  {
    test: /supabase (is )?not configured|supabase.*환경변수|supabase.*configured/i,
    message: '서버의 데이터베이스 설정이 완료되지 않았습니다. 관리자에게 Supabase 환경변수 설정을 요청해주세요.',
  },
  {
    test: /storage upload|스토리지 업로드|storage.*failed/i,
    message: '생성된 파일을 저장소에 업로드하지 못했습니다. 잠시 후 다시 시도해주세요.',
  },
  {
    test: /api key|not configured on server|environment variables are missing|환경변수.*미설정|client_secret\.json not found/i,
    message: '서버 연동 설정이 누락되어 작업을 진행할 수 없습니다. 관리자에게 API 키 또는 인증 설정을 확인해달라고 요청해주세요.',
  },
  {
    test: /missing videoUrl or scenes|videoUrls .*필요|missing scenes|missing compositionId|file not found/i,
    message: '서버 요청에 필요한 영상 또는 장면 정보가 누락되었습니다. 숏폼 대본과 영상 생성 상태를 확인한 뒤 다시 시도해주세요.',
  },
  {
    test: /job not found|작업을 찾을 수 없습니다/i,
    message: '서버 작업 정보를 찾을 수 없습니다. 서버가 재시작되었을 수 있으니 작업을 다시 시작해주세요.',
  },
  {
    test: /다운로드 실패|download failed|영상 다운로드 실패|세그먼트 .* 다운로드 실패/i,
    message: '서버가 영상 파일을 내려받지 못했습니다. 영상 URL이 공개 접근 가능한지 확인한 뒤 다시 시도해주세요.',
  },
  {
    test: /합치기|concat/i,
    message: '영상 세그먼트를 합치는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  },
  {
    test: /자막 번인|subtitle|burn/i,
    message: '자막을 영상에 합성하는 중 오류가 발생했습니다. 원본 영상은 유지되며, 잠시 후 다시 시도할 수 있습니다.',
  },
  {
    test: /timeout|time.?out|시간 초과/i,
    message: '서버 작업 시간이 초과되었습니다. 영상 길이나 서버 부하를 확인한 뒤 다시 시도해주세요.',
  },
  {
    test: /failed to fetch|networkerror|load failed/i,
    message: '서버에 연결하지 못했습니다. 네트워크 상태 또는 서버 실행 상태를 확인해주세요.',
  },
]

function withOriginalMessage(message, originalMessage, label = '서버 원문') {
  if (!originalMessage || message === originalMessage) return message
  return `${message}\n\n${label}: ${originalMessage}`
}

export function getServerErrorMessage(data, fallbackMessage = '서버 요청에 실패했습니다.', status = null) {
  const originalMessage = getApiErrorMessage(data, fallbackMessage)
  const source = String(originalMessage || '')
  const matched = SERVER_ERROR_PATTERNS.find((entry) => entry.test.test(source))

  if (matched) {
    return withOriginalMessage(matched.message, source)
  }

  if (status === 400) {
    return withOriginalMessage('서버 요청 값이 올바르지 않습니다. 입력값을 확인한 뒤 다시 시도해주세요.', source)
  }

  if (status === 401 || status === 403) {
    return withOriginalMessage('이 작업을 실행할 권한이 없습니다. 로그인 상태와 계정 권한을 확인해주세요.', source)
  }

  if (status === 404) {
    return withOriginalMessage('요청한 서버 리소스를 찾을 수 없습니다. 작업을 다시 시작해주세요.', source)
  }

  if (status === 429) {
    return withOriginalMessage('서버 요청이 일시적으로 많아 제한되었습니다. 잠시 후 다시 시도해주세요.', source)
  }

  if (status >= 500) {
    return withOriginalMessage('서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', source)
  }

  return originalMessage
}
