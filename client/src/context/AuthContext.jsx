import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

// 인증된 계정 목록
const AUTHORIZED_ACCOUNTS = [
  { email: 'admin@daval.co', password: 'daval2024!', name: '관리자' },
  { email: 'test@daval.co', password: 'test1234', name: '테스트' },
]

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('mybest_user')
    if (saved) {
      try { setUser(JSON.parse(saved)) } catch {}
    }
    setLoading(false)
  }, [])

  const login = (email, password) => {
    const account = AUTHORIZED_ACCOUNTS.find(
      a => a.email === email && a.password === password
    )
    if (!account) return { success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' }

    const userData = { email: account.email, name: account.name }
    setUser(userData)
    localStorage.setItem('mybest_user', JSON.stringify(userData))
    return { success: true }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('mybest_user')
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
