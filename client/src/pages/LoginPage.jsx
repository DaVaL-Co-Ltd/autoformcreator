import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loader2, LogIn, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    await new Promise(r => setTimeout(r, 500))

    const result = login(password)
    if (result.success) {
      navigate('/', { replace: true })
    } else {
      setError(result.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="MyBest" className="w-16 h-16 rounded-2xl" />
          </div>
          <h1 className="text-2xl font-bold text-text">
            <span className="text-primary">My</span>Best
          </h1>
          <p className="text-sm text-text-muted mt-1">영상자동화 서비스</p>
        </div>

        <div className="bg-surface rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-text mb-1">로그인</h2>
          <p className="text-xs text-text-muted mb-6">비밀번호를 입력하세요.</p>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-danger/10 border border-danger/20">
              <AlertCircle size={14} className="text-danger shrink-0" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                required
                className="w-full px-3 py-2.5 bg-surface-light border border-border rounded-lg text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> 로그인 중...</> : <><LogIn size={16} /> 로그인</>}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-text-muted mt-6">
          DaVaL &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
