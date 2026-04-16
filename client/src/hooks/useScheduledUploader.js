import { useEffect } from 'react'
import { getDue, update } from '../utils/scheduledUploads'

async function simulateUpload() {
  await new Promise(r => setTimeout(r, 3000))
  return Math.random() < 0.9 // 90% success rate
}

export function useScheduledUploader() {
  useEffect(() => {
    let cancelled = false

    async function checkDue() {
      const due = getDue(new Date())
      for (const item of due) {
        if (cancelled) break
        const title = item.content?.title || '(제목 없음)'
        console.log(`[Scheduler] uploading ${item.platform}: ${title}`)
        update(item.id, { status: 'uploading' })
        try {
          const success = await simulateUpload()
          if (cancelled) break
          if (success) {
            update(item.id, { status: 'completed' })
          } else {
            update(item.id, { status: 'failed', error: '업로드 실패 (시뮬레이션)' })
          }
        } catch (err) {
          if (!cancelled) {
            update(item.id, { status: 'failed', error: err.message || '알 수 없는 오류' })
          }
        }
      }
    }

    checkDue()
    const interval = setInterval(checkDue, 60000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])
}
