import { useAuth } from '../context/AuthContext';
import { LogOut, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Header = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/auth');
    };

    return (
        <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                <div className="flex items-center gap-12">
                    <div className="text-2xl font-black tracking-tighter cursor-pointer" onClick={() => navigate('/dashboard')}>
                        DaVal
                    </div>
                    <div className="hidden md:flex items-center bg-gray-50 px-4 py-2 rounded-xl border border-gray-100 w-80">
                        <Search size={18} className="text-gray-400 mr-2" />
                        <input
                            type="text"
                            placeholder="Search request..."
                            className="bg-transparent border-none outline-none text-sm w-full"
                        />
                    </div>
                    {user?.role === 'admin' && (
                        <button
                            onClick={() => navigate('/admin')}
                            className="text-xs font-black uppercase tracking-widest text-gray-400 hover:text-primary transition-colors border-b-2 border-transparent hover:border-primary pb-1"
                        >
                            Admin Console
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/request/new')}
                        className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition-colors"
                    >
                        <Plus size={18} />
                        New Request
                    </button>

                    <div className="h-8 w-px bg-gray-100 mx-2" />

                    <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-bold text-primary">{user?.email?.split('@')[0]}</div>
                            <div className="text-xs text-gray-400 capitalize">{user?.role}</div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        >
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
