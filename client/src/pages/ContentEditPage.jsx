import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Loader2, Save, ArrowLeft, BookOpen, Image, Play, Mail, Check } from 'lucide-react';

const ContentEditPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'blog');
  const [edits, setEdits] = useState({});

  useEffect(() => {
    axios.get(`/api/content/${id}`)
      .then(res => {
        setContent(res.data);
        const gen = res.data.generatedContent || {};
        setEdits({
          blog: gen.blog || '',
          instagramCaption: gen.instagram?.caption || '',
          instagramImagePrompt: gen.instagram?.imagePrompt || '',
          longformScript: gen.longformScript || '',
          shortformScript: gen.shortformScript || '',
          newsletter: gen.newsletter || '',
        });
      })
      .catch(() => navigate('/content'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`/api/content/${id}`, {
        generatedContent: {
          blog: edits.blog,
          instagram: { caption: edits.instagramCaption, imagePrompt: edits.instagramImagePrompt },
          longformScript: edits.longformScript,
          shortformScript: edits.shortformScript,
          newsletter: edits.newsletter,
        }
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
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

  return (
    <div>
      <button onClick={() => navigate(`/content/${id}`)} className="flex items-center gap-1 text-gray-500 hover:text-primary text-sm font-medium mb-6 transition-colors">
        <ArrowLeft size={16} /> 콘텐츠 상세
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-primary tracking-tight">콘텐츠 편집</h1>
          <p className="text-gray-500 mt-1">{content.title}</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-green-600 text-sm font-medium">
              <Check size={16} /> 저장됨
            </span>
          )}
          <button
            onClick={() => navigate(`/content/${id}`)}
            className="bg-white border border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            저장
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto bg-gray-100 p-1 rounded-xl">
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

      {/* Editor Area */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        {activeTab === 'blog' && (
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">블로그 글</label>
            <textarea
              value={edits.blog}
              onChange={(e) => setEdits(prev => ({ ...prev, blog: e.target.value }))}
              className="w-full h-96 px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y text-sm leading-relaxed"
            />
          </div>
        )}
        {activeTab === 'instagram' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-2">캡션</label>
              <textarea
                value={edits.instagramCaption}
                onChange={(e) => setEdits(prev => ({ ...prev, instagramCaption: e.target.value }))}
                className="w-full h-48 px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y text-sm leading-relaxed"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-600 mb-2">이미지 프롬프트</label>
              <textarea
                value={edits.instagramImagePrompt}
                onChange={(e) => setEdits(prev => ({ ...prev, instagramImagePrompt: e.target.value }))}
                className="w-full h-24 px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y text-sm leading-relaxed"
              />
            </div>
          </div>
        )}
        {activeTab === 'longformScript' && (
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">롱폼 영상 스크립트</label>
            <textarea
              value={edits.longformScript}
              onChange={(e) => setEdits(prev => ({ ...prev, longformScript: e.target.value }))}
              className="w-full h-96 px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y text-sm leading-relaxed"
            />
          </div>
        )}
        {activeTab === 'shortformScript' && (
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">숏폼 영상 스크립트</label>
            <textarea
              value={edits.shortformScript}
              onChange={(e) => setEdits(prev => ({ ...prev, shortformScript: e.target.value }))}
              className="w-full h-96 px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y text-sm leading-relaxed"
            />
          </div>
        )}
        {activeTab === 'newsletter' && (
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">뉴스레터</label>
            <textarea
              value={edits.newsletter}
              onChange={(e) => setEdits(prev => ({ ...prev, newsletter: e.target.value }))}
              className="w-full h-96 px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y text-sm leading-relaxed"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentEditPage;
