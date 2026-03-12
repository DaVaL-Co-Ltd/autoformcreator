import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, FileText, Send, Users, Check, Loader2, ArrowRight } from 'lucide-react';
import axios from 'axios';

const features = [
  {
    icon: Sparkles,
    title: 'AI 콘텐츠 변환',
    desc: 'PDF 한 권으로 블로그, SNS, 영상 스크립트까지 자동 생성합니다.',
    color: 'bg-purple-500',
  },
  {
    icon: Send,
    title: '멀티 채널 배포',
    desc: '유튜브, 인스타그램, 네이버 블로그에 한번에 배포하세요.',
    color: 'bg-blue-500',
  },
  {
    icon: Users,
    title: '구독자 관리',
    desc: '뉴스레터, 알림톡으로 구독자와 직접 소통하세요.',
    color: 'bg-green-500',
  },
];

const LandingPage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', phone: '', email: '', kakaoId: '',
    consentNewsletter: false, consentPrivacy: false,
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.consentNewsletter || !form.consentPrivacy) {
      setError('필수 동의 항목을 체크해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await axios.post('/api/subscribers', form);
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.message || '구독 신청 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const scrollToForm = () => {
    document.getElementById('subscribe-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-500 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-5xl mx-auto px-6 py-24 lg:py-36 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-sm font-medium mb-8 backdrop-blur-sm">
            <Sparkles size={16} className="text-yellow-400" />
            AI 기반 콘텐츠 자동화 플랫폼
          </div>
          <h1 className="text-4xl lg:text-6xl font-black mb-6 leading-tight">
            당신의 콘텐츠,<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
              AI가 날개를 달아드립니다
            </span>
          </h1>
          <p className="text-lg lg:text-xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            책, 강의, 전문 지식을 블로그, 인스타그램, 유튜브 콘텐츠로 자동 변환하세요.
            AI가 분석하고, 생성하고, 배포까지 도와드립니다.
          </p>
          <button
            onClick={scrollToForm}
            className="inline-flex items-center gap-2 bg-white text-slate-900 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-slate-100 transition-all shadow-xl hover:shadow-2xl"
          >
            구독 신청하기
            <ArrowRight size={20} />
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-black text-center mb-4">주요 기능</h2>
        <p className="text-gray-500 text-center mb-12">크리에이터를 위한 올인원 콘텐츠 솔루션</p>
        <div className="grid md:grid-cols-3 gap-8">
          {features.map((f) => (
            <div key={f.title} className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className={`w-12 h-12 ${f.color} rounded-xl flex items-center justify-center mb-5`}>
                <f.icon size={24} className="text-white" />
              </div>
              <h3 className="text-lg font-bold mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Subscription Form */}
      <section id="subscribe-form" className="bg-slate-50 py-20">
        <div className="max-w-lg mx-auto px-6">
          <h2 className="text-3xl font-black text-center mb-3">최신 콘텐츠 소식을 받아보세요</h2>
          <p className="text-gray-500 text-center mb-10">구독하시면 새로운 콘텐츠와 유용한 소식을 보내드립니다.</p>

          {submitted ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-gray-100 shadow-sm">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <Check size={32} className="text-green-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">구독이 완료되었습니다!</h3>
              <p className="text-gray-500">감사합니다. 곧 유용한 콘텐츠 소식을 보내드리겠습니다.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-5">
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">이름 <span className="text-red-500">*</span></label>
                <input
                  name="name" value={form.name} onChange={handleChange} required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="홍길동"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">전화번호 <span className="text-red-500">*</span></label>
                <input
                  name="phone" value={form.phone} onChange={handleChange} required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="010-1234-5678"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">이메일 <span className="text-red-500">*</span></label>
                <input
                  name="email" type="email" value={form.email} onChange={handleChange} required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">카카오톡 ID</label>
                <input
                  name="kakaoId" value={form.kakaoId} onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="kakao_id"
                />
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox" name="consentNewsletter"
                    checked={form.consentNewsletter} onChange={handleChange}
                    className="mt-0.5 w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-600">
                    <span className="text-red-500">[필수]</span> 뉴스레터 및 알림 수신에 동의합니다.
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox" name="consentPrivacy"
                    checked={form.consentPrivacy} onChange={handleChange}
                    className="mt-0.5 w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-600">
                    <span className="text-red-500">[필수]</span> 개인정보 수집 및 이용에 동의합니다.
                  </span>
                </label>
              </div>

              <button
                type="submit" disabled={loading}
                className="w-full bg-primary text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : '구독 신청하기'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} />
            <span className="font-bold">CreatorHub</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <button onClick={() => navigate('/auth')} className="hover:text-primary transition-colors">
              관리자 로그인
            </button>
            <span>© 2026 CreatorHub. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
