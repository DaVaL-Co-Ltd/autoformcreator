import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import {
  Users, FileText, Send, Bell, Plus, ArrowRight, Loader2, Sparkles, Clock
} from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, colorClass }) => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${colorClass}`}>
        <Icon size={22} className="text-white" />
      </div>
    </div>
    <div className="text-3xl font-black text-primary mb-1">{value}</div>
    <div className="text-sm font-medium text-gray-400">{title}</div>
  </div>
);

const DashboardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState({ subscribers: 0, contents: 0, distributions: 0, notifications: 0 });
  const [recentContent, setRecentContent] = useState([]);
  const [recentSubscribers, setRecentSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [contentRes, subRes, distRes, notiRes] = await Promise.allSettled([
          axios.get('/api/content'),
          axios.get('/api/subscribers'),
          axios.get('/api/distribution'),
          axios.get('/api/notifications'),
        ]);

        const contents = contentRes.status === 'fulfilled' ? contentRes.value.data : [];
        const subscribers = subRes.status === 'fulfilled' ? subRes.value.data : [];
        const distributions = distRes.status === 'fulfilled' ? distRes.value.data : [];
        const notifications = notiRes.status === 'fulfilled' ? notiRes.value.data : [];

        setStats({
          subscribers: subscribers.length,
          contents: contents.length,
          distributions: distributions.length,
          notifications: notifications.length,
        });
        setRecentContent(contents.slice(0, 5));
        setRecentSubscribers(subscribers.slice(0, 5));
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getStatusBadge = (status) => {
    const map = {
      'uploaded': { label: '업로드됨', cls: 'bg-gray-100 text-gray-600' },
      'analyzing': { label: '분석중', cls: 'bg-yellow-100 text-yellow-700' },
      'analyzed': { label: '분석완료', cls: 'bg-blue-100 text-blue-700' },
      'generated': { label: '콘텐츠생성됨', cls: 'bg-purple-100 text-purple-700' },
      'published': { label: '배포됨', cls: 'bg-green-100 text-green-700' },
    };
    const s = map[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
    return <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${s.cls}`}>{s.label}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-gray-400" size={40} />
      </div>
    );
  }

  return (
    <div>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-primary tracking-tight">
          안녕하세요, {user?.email?.split('@')[0]}님
        </h1>
        <p className="text-gray-500 mt-1">오늘의 크리에이터 활동을 확인하세요.</p>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={() => navigate('/content/create')}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors"
        >
          <Plus size={18} />
          새 콘텐츠 만들기
        </button>
        <button
          onClick={() => navigate('/notifications')}
          className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors"
        >
          <Bell size={18} />
          알림 발송
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
        <StatCard title="총 구독자" value={stats.subscribers} icon={Users} colorClass="bg-blue-500" />
        <StatCard title="총 콘텐츠" value={stats.contents} icon={FileText} colorClass="bg-purple-500" />
        <StatCard title="배포 현황" value={stats.distributions} icon={Send} colorClass="bg-green-500" />
        <StatCard title="알림 발송" value={stats.notifications} icon={Bell} colorClass="bg-amber-500" />
      </div>

      {/* Content Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Content */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
              <FileText size={18} /> 최근 콘텐츠
            </h2>
            <button onClick={() => navigate('/content')} className="text-sm font-medium text-gray-400 hover:text-primary transition-colors flex items-center gap-1">
              전체보기 <ArrowRight size={14} />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {recentContent.length > 0 ? recentContent.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/content/${c.id}`)}
                className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-primary truncate">{c.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <Clock size={12} /> {new Date(c.createdAt).toLocaleDateString('ko-KR')}
                  </div>
                </div>
                {getStatusBadge(c.status)}
              </div>
            )) : (
              <div className="p-10 text-center text-gray-400">
                <Sparkles size={32} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm">아직 콘텐츠가 없습니다.</p>
                <button onClick={() => navigate('/content/create')} className="text-sm text-primary font-bold mt-2 hover:underline">
                  첫 콘텐츠 만들기
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Recent Subscribers */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
              <Users size={18} /> 최근 구독자
            </h2>
            <button onClick={() => navigate('/subscribers')} className="text-sm font-medium text-gray-400 hover:text-primary transition-colors flex items-center gap-1">
              전체보기 <ArrowRight size={14} />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {recentSubscribers.length > 0 ? recentSubscribers.map((s) => (
              <div key={s.id} className="p-5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm text-primary">{s.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.email}</div>
                </div>
                <div className="text-xs text-gray-400">
                  {new Date(s.createdAt).toLocaleDateString('ko-KR')}
                </div>
              </div>
            )) : (
              <div className="p-10 text-center text-gray-400">
                <Users size={32} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm">아직 구독자가 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
