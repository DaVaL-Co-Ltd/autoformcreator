import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Send, Calendar, Clock, CheckCircle2, XCircle,
    Plus, X, Loader2, Youtube, Instagram, BookOpen, ChevronLeft, ChevronRight
} from 'lucide-react';

const PLATFORMS = [
    { id: 'youtube', label: '유튜브', icon: Youtube, color: 'text-red-500', bg: 'bg-red-50' },
    { id: 'instagram', label: '인스타그램', icon: Instagram, color: 'text-pink-500', bg: 'bg-pink-50' },
    { id: 'naver', label: '네이버 블로그', icon: BookOpen, color: 'text-green-600', bg: 'bg-green-50' },
];

const STATUS_MAP = {
    '예약됨': { label: '예약됨', color: 'bg-amber-50 text-amber-600', icon: Clock },
    '발행됨': { label: '발행됨', color: 'bg-green-50 text-green-600', icon: CheckCircle2 },
    '실패': { label: '실패', color: 'bg-red-50 text-red-500', icon: XCircle },
};

const MOCK_CONTENT = [
    { id: 1, title: '2025 여름 여행지 추천 TOP 10' },
    { id: 2, title: '초보자를 위한 영상 편집 가이드' },
    { id: 3, title: '월 100만원 절약하는 방법' },
    { id: 4, title: '홈카페 레시피 모음' },
];

const MOCK_DISTRIBUTIONS = [
    { id: 1, contentTitle: '2025 여름 여행지 추천 TOP 10', platform: 'youtube', status: '발행됨', date: '2025-06-01 10:00' },
    { id: 2, contentTitle: '2025 여름 여행지 추천 TOP 10', platform: 'instagram', status: '발행됨', date: '2025-06-01 10:05' },
    { id: 3, contentTitle: '초보자를 위한 영상 편집 가이드', platform: 'naver', status: '예약됨', date: '2025-06-20 09:00' },
    { id: 4, contentTitle: '월 100만원 절약하는 방법', platform: 'youtube', status: '실패', date: '2025-06-10 14:00' },
    { id: 5, contentTitle: '홈카페 레시피 모음', platform: 'instagram', status: '예약됨', date: '2025-06-25 18:00' },
    { id: 6, contentTitle: '홈카페 레시피 모음', platform: 'naver', status: '예약됨', date: '2025-06-25 18:00' },
];

const StatusBadge = ({ status }) => {
    const cfg = STATUS_MAP[status] || STATUS_MAP['예약됨'];
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
            <Icon size={11} />
            {cfg.label}
        </span>
    );
};

const PlatformIcon = ({ platformId, size = 16 }) => {
    const p = PLATFORMS.find(p => p.id === platformId);
    if (!p) return null;
    const Icon = p.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold ${p.bg} ${p.color}`}>
            <Icon size={size} />
            {p.label}
        </span>
    );
};

const PublishModal = ({ onClose, onSave, content }) => {
    const [selectedContent, setSelectedContent] = useState('');
    const [selectedPlatforms, setSelectedPlatforms] = useState([]);
    const [publishType, setPublishType] = useState('immediate');
    const [scheduledDate, setScheduledDate] = useState('');
    const [scheduledTime, setScheduledTime] = useState('');
    const [saving, setSaving] = useState(false);

    const togglePlatform = (id) => setSelectedPlatforms(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

    const handleSubmit = async () => {
        if (!selectedContent || selectedPlatforms.length === 0) return;
        setSaving(true);
        try {
            const payload = {
                contentId: selectedContent,
                platforms: selectedPlatforms,
                publishType,
                scheduledAt: publishType === 'scheduled' ? `${scheduledDate} ${scheduledTime}` : null,
            };
            if (publishType === 'immediate') {
                await axios.post('/api/distribution/publish', payload);
            } else {
                await axios.post('/api/distribution/schedule', payload);
            }
        } catch {}
        setSaving(false);
        onSave();
    };

    const contentItem = content.find(c => c.id === Number(selectedContent));

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-primary">새 배포 만들기</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X size={18} className="text-gray-400" />
                    </button>
                </div>
                <div className="p-6 space-y-5">
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1.5">콘텐츠 선택</label>
                        <select
                            value={selectedContent}
                            onChange={e => setSelectedContent(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-primary transition-colors bg-white"
                        >
                            <option value="">콘텐츠를 선택하세요</option>
                            {content.map(c => (
                                <option key={c.id} value={c.id}>{c.title}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-2">플랫폼 선택</label>
                        <div className="flex flex-wrap gap-2">
                            {PLATFORMS.map(p => {
                                const Icon = p.icon;
                                const active = selectedPlatforms.includes(p.id);
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => togglePlatform(p.id)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${active ? 'border-primary bg-primary text-white' : `border-gray-200 ${p.color} hover:border-gray-400`}`}
                                    >
                                        <Icon size={16} />
                                        {p.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-2">발행 방식</label>
                        <div className="flex gap-3">
                            {[
                                { value: 'immediate', label: '즉시 발행' },
                                { value: 'scheduled', label: '예약 발행' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setPublishType(opt.value)}
                                    className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${publishType === opt.value ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {publishType === 'scheduled' && (
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-xs font-semibold text-gray-500 block mb-1">날짜</label>
                                <input
                                    type="date"
                                    value={scheduledDate}
                                    onChange={e => setScheduledDate(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-primary transition-colors"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs font-semibold text-gray-500 block mb-1">시간</label>
                                <input
                                    type="time"
                                    value={scheduledTime}
                                    onChange={e => setScheduledTime(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-primary transition-colors"
                                />
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                        취소
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!selectedContent || selectedPlatforms.length === 0 || saving || (publishType === 'scheduled' && (!scheduledDate || !scheduledTime))}
                        className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-40 flex items-center gap-2"
                    >
                        {saving && <Loader2 size={14} className="animate-spin" />}
                        {publishType === 'immediate' ? '발행하기' : '예약하기'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const CalendarView = ({ distributions }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthLabel = `${year}년 ${month + 1}월`;

    const getDotsForDay = (day) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return distributions.filter(d => d.date?.startsWith(dateStr));
    };

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const today = new Date();

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-primary">{monthLabel}</h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <ChevronLeft size={16} className="text-gray-500" />
                    </button>
                    <button
                        onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <ChevronRight size={16} className="text-gray-500" />
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
                {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                    <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {cells.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} />;
                    const dots = getDotsForDay(day);
                    const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
                    return (
                        <div
                            key={day}
                            className={`min-h-[52px] p-1 rounded-xl flex flex-col items-center ${isToday ? 'bg-primary/5 border border-primary/20' : 'hover:bg-gray-50'}`}
                        >
                            <span className={`text-xs font-semibold mb-1 ${isToday ? 'text-primary' : 'text-gray-600'}`}>{day}</span>
                            <div className="flex flex-wrap gap-0.5 justify-center">
                                {dots.slice(0, 3).map((d, i) => {
                                    const p = PLATFORMS.find(p => p.id === d.platform);
                                    return (
                                        <span
                                            key={i}
                                            className={`w-1.5 h-1.5 rounded-full ${p?.id === 'youtube' ? 'bg-red-400' : p?.id === 'instagram' ? 'bg-pink-400' : 'bg-green-400'}`}
                                            title={`${d.contentTitle} - ${p?.label}`}
                                        />
                                    );
                                })}
                                {dots.length > 3 && <span className="text-[9px] text-gray-400">+{dots.length - 3}</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-3 flex gap-4 justify-center">
                {PLATFORMS.map(p => {
                    const colors = { youtube: 'bg-red-400', instagram: 'bg-pink-400', naver: 'bg-green-400' };
                    return (
                        <span key={p.id} className="flex items-center gap-1 text-xs text-gray-500">
                            <span className={`w-2 h-2 rounded-full ${colors[p.id]}`} />
                            {p.label}
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

const DistributionPage = () => {
    const [distributions, setDistributions] = useState(MOCK_DISTRIBUTIONS);
    const [content, setContent] = useState(MOCK_CONTENT);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [filterStatus, setFilterStatus] = useState('전체');
    const [view, setView] = useState('list');

    useEffect(() => {
        setLoading(true);
        Promise.all([
            axios.get('/api/distribution').then(r => setDistributions(r.data)).catch(() => {}),
            axios.get('/api/content').then(r => setContent(r.data)).catch(() => {}),
        ]).finally(() => setLoading(false));
    }, []);

    const statuses = ['전체', '예약됨', '발행됨', '실패'];
    const filtered = filterStatus === '전체' ? distributions : distributions.filter(d => d.status === filterStatus);

    const handleSave = () => {
        setShowModal(false);
        axios.get('/api/distribution')
            .then(r => setDistributions(r.data))
            .catch(() => setDistributions(prev => [...prev]));
    };

    return (
        <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-primary tracking-tight">배포 관리</h1>
                        <p className="text-gray-500 mt-1">콘텐츠를 플랫폼에 배포하고 일정을 관리하세요.</p>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition-colors self-start sm:self-auto"
                    >
                        <Plus size={18} />
                        새 배포
                    </button>
                </div>

                {/* View Toggle + Filters */}
                <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
                    <div className="flex gap-2">
                        {statuses.map(s => (
                            <button
                                key={s}
                                onClick={() => setFilterStatus(s)}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${filterStatus === s ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setView('list')}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${view === 'list' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200'}`}
                        >
                            목록
                        </button>
                        <button
                            onClick={() => setView('calendar')}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1 ${view === 'calendar' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200'}`}
                        >
                            <Calendar size={12} />
                            캘린더
                        </button>
                    </div>
                </div>

                {view === 'calendar' ? (
                    <CalendarView distributions={distributions} />
                ) : loading ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-24 flex flex-col items-center text-gray-400">
                        <Loader2 className="animate-spin mb-3" size={32} />
                        <span className="text-sm">불러오는 중...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-24 flex flex-col items-center text-gray-400">
                        <Send size={36} className="mb-3 opacity-30" />
                        <p className="text-sm font-medium mb-4">배포 기록이 없습니다.</p>
                        <button
                            onClick={() => setShowModal(true)}
                            className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
                        >
                            첫 배포 만들기
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map(dist => {
                            const platform = PLATFORMS.find(p => p.id === dist.platform);
                            const Icon = platform?.icon || Send;
                            return (
                                <div key={dist.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className={`p-2.5 rounded-xl ${platform?.bg || 'bg-gray-50'}`}>
                                            <Icon size={20} className={platform?.color || 'text-gray-400'} />
                                        </div>
                                        <StatusBadge status={dist.status} />
                                    </div>
                                    <h3 className="text-sm font-bold text-primary mb-1 line-clamp-2">{dist.contentTitle}</h3>
                                    <div className="flex items-center gap-1 mb-3">
                                        <PlatformIcon platformId={dist.platform} />
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                        {dist.status === '예약됨' ? <Clock size={12} /> : <CheckCircle2 size={12} />}
                                        {dist.status === '예약됨' ? '예약: ' : '발행: '}{dist.date}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

            {showModal && (
                <PublishModal
                    onClose={() => setShowModal(false)}
                    onSave={handleSave}
                    content={content}
                />
            )}
        </div>
    );
};

export default DistributionPage;
