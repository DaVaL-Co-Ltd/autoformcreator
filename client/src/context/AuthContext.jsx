import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

// 접속 비밀번호
const ACCESS_PASSWORD = '1234'

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

  const login = (password) => {
    if (password !== ACCESS_PASSWORD) return { success: false, message: '비밀번호가 올바르지 않습니다.' }

    const userData = { name: '사용자' }
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
