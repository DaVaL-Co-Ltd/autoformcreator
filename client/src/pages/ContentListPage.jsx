import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FileText, Plus, Loader2, Sparkles, Clock, Image } from 'lucide-react';

const statusMap = {
  uploaded: { label: '업로드됨', cls: 'bg-gray-100 text-gray-600' },
  analyzing: { label: '분석중', cls: 'bg-yellow-100 text-yellow-700' },
  analyzed: { label: '분석완료', cls: 'bg-blue-100 text-blue-700' },
  generated: { label: '콘텐츠생성됨', cls: 'bg-purple-100 text-purple-700' },
  published: { label: '배포됨', cls: 'bg-green-100 text-green-700' },
};

const ContentListPage = () => {
  const navigate = useNavigate();
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    axios.get('/api/content')
      .then(res => setContents(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filters = [
    { key: 'all', label: '전체' },
    { key: 'analyzed', label: '분석 완료' },
    { key: 'generated', label: '콘텐츠 생성됨' },
    { key: 'published', label: '배포됨' },
  ];

  const filtered = filter === 'all' ? contents : contents.filter(c => c.status === filter);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="animate-spin text-gray-400" size={40} /></div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-primary tracking-tight">콘텐츠 관리</h1>
          <p className="text-gray-500 mt-1">PDF를 업로드하고 AI로 콘텐츠를 생성하세요.</p>
        </div>
        <button
          onClick={() => navigate('/content/create')}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors"
        >
          <Plus size={18} /> 새 콘텐츠 만들기
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f.key ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content Grid */}
      {filtered.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-5">
          {filtered.map(c => {
            const s = statusMap[c.status] || statusMap.uploaded;
            return (
              <div
                key={c.id}
                onClick={() => navigate(`/content/${c.id}`)}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden"
              >
                {c.imageUrl ? (
                  <div className="h-40 bg-gray-100 overflow-hidden">
                    <img src={c.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-40 bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center">
                    <Image size={40} className="text-gray-300" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-bold text-primary text-lg leading-tight">{c.title}</h3>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${s.cls}`}>{s.label}</span>
                  </div>
                  {c.summary && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{c.summary}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Clock size={12} /> {new Date(c.createdAt).toLocaleDateString('ko-KR')}</span>
                    {c.generatedContent && (
                      <span className="flex items-center gap-1"><FileText size={12} /> {Object.keys(c.generatedContent).length}개 콘텐츠</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
          <Sparkles size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-xl font-bold text-primary mb-2">아직 콘텐츠가 없습니다</h3>
          <p className="text-gray-500 mb-6">PDF를 업로드하여 AI 콘텐츠 생성을 시작하세요.</p>
          <button
            onClick={() => navigate('/content/create')}
            className="bg-primary text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors"
          >
            시작하기
          </button>
        </div>
      )}
    </div>
  );
};

export default ContentListPage;
