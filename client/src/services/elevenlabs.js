const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY
const PROXY_URL = 'http://localhost:3001/api/elevenlabs'

// 기본 한국어 음성 ID (Rachel - multilingual)
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

export async function textToSpeech(text, voiceId = DEFAULT_VOICE_ID) {
  const res = await fetch(`${PROXY_URL}/tts/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
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

export async function generateNarrationForScenes(scenes) {
  const results = []
  for (const scene of scenes) {
    try {
      const audioUrl = await textToSpeech(scene.narration)
      results.push({ sceneNumber: scene.sceneNumber, audioUrl, text: scene.narration })
    } catch (err) {
      results.push({ sceneNumber: scene.sceneNumber, audioUrl: null, error: err.message, text: scene.narration })
    }
  }
  return results
}

export async function generateFullNarration(fullText) {
  try {
    const audioUrl = await textToSpeech(fullText)
    return { audioUrl, text: fullText }
  } catch (err) {
    return { audioUrl: null, error: err.message, text: fullText }
  }
}
