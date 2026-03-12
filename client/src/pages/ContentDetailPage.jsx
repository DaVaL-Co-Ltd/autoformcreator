import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Loader2, ArrowLeft, Edit3, Trash2, Send, BookOpen, Image, Play, Mail, Clock, Sparkles
} from 'lucide-react';

const statusMap = {
  uploaded: { label: '업로드됨', cls: 'bg-gray-100 text-gray-600' },
  analyzing: { label: '분석중', cls: 'bg-yellow-100 text-yellow-700' },
  analyzed: { label: '분석완료', cls: 'bg-blue-100 text-blue-700' },
  generated: { label: '콘텐츠생성됨', cls: 'bg-purple-100 text-purple-700' },
  published: { label: '배포됨', cls: 'bg-green-100 text-green-700' },
};

const ContentDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('blog');
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    axios.get(`/api/content/${id}`)
      .then(res => setContent(res.data))
      .catch(() => navigate('/content'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleDelete = async () => {
    try {
      await axios.delete(`/api/content/${id}`);
      navigate('/content');
    } catch (err) {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const tabs = [
    { key: 'blog', label: '블로그', icon: BookOpen },
    { key: 'instagram', label: '인스타그램', icon: Image },
    { key: 'longformScript', label: '롱폼 영상', icon: Play },
    { key: 'shortformScript', label: '숏폼 영상', icon: Play },
    { key: 'newsletter', label: '뉴스레터', icon: Mail },
  ];

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="animate-spin text-gray-400" size={40} /></div>;
  if (!content) return null;

  const s = statusMap[content.status] || statusMap.uploaded;
  const gen = content.generatedContent;

  return (
    <div>
      {/* Header */}
      <button onClick={() => navigate('/content')} className="flex items-center gap-1 text-gray-500 hover:text-primary text-sm font-medium mb-6 transition-colors">
        <ArrowLeft size={16} /> 콘텐츠 목록
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-black text-primary tracking-tight">{content.title}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${s.cls}`}>{s.label}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-1"><Clock size={14} /> {new Date(content.createdAt).toLocaleDateString('ko-KR')}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/content/${id}/edit`)} className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors">
            <Edit3 size={16} /> 수정
          </button>
          <button onClick={() => navigate(`/distribution?contentId=${id}`)} className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors">
            <Send size={16} /> 배포
          </button>
          <button onClick={() => setShowDelete(true)} className="flex items-center gap-2 bg-white border border-red-200 text-red-500 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-red-50 transition-colors">
            <Trash2 size={16} /> 삭제
          </button>
        </div>
      </div>

      {/* Summary */}
      {content.summary && (
        <div className="bg-blue-50 rounded-2xl p-6 mb-6">
          <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2"><Sparkles size={18} /> AI 분석 요약</h3>
          <p className="text-blue-700 text-sm leading-relaxed">{content.summary}</p>
        </div>
      )}

      {/* Highlights */}
      {content.selectedHighlights?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h3 className="font-bold text-lg text-primary mb-4">선택된 하이라이트</h3>
          <div className="space-y-2">
            {content.selectedHighlights.map((h, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <span className="text-xs font-bold text-gray-400 mt-0.5">{i + 1}</span>
                <p className="text-sm text-gray-700 leading-relaxed">{h}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generated Content */}
      {gen && (
        <div>
          <div className="flex gap-1 mb-4 overflow-x-auto bg-gray-100 p-1 rounded-xl">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === t.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-primary'
                }`}
              >
                <t.icon size={16} /> {t.label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 min-h-[300px]">
            {activeTab === 'blog' && <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">{gen.blog}</div>}
            {activeTab === 'instagram' && (
              <div>
                <h4 className="text-sm font-bold text-gray-500 mb-2">캡션</h4>
                <p className="text-gray-700 whitespace-pre-wrap mb-4">{gen.instagram?.caption}</p>
                <h4 className="text-sm font-bold text-gray-500 mb-2">이미지 프롬프트</h4>
                <p className="text-gray-500 text-sm italic">{gen.instagram?.imagePrompt}</p>
              </div>
            )}
            {activeTab === 'longformScript' && <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">{gen.longformScript}</div>}
            {activeTab === 'shortformScript' && <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">{gen.shortformScript}</div>}
            {activeTab === 'newsletter' && <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">{gen.newsletter}</div>}
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-primary mb-2">콘텐츠 삭제</h3>
            <p className="text-gray-500 text-sm mb-6">이 콘텐츠를 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDelete(false)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors">취소</button>
              <button onClick={handleDelete} className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold text-sm hover:bg-red-600 transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentDetailPage;
