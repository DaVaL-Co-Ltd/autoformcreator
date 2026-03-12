import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Upload, Sparkles, Check, ChevronRight, Loader2, FileText,
  Image, Play, Mail, BookOpen, Edit3, X
} from 'lucide-react';

const STEPS = ['PDF 업로드', '하이라이트 선택', '생성 결과 확인'];

const ContentCreatePage = () => {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  // Step 1
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');

  // Step 2
  const [contentId, setContentId] = useState(null);
  const [summary, setSummary] = useState('');
  const [highlights, setHighlights] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [editingIdx, setEditingIdx] = useState(null);

  // Step 3
  const [generated, setGenerated] = useState(null);
  const [activeTab, setActiveTab] = useState('blog');

  const handleFileDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files[0] || e.target.files[0];
    if (f && f.type === 'application/pdf') {
      setFile(f);
      if (!title) setTitle(f.name.replace('.pdf', ''));
    }
  };

  const handleUploadAndAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setLoadingMsg('PDF를 업로드하고 있습니다...');
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('title', title || file.name);
      const uploadRes = await axios.post('/api/content/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const id = uploadRes.data.id;
      setContentId(id);

      setLoadingMsg('AI가 콘텐츠를 분석하고 있습니다...');
      const analyzeRes = await axios.post(`/api/content/${id}/analyze`);
      setSummary(analyzeRes.data.summary);
      setHighlights(analyzeRes.data.highlights || []);
      setSelected(new Set(analyzeRes.data.highlights?.map((_, i) => i) || []));
      setStep(1);
    } catch (err) {
      alert(err.response?.data?.message || '업로드 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const toggleHighlight = (idx) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const updateHighlight = (idx, text) => {
    setHighlights(prev => prev.map((h, i) => i === idx ? text : h));
    setEditingIdx(null);
  };

  const handleGenerate = async () => {
    if (selected.size === 0) { alert('하이라이트를 1개 이상 선택해주세요.'); return; }
    setLoading(true);
    setLoadingMsg('AI가 콘텐츠를 생성하고 있습니다...');
    try {
      const selectedHighlights = [...selected].map(i => highlights[i]);
      await axios.put(`/api/content/${contentId}/highlights`, { selectedHighlights });
      const res = await axios.post(`/api/content/${contentId}/generate`);
      setGenerated(res.data);
      setStep(2);
    } catch (err) {
      alert(err.response?.data?.message || '콘텐츠 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { key: 'blog', label: '블로그', icon: BookOpen },
    { key: 'instagram', label: '인스타그램', icon: Image },
    { key: 'longformScript', label: '롱폼 영상', icon: Play },
    { key: 'shortformScript', label: '숏폼 영상', icon: Play },
    { key: 'newsletter', label: '뉴스레터', icon: Mail },
  ];

  // Loading overlay
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <Loader2 className="animate-spin text-primary mb-4" size={48} />
        <p className="text-lg font-medium text-gray-600">{loadingMsg}</p>
        <p className="text-sm text-gray-400 mt-2">잠시만 기다려주세요...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-black text-primary tracking-tight mb-2">새 콘텐츠 만들기</h1>
      <p className="text-gray-500 mb-8">PDF를 업로드하면 AI가 분석하여 다양한 콘텐츠를 생성합니다.</p>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-10">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${
              i === step ? 'bg-primary text-white' : i < step ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
            }`}>
              {i < step ? <Check size={16} /> : <span>{i + 1}</span>}
              <span className="hidden sm:inline">{s}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight size={16} className="text-gray-300" />}
          </div>
        ))}
      </div>

      {/* Step 1: PDF Upload */}
      {step === 0 && (
        <div className="max-w-2xl">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
              file ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-white hover:border-primary hover:bg-gray-50'
            }`}
          >
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileDrop} />
            {file ? (
              <div>
                <Check size={48} className="mx-auto mb-4 text-green-500" />
                <p className="font-bold text-lg text-primary">{file.name}</p>
                <p className="text-sm text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                <p className="text-sm text-green-600 mt-3 font-medium">파일이 선택되었습니다. 다른 파일을 선택하려면 클릭하세요.</p>
              </div>
            ) : (
              <div>
                <Upload size={48} className="mx-auto mb-4 text-gray-400" />
                <p className="font-bold text-lg text-primary mb-1">PDF 파일을 드래그하거나 클릭하세요</p>
                <p className="text-sm text-gray-500">PDF 형식만 지원됩니다 (최대 100MB)</p>
              </div>
            )}
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">콘텐츠 제목 (선택)</label>
            <input
              value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              placeholder="제목을 입력하세요 (비워두면 파일명이 사용됩니다)"
            />
          </div>

          <button
            onClick={handleUploadAndAnalyze}
            disabled={!file}
            className="mt-6 w-full bg-primary text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Sparkles size={20} /> 분석 시작
          </button>
        </div>
      )}

      {/* Step 2: Highlight Selection */}
      {step === 1 && (
        <div className="max-w-3xl">
          {/* Summary */}
          <div className="bg-blue-50 rounded-2xl p-6 mb-8">
            <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2"><Sparkles size={18} /> AI 분석 요약</h3>
            <p className="text-blue-700 text-sm leading-relaxed">{summary}</p>
          </div>

          {/* Highlights */}
          <h3 className="font-bold text-lg text-primary mb-4">
            하이라이트 선택 <span className="text-sm font-normal text-gray-500">({selected.size}/{highlights.length}개 선택됨)</span>
          </h3>
          <div className="space-y-3 mb-8">
            {highlights.map((h, i) => (
              <div
                key={i}
                className={`border rounded-xl p-4 transition-all cursor-pointer ${
                  selected.has(i) ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggleHighlight(i)}
                    className="mt-1 w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <div className="flex-1 min-w-0">
                    {editingIdx === i ? (
                      <div className="flex gap-2">
                        <textarea
                          defaultValue={h}
                          onBlur={(e) => updateHighlight(i, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-primary resize-none"
                          rows={3}
                          autoFocus
                        />
                        <button onClick={() => setEditingIdx(null)} className="text-gray-400 hover:text-primary">
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-gray-700 leading-relaxed" onClick={() => toggleHighlight(i)}>{h}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingIdx(i); }}
                          className="text-gray-400 hover:text-primary flex-shrink-0"
                        >
                          <Edit3 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleGenerate}
            disabled={selected.size === 0}
            className="w-full bg-primary text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-30"
          >
            <Sparkles size={20} /> 선택한 하이라이트로 콘텐츠 생성 ({selected.size}개)
          </button>
        </div>
      )}

      {/* Step 3: Generated Results */}
      {step === 2 && generated && (
        <div>
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

          {/* Content Display */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 min-h-[300px]">
            {activeTab === 'blog' && (
              <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><BookOpen size={20} /> 블로그 글</h3>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700 leading-relaxed">{generated.blog}</div>
              </div>
            )}
            {activeTab === 'instagram' && (
              <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Image size={20} /> 인스타그램</h3>
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-gray-500 mb-2">캡션</h4>
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{generated.instagram?.caption}</p>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-500 mb-2">이미지 프롬프트</h4>
                  <p className="text-gray-500 text-sm italic">{generated.instagram?.imagePrompt}</p>
                </div>
              </div>
            )}
            {activeTab === 'longformScript' && (
              <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Play size={20} /> 롱폼 영상 스크립트</h3>
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">{generated.longformScript}</div>
              </div>
            )}
            {activeTab === 'shortformScript' && (
              <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Play size={20} /> 숏폼 영상 스크립트</h3>
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">{generated.shortformScript}</div>
              </div>
            )}
            {activeTab === 'newsletter' && (
              <div>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Mail size={20} /> 뉴스레터</h3>
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">{generated.newsletter}</div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => navigate(`/content/${contentId}/edit`)}
              className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-50 transition-colors"
            >
              <Edit3 size={18} /> 수정하기
            </button>
            <button
              onClick={() => navigate(`/distribution?contentId=${contentId}`)}
              className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition-colors"
            >
              <FileText size={18} /> 배포하기
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center justify-center gap-2 text-gray-500 px-6 py-3 rounded-xl font-medium text-sm hover:bg-gray-100 transition-colors"
            >
              대시보드로
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentCreatePage;
