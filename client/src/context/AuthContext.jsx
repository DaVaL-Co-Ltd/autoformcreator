import { createContext, useState } from 'react'

const AuthContext = createContext(null)

const API_BASE = import.meta.env.VITE_SERVER_URL || ''

async function postJson(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let data = null
  try {
    data = await response.json()
  } catch {
    /* JSON 파싱 실패는 무시 — data 는 null 로 유지 */
  }
  return { ok: response.ok, status: response.status, data }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('mybest_user')
    if (!saved) {
      return null
    }

    try {
      return JSON.parse(saved)
    } catch {
      return null
    }
  })
  const [loading] = useState(false)

  const login = async (password) => {
    try {
      const { ok, data } = await postJson('/api/auth/verify', { password })
      if (!ok) {
        return { success: false, message: data?.message || '비밀번호가 올바르지 않습니다.' }
      }
      const userData = { name: '사용자' }
      setUser(userData)
      localStorage.setItem('mybest_user', JSON.stringify(userData))
      return { success: true }
    } catch (error) {
      return { success: false, message: error?.message || '서버와 통신할 수 없습니다.' }
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('mybest_user')
  }

  const changePassword = async (currentPw, newPw) => {
    try {
      const { ok, data } = await postJson('/api/auth/change', { currentPw, newPw })
      if (!ok) {
        return { success: false, message: data?.message || '비밀번호 변경에 실패했습니다.' }
      }
      return { success: true }
    } catch (error) {
      return { success: false, message: error?.message || '서버와 통신할 수 없습니다.' }
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, changePassword, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export { AuthContext }
