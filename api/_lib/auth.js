const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')

const SETTINGS_KEY = 'login_password_hash'
const SALT_ROUNDS = 10

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase 환경변수(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.')
  }
  return { url, serviceRoleKey }
}

function buildHeaders({ prefer } = {}) {
  const { serviceRoleKey } = getSupabaseConfig()
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  }
  if (prefer) headers.Prefer = prefer
  return headers
}

async function fetchPasswordHash() {
  const { url } = getSupabaseConfig()
  const target = `${url}/rest/v1/app_settings?key=eq.${encodeURIComponent(SETTINGS_KEY)}&select=value`
  const response = await fetch(target, { headers: buildHeaders() })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message || `Supabase 조회 실패 (${response.status})`)
  }
  const row = Array.isArray(data) ? data[0] : null
  return row?.value || null
}

async function upsertPasswordHash(hash) {
  const { url } = getSupabaseConfig()
  const target = `${url}/rest/v1/app_settings?on_conflict=key`
  const body = JSON.stringify([{ key: SETTINGS_KEY, value: hash, updated_at: new Date().toISOString() }])
  const response = await fetch(target, {
    method: 'POST',
    headers: buildHeaders({ prefer: 'resolution=merge-duplicates,return=minimal' }),
    body,
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.message || `Supabase 저장 실패 (${response.status})`)
  }
}

router.post('/verify', async (req, res) => {
  const password = String(req.body?.password || '')
  if (!password) {
    return res.status(400).json({ ok: false, message: '비밀번호를 입력해 주세요.' })
  }

  try {
    const hash = await fetchPasswordHash()
    if (!hash) {
      return res.status(500).json({ ok: false, message: '서버에 비밀번호가 설정되어 있지 않습니다.' })
    }
    const match = await bcrypt.compare(password, hash)
    if (!match) {
      return res.status(401).json({ ok: false, message: '비밀번호가 올바르지 않습니다.' })
    }
    return res.json({ ok: true })
  } catch (error) {
    console.error('[auth/verify]', error)
    return res.status(500).json({ ok: false, message: error.message || '서버 오류' })
  }
})

router.post('/change', async (req, res) => {
  const currentPw = String(req.body?.currentPw || '')
  const newPw = String(req.body?.newPw || '')

  if (!currentPw || !newPw) {
    return res.status(400).json({ ok: false, message: '현재/새 비밀번호를 모두 입력해 주세요.' })
  }
  if (newPw.length < 4) {
    return res.status(400).json({ ok: false, message: '새 비밀번호는 4자 이상이어야 합니다.' })
  }

  try {
    const hash = await fetchPasswordHash()
    if (!hash) {
      return res.status(500).json({ ok: false, message: '서버에 비밀번호가 설정되어 있지 않습니다.' })
    }
    const match = await bcrypt.compare(currentPw, hash)
    if (!match) {
      return res.status(401).json({ ok: false, message: '현재 비밀번호가 올바르지 않습니다.' })
    }
    const newHash = await bcrypt.hash(newPw, SALT_ROUNDS)
    await upsertPasswordHash(newHash)
    return res.json({ ok: true })
  } catch (error) {
    console.error('[auth/change]', error)
    return res.status(500).json({ ok: false, message: error.message || '서버 오류' })
  }
})

module.exports = router
