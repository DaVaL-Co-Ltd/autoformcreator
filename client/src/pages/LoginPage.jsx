import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Loader2, Lock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    await new Promise((resolve) => setTimeout(resolve, 500))

    const result = login(password)
    if (result.success) {
      sessionStorage.setItem('show_desktop_helper_prompt', '1')
      navigate('/', { replace: true })
    } else {
      setError(result.message)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-2xl shadow-primary/30">
              <img src="/logo.svg" alt="MyBest" className="w-10 h-10" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">MyBest</h1>
          <p className="text-sm text-slate-400 mt-2">Content Automation Platform</p>
        </div>

        <div className="bg-white/[0.05] backdrop-blur-xl rounded-2xl border border-white/[0.08] p-7 shadow-2xl">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="p-2 rounded-xl bg-primary/10">
              <Lock size={18} className="text-primary-light" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">로그인</h2>
              <p className="text-xs text-slate-400">비밀번호를 입력해 주세요.</p>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호를 입력해 주세요"
                required
                className="w-full px-4 py-3 bg-white/[0.06] border border-white/[0.1] rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  로그인 중...
                </>
              ) : (
                <>
                  <span>로그인</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500 mt-8">
          DaVaL &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
