import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Bell, Mail, MessageSquare, Smartphone, Send, Users,
    Plus, X, Loader2, CheckCircle2, Eye, Link, ChevronDown, ChevronUp
} from 'lucide-react';

const CHANNELS = [
    { id: 'email', label: '이메일(뉴스레터)', icon: Mail, color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'kakao', label: '카카오톡 알림톡', icon: MessageSquare, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { id: 'sms', label: 'SMS', icon: Smartphone, color: 'text-purple-500', bg: 'bg-purple-50' },
];

const MOCK_GROUPS = [
    { id: 0, name: '전체 구독자', count: 42 },
    { id: 1, name: 'VIP 구독자', count: 12 },
    { id: 2, name: '신규 가입자', count: 8 },
];

const MOCK_CONTENT = [
    { id: 1, title: '2025 여름 여행지 추천 TOP 10' },
    { id: 2, title: '초보자를 위한 영상 편집 가이드' },
];

const MOCK_HISTORY = [
    { id: 1, title: '6월 뉴스레터', sentAt: '2025-06-01 09:00', channels: ['email'], targetCount: 42, successCount: 40, failCount: 2, openRate: 62, clickRate: 18 },
    { id: 2, title: '신규 영상 업로드 알림', sentAt: '2025-06-10 15:00', channels: ['kakao', 'sms'], targetCount: 30, successCount: 29, failCount: 1, openRate: 88, clickRate: 34 },
    { id: 3, title: '이벤트 안내', sentAt: '2025-06-15 11:00', channels: ['email', 'kakao'], targetCount: 42, successCount: 42, failCount: 0, openRate: 71, clickRate: 22 },
];

const ConfirmModal = ({ count, channels, onConfirm, onClose, sending }) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="p-6 text-center">
                <div className="w-14 h-14 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Send size={24} className="text-primary" />
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">알림을 발송하시겠습니까?</h3>
                <p className="text-sm text-gray-500 mb-1">
                    <span className="font-bold text-primary">{count}명</span>에게 발송됩니다.
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                    {channels.map(ch => {
                        const cfg = CHANNELS.find(c => c.id === ch);
                        if (!cfg) return null;
                        const Icon = cfg.icon;
                        return (
                            <span key={ch} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                                <Icon size={11} />
                                {cfg.label}
                            </span>
                        );
                    })}
                </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                    취소
                </button>
                <button
                    onClick={onConfirm}
                    disabled={sending}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {sending && <Loader2 size={14} className="animate-spin" />}
                    발송하기
                </button>
            </div>
        </div>
    </div>
);

const StatsRow = ({ label, value, max, color }) => (
    <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 w-14 shrink-0">{label}</span>
        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
            <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
        </div>
        <span className="text-xs font-semibold text-primary w-10 text-right">{value}%</span>
    </div>
);

const HistoryRow = ({ item, onExpand, expanded }) => (
    <>
        <tr
            className="hover:bg-gray-50 transition-colors cursor-pointer"
            onClick={() => onExpand(item.id)}
        >
            <td className="px-5 py-3 font-semibold text-primary text-sm">{item.title}</td>
            <td className="px-5 py-3 text-gray-500 text-sm hidden sm:table-cell">{item.sentAt}</td>
            <td className="px-5 py-3 hidden md:table-cell">
                <div className="flex flex-wrap gap-1">
                    {item.channels.map(ch => {
                        const cfg = CHANNELS.find(c => c.id === ch);
                        if (!cfg) return null;
                        const Icon = cfg.icon;
                        return (
                            <span key={ch} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                                <Icon size={10} />
                                {cfg.label}
                            </span>
                        );
                    })}
                </div>
            </td>
            <td className="px-5 py-3 text-sm text-gray-600 text-center">{item.targetCount}명</td>
            <td className="px-5 py-3 text-center">
                <span className="text-xs font-semibold text-green-600">{item.successCount}성공</span>
                {item.failCount > 0 && <span className="text-xs font-semibold text-red-500 ml-1">{item.failCount}실패</span>}
            </td>
            <td className="px-5 py-3 text-center">
                <button className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
                    {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </button>
            </td>
        </tr>
        {expanded && (
            <tr className="bg-gray-50">
                <td colSpan={6} className="px-5 py-4">
                    <div className="space-y-2 max-w-xs">
                        <StatsRow label="오픈율" value={item.openRate} color="bg-blue-400" />
                        <StatsRow label="클릭률" value={item.clickRate} color="bg-purple-400" />
                    </div>
                </td>
            </tr>
        )}
    </>
);

const NotificationPage = () => {
    const [groups, setGroups] = useState(MOCK_GROUPS);
    const [content, setContent] = useState(MOCK_CONTENT);
    const [history, setHistory] = useState(MOCK_HISTORY);
    const [showCompose, setShowCompose] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [sending, setSending] = useState(false);
    const [expandedRow, setExpandedRow] = useState(null);
    const [showPreview, setShowPreview] = useState(false);

    const [targetGroup, setTargetGroup] = useState(0);
    const [selectedChannels, setSelectedChannels] = useState([]);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [attachedContent, setAttachedContent] = useState('');

    useEffect(() => {
        axios.get('/api/subscribers/groups').then(r => setGroups([MOCK_GROUPS[0], ...r.data])).catch(() => {});
        axios.get('/api/content').then(r => setContent(r.data)).catch(() => {});
        axios.get('/api/notifications').then(r => setHistory(r.data)).catch(() => {});
    }, []);

    const toggleChannel = (id) => setSelectedChannels(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

    const selectedGroup = groups.find(g => g.id === Number(targetGroup)) || groups[0];
    const recipientCount = selectedGroup?.count || 0;

    const handleSend = async () => {
        setSending(true);
        try {
            await axios.post('/api/notifications/send', {
                groupId: targetGroup,
                channels: selectedChannels,
                subject,
                body,
                contentId: attachedContent || null,
            });
        } catch {}
        setSending(false);
        setShowConfirm(false);
        setShowCompose(false);
        setSubject('');
        setBody('');
        setSelectedChannels([]);
        setAttachedContent('');
        const newItem = {
            id: Date.now(),
            title: subject,
            sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
            channels: selectedChannels,
            targetCount: recipientCount,
            successCount: recipientCount,
            failCount: 0,
            openRate: 0,
            clickRate: 0,
        };
        setHistory(prev => [newItem, ...prev]);
    };

    const canSend = subject.trim() && body.trim() && selectedChannels.length > 0;

    return (
        <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-primary tracking-tight">알림 발송</h1>
                        <p className="text-gray-500 mt-1">구독자에게 알림을 발송하고 성과를 확인하세요.</p>
                    </div>
                    <button
                        onClick={() => setShowCompose(p => !p)}
                        className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition-colors self-start sm:self-auto"
                    >
                        <Plus size={18} />
                        새 알림 보내기
                    </button>
                </div>

                {/* Compose Section */}
                {showCompose && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-8 overflow-hidden">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="font-bold text-primary">알림 작성</h2>
                            <button onClick={() => setShowCompose(false)} className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors">
                                <X size={16} className="text-gray-400" />
                            </button>
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Step 1: Target */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">1</span>
                                    <span className="text-sm font-bold text-primary">발송 대상 선택</span>
                                </div>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {groups.map(g => (
                                        <button
                                            key={g.id}
                                            onClick={() => setTargetGroup(g.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${Number(targetGroup) === g.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                                        >
                                            {g.name} ({g.count}명)
                                        </button>
                                    ))}
                                </div>
                                {recipientCount > 0 && (
                                    <p className="text-sm text-gray-500 flex items-center gap-1.5">
                                        <Users size={14} className="text-primary" />
                                        <span className="font-bold text-primary">{recipientCount}명</span>에게 발송됩니다.
                                    </p>
                                )}
                            </div>

                            {/* Step 2: Channels */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">2</span>
                                    <span className="text-sm font-bold text-primary">발송 채널 선택</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {CHANNELS.map(ch => {
                                        const Icon = ch.icon;
                                        const active = selectedChannels.includes(ch.id);
                                        return (
                                            <button
                                                key={ch.id}
                                                onClick={() => toggleChannel(ch.id)}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${active ? 'border-primary bg-primary text-white' : `border-gray-200 ${ch.color} hover:border-gray-400`}`}
                                            >
                                                <Icon size={16} />
                                                {ch.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Step 3: Message */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">3</span>
                                    <span className="text-sm font-bold text-primary">메시지 작성</span>
                                </div>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={subject}
                                        onChange={e => setSubject(e.target.value)}
                                        placeholder="제목을 입력하세요"
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-primary transition-colors"
                                    />
                                    <textarea
                                        value={body}
                                        onChange={e => setBody(e.target.value)}
                                        placeholder="메시지 내용을 입력하세요"
                                        rows={4}
                                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-primary transition-colors resize-none"
                                    />
                                    <div className="flex items-center gap-2">
                                        <Link size={14} className="text-gray-400 shrink-0" />
                                        <select
                                            value={attachedContent}
                                            onChange={e => setAttachedContent(e.target.value)}
                                            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-primary transition-colors bg-white text-gray-600"
                                        >
                                            <option value="">콘텐츠 링크 첨부 (선택)</option>
                                            {content.map(c => (
                                                <option key={c.id} value={c.id}>{c.title}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Preview Toggle */}
                                    <button
                                        onClick={() => setShowPreview(p => !p)}
                                        className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-primary transition-colors"
                                    >
                                        <Eye size={13} />
                                        {showPreview ? '미리보기 닫기' : '미리보기'}
                                    </button>
                                    {showPreview && subject && (
                                        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                                            <div className="text-xs font-bold text-gray-400 mb-1">제목</div>
                                            <div className="text-sm font-bold text-primary mb-3">{subject}</div>
                                            <div className="text-xs font-bold text-gray-400 mb-1">내용</div>
                                            <div className="text-sm text-gray-700 whitespace-pre-wrap">{body || '내용 없음'}</div>
                                            {attachedContent && (
                                                <div className="mt-3 text-xs text-blue-500 flex items-center gap-1">
                                                    <Link size={11} />
                                                    {content.find(c => c.id === Number(attachedContent))?.title}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <button
                                    onClick={() => setShowConfirm(true)}
                                    disabled={!canSend}
                                    className="px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors disabled:opacity-40 flex items-center gap-2"
                                >
                                    <Send size={16} />
                                    발송하기
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* History */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                        <h2 className="text-lg font-bold text-primary">발송 내역</h2>
                    </div>
                    {history.length === 0 ? (
                        <div className="py-20 flex flex-col items-center text-gray-400">
                            <Bell size={36} className="mb-3 opacity-30" />
                            <p className="text-sm">발송 내역이 없습니다.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50">
                                        <th className="px-5 py-3 text-left font-semibold text-gray-500">제목</th>
                                        <th className="px-5 py-3 text-left font-semibold text-gray-500 hidden sm:table-cell">발송일</th>
                                        <th className="px-5 py-3 text-left font-semibold text-gray-500 hidden md:table-cell">채널</th>
                                        <th className="px-5 py-3 text-center font-semibold text-gray-500">대상 수</th>
                                        <th className="px-5 py-3 text-center font-semibold text-gray-500">성공/실패</th>
                                        <th className="px-5 py-3 text-center font-semibold text-gray-500">상세</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {history.map(item => (
                                        <HistoryRow
                                            key={item.id}
                                            item={item}
                                            expanded={expandedRow === item.id}
                                            onExpand={id => setExpandedRow(prev => prev === id ? null : id)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            {showConfirm && (
                <ConfirmModal
                    count={recipientCount}
                    channels={selectedChannels}
                    onConfirm={handleSend}
                    onClose={() => setShowConfirm(false)}
                    sending={sending}
                />
            )}
        </div>
    );
};

export default NotificationPage;
