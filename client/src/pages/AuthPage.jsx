import { useState } from 'react';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const AuthPage = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await login(email, password, isLogin);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b">
                    <button
                        onClick={() => setIsLogin(true)}
                        className={`flex-1 py-4 text-sm font-semibold transition-colors ${isLogin ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Login
                    </button>
                    <button
                        onClick={() => setIsLogin(false)}
                        className={`flex-1 py-4 text-sm font-semibold transition-colors ${!isLogin ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Sign up
                    </button>
                </div>

                <div className="p-8">
                    <div className="mb-8 text-center">
                        <h1 className="text-2xl font-bold text-primary mb-2">
                            {isLogin ? 'Welcome back' : 'Create an account'}
                        </h1>
                        <p className="text-gray-500 mb-4">
                            {isLogin ? 'Simplify your business automation with DaVal' : 'Start your automation journey today'}
                        </p>
                        {error && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium animate-pulse">
                                {error}
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <Mail size={18} />
                                </div>
                                <input
                                    type="text"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                    placeholder="name@company.com"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors group disabled:opacity-50"
                        >
                            {loading ? (
                                <Loader2 className="animate-spin" size={18} />
                            ) : (
                                <>
                                    {isLogin ? 'Login' : 'Get Started'}
                                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    {isLogin && (
                        <div className="mt-6 text-center">
                            <a href="#" className="text-sm text-gray-400 hover:text-primary transition-colors">
                                Forgot your password?
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuthPage;
