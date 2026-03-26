const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY
const PROXY_URL = '/api/elevenlabs'

// 음성 ID
const SHORTS_VOICE_ID = 'XJ2fW4ybq7HouelYYGcL'  // 선택된 유료 음성

// 기본 TTS (프록시 경유)
export async function textToSpeech(text, voiceId = SHORTS_VOICE_ID) {
  const res = await fetch(`${PROXY_URL}/tts/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      language_code: 'ko',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
  })

  if (!res.ok) throw new Error(`ElevenLabs API 오류: ${res.status}`)
  const audioBlob = await res.blob()
  return URL.createObjectURL(audioBlob)
}

// TTS + 오디오 길이 반환
export async function textToSpeechWithDuration(text, voiceId = SHORTS_VOICE_ID) {
  const audioUrl = await textToSpeech(text, voiceId)
  const audioBlob = await fetch(audioUrl).then(r => r.blob())
  const duration = await new Promise((resolve) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => resolve(audio.duration)
    audio.onerror = () => resolve(5)
    audio.src = URL.createObjectURL(audioBlob)
  })
  return { audioUrl, duration }
}

export async function generateNarrationForScenes(scenes) {
  const results = []
  for (const scene of scenes) {
    try {
      const { audioUrl, duration } = await textToSpeechWithDuration(scene.narration, SHORTS_VOICE_ID)
      results.push({ sceneNumber: scene.sceneNumber, audioUrl, text: scene.narration, duration })
    } catch (err) {
      results.push({ sceneNumber: scene.sceneNumber, audioUrl: null, error: err.message, text: scene.narration, duration: 5 })
    }
  }
  return results
}
