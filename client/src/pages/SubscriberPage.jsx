import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Users, UserPlus, Bell, Search, Edit2, Trash2, Loader2,
    ChevronLeft, ChevronRight, Plus, X, Check, Tag, ChevronDown, ChevronUp
} from 'lucide-react';

const ITEMS_PER_PAGE = 10;

const StatCard = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
        <div className={`p-3 rounded-xl ${color}`}>
            <Icon size={20} className="text-white" />
        </div>
        <div>
            <div className="text-2xl font-black text-primary">{value}</div>
            <div className="text-xs text-gray-400 font-medium">{title}</div>
        </div>
    </div>
);

const GroupModal = ({ onClose, onSave, subscribers }) => {
    const [groupName, setGroupName] = useState('');
    const [selected, setSelected] = useState([]);

    const toggle = (id) => setSelected(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

    const handleSave = () => {
        if (!groupName.trim()) return;
        onSave({ name: groupName, memberIds: selected });
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-primary">그룹 만들기</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X size={18} className="text-gray-400" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1.5">그룹 이름</label>
                        <input
                            type="text"
                            value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                            placeholder="그룹 이름을 입력하세요"
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-primary transition-colors"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                            구독자 선택 ({selected.length}명 선택됨)
                        </label>
                        <div className="border border-gray-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-50">
                            {subscribers.length === 0 ? (
                                <div className="p-4 text-center text-sm text-gray-400">구독자가 없습니다</div>
                            ) : subscribers.map(sub => (
                                <label key={sub.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(sub.id)}
                                        onChange={() => toggle(sub.id)}
                                        className="accent-primary"
                                    />
                                    <span className="text-sm text-primary font-medium">{sub.name}</span>
                                    <span className="text-xs text-gray-400">{sub.email}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                        취소
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!groupName.trim()}
                        className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-40"
                    >
                        그룹 저장
                    </button>
                </div>
            </div>
        </div>
    );
};

const EditModal = ({ subscriber, onClose, onSave }) => {
    const [form, setForm] = useState({
        name: subscriber.name || '',
        email: subscriber.email || '',
        phone: subscriber.phone || '',
        kakaoId: subscriber.kakaoId || '',
        notificationConsent: subscriber.notificationConsent ?? true,
    });

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-primary">구독자 수정</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X size={18} className="text-gray-400" />
                    </button>
                </div>
                <div className="p-6 space-y-3">
                    {[
                        { label: '이름', key: 'name', type: 'text' },
                        { label: '이메일', key: 'email', type: 'email' },
                        { label: '전화번호', key: 'phone', type: 'text' },
                        { label: '카카오톡 ID', key: 'kakaoId', type: 'text' },
                    ].map(({ label, key, type }) => (
                        <div key={key}>
                            <label className="text-xs font-semibold text-gray-500 block mb-1">{label}</label>
                            <input
                                type={type}
                                value={form[key]}
                                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-primary transition-colors"
                            />
                        </div>
                    ))}
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.notificationConsent}
                            onChange={e => setForm(f => ({ ...f, notificationConsent: e.target.checked }))}
                            className="accent-primary"
                        />
                        <span className="text-sm text-gray-700 font-medium">알림 수신 동의</span>
                    </label>
                </div>
                <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                        취소
                    </button>
                    <button
                        onClick={() => onSave({ ...subscriber, ...form })}
                        className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
                    >
                        저장
                    </button>
                </div>
            </div>
        </div>
    );
};

const MOCK_SUBSCRIBERS = [
    { id: 1, name: '김민준', email: 'minjun@example.com', phone: '010-1234-5678', kakaoId: 'minjun_k', joinDate: '2025-01-15', notificationConsent: true },
    { id: 2, name: '이서연', email: 'seoyeon@example.com', phone: '010-2345-6789', kakaoId: 'seoyeon_l', joinDate: '2025-02-03', notificationConsent: true },
    { id: 3, name: '박지훈', email: 'jihoon@example.com', phone: '010-3456-7890', kakaoId: '', joinDate: '2025-02-20', notificationConsent: false },
    { id: 4, name: '최수아', email: 'sua@example.com', phone: '010-4567-8901', kakaoId: 'sua_c', joinDate: '2025-03-01', notificationConsent: true },
    { id: 5, name: '정도윤', email: 'doyoon@example.com', phone: '010-5678-9012', kakaoId: 'doyoon_j', joinDate: '2025-03-10', notificationConsent: true },
    { id: 6, name: '한예린', email: 'yerin@example.com', phone: '010-6789-0123', kakaoId: '', joinDate: '2025-03-15', notificationConsent: false },
    { id: 7, name: '오민서', email: 'minseo@example.com', phone: '010-7890-1234', kakaoId: 'minseo_o', joinDate: '2025-04-02', notificationConsent: true },
    { id: 8, name: '윤지우', email: 'jiwoo@example.com', phone: '010-8901-2345', kakaoId: 'jiwoo_y', joinDate: '2025-04-18', notificationConsent: true },
    { id: 9, name: '임채원', email: 'chaewon@example.com', phone: '010-9012-3456', kakaoId: 'chaewon_i', joinDate: '2025-05-05', notificationConsent: true },
    { id: 10, name: '강태양', email: 'taeyang@example.com', phone: '010-0123-4567', kakaoId: '', joinDate: '2025-05-20', notificationConsent: false },
    { id: 11, name: '신하은', email: 'haeun@example.com', phone: '010-1111-2222', kakaoId: 'haeun_s', joinDate: '2025-06-01', notificationConsent: true },
    { id: 12, name: '배주원', email: 'juwon@example.com', phone: '010-3333-4444', kakaoId: 'juwon_b', joinDate: '2025-06-15', notificationConsent: true },
];

const MOCK_GROUPS = [
    { id: 1, name: 'VIP 구독자', memberIds: [1, 2, 4, 5] },
    { id: 2, name: '신규 가입자', memberIds: [11, 12] },
];

const SubscriberPage = () => {
    const [subscribers, setSubscribers] = useState(MOCK_SUBSCRIBERS);
    const [groups, setGroups] = useState(MOCK_GROUPS);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [activeGroup, setActiveGroup] = useState(null);
    const [sortAsc, setSortAsc] = useState(false);
    const [page, setPage] = useState(1);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [editTarget, setEditTarget] = useState(null);

    useEffect(() => {
        setLoading(true);
        axios.get('/api/subscribers')
            .then(r => setSubscribers(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
        axios.get('/api/subscribers/groups')
            .then(r => setGroups(r.data))
            .catch(() => {});
    }, []);

    const filtered = subscribers
        .filter(s => {
            const q = search.toLowerCase();
            const matchSearch = !q || s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.phone?.includes(q);
            const matchGroup = !activeGroup || groups.find(g => g.id === activeGroup)?.memberIds.includes(s.id);
            return matchSearch && matchGroup;
        })
        .sort((a, b) => {
            const da = new Date(a.joinDate), db = new Date(b.joinDate);
            return sortAsc ? da - db : db - da;
        });

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    const handleDelete = async (id) => {
        if (!window.confirm('이 구독자를 삭제하시겠습니까?')) return;
        try { await axios.delete(`/api/subscribers/${id}`); } catch {}
        setSubscribers(prev => prev.filter(s => s.id !== id));
    };

    const handleSaveEdit = async (updated) => {
        try { await axios.put(`/api/subscribers/${updated.id}`, updated); } catch {}
        setSubscribers(prev => prev.map(s => s.id === updated.id ? updated : s));
        setEditTarget(null);
    };

    const handleCreateGroup = async (data) => {
        try {
            const res = await axios.post('/api/subscribers/groups', data);
            setGroups(prev => [...prev, res.data]);
        } catch {
            setGroups(prev => [...prev, { id: Date.now(), ...data }]);
        }
        setShowGroupModal(false);
    };

    const thisMonth = new Date();
    const newThisMonth = subscribers.filter(s => {
        const d = new Date(s.joinDate);
        return d.getMonth() === thisMonth.getMonth() && d.getFullYear() === thisMonth.getFullYear();
    }).length;
    const consentCount = subscribers.filter(s => s.notificationConsent).length;

    return (
        <div>
                <div className="mb-8">
                    <h1 className="text-3xl font-black text-primary tracking-tight">구독자 관리</h1>
                    <p className="text-gray-500 mt-1">구독자를 조회하고 그룹으로 관리하세요.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <StatCard title="총 구독자" value={subscribers.length} icon={Users} color="bg-primary" />
                    <StatCard title="이번 달 신규" value={newThisMonth} icon={UserPlus} color="bg-blue-500" />
                    <StatCard title="알림 수신 동의" value={consentCount} icon={Bell} color="bg-green-500" />
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center justify-between">
                    <div className="flex flex-wrap gap-2 items-center">
                        <button
                            onClick={() => { setActiveGroup(null); setPage(1); }}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${!activeGroup ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                        >
                            전체
                        </button>
                        {groups.map(g => (
                            <button
                                key={g.id}
                                onClick={() => { setActiveGroup(g.id); setPage(1); }}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border flex items-center gap-1 ${activeGroup === g.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
                            >
                                <Tag size={11} />
                                {g.name}
                            </button>
                        ))}
                        <button
                            onClick={() => setShowGroupModal(true)}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-gray-300 text-gray-400 hover:border-primary hover:text-primary transition-colors flex items-center gap-1"
                        >
                            <Plus size={11} />
                            그룹 만들기
                        </button>
                    </div>
                    <div className="flex items-center bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 w-full sm:w-72">
                        <Search size={16} className="text-gray-400 mr-2 shrink-0" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            placeholder="이름/이메일/전화번호로 검색"
                            className="bg-transparent border-none outline-none text-sm w-full"
                        />
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    <th className="px-5 py-3 text-left font-semibold text-gray-500">이름</th>
                                    <th className="px-5 py-3 text-left font-semibold text-gray-500">이메일</th>
                                    <th className="px-5 py-3 text-left font-semibold text-gray-500 hidden md:table-cell">전화번호</th>
                                    <th className="px-5 py-3 text-left font-semibold text-gray-500 hidden lg:table-cell">카카오톡 ID</th>
                                    <th
                                        className="px-5 py-3 text-left font-semibold text-gray-500 cursor-pointer select-none"
                                        onClick={() => { setSortAsc(p => !p); setPage(1); }}
                                    >
                                        <div className="flex items-center gap-1">
                                            가입일
                                            {sortAsc ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                        </div>
                                    </th>
                                    <th className="px-5 py-3 text-left font-semibold text-gray-500">알림동의</th>
                                    <th className="px-5 py-3 text-right font-semibold text-gray-500">액션</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="py-20 text-center text-gray-400">
                                            <Loader2 className="animate-spin mx-auto mb-2" size={28} />
                                            <span className="text-sm">불러오는 중...</span>
                                        </td>
                                    </tr>
                                ) : paginated.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-20 text-center text-gray-400">
                                            <Users size={36} className="mx-auto mb-2 opacity-30" />
                                            <p className="text-sm">구독자가 없습니다.</p>
                                        </td>
                                    </tr>
                                ) : paginated.map(sub => (
                                    <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-5 py-3 font-semibold text-primary">{sub.name}</td>
                                        <td className="px-5 py-3 text-gray-500">{sub.email}</td>
                                        <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{sub.phone || '-'}</td>
                                        <td className="px-5 py-3 text-gray-500 hidden lg:table-cell">{sub.kakaoId || '-'}</td>
                                        <td className="px-5 py-3 text-gray-500">{sub.joinDate}</td>
                                        <td className="px-5 py-3">
                                            {sub.notificationConsent
                                                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-xs font-semibold"><Check size={11} />동의</span>
                                                : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 text-xs font-semibold"><X size={11} />미동의</span>
                                            }
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setEditTarget(sub)}
                                                    className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(sub.id)}
                                                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-sm text-gray-400">
                                총 {filtered.length}명 중 {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)}명
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-primary hover:border-primary transition-colors disabled:opacity-30"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                                    <button
                                        key={n}
                                        onClick={() => setPage(n)}
                                        className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${n === page ? 'bg-primary text-white' : 'text-gray-400 hover:text-primary hover:bg-gray-50'}`}
                                    >
                                        {n}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-primary hover:border-primary transition-colors disabled:opacity-30"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

            {showGroupModal && (
                <GroupModal
                    onClose={() => setShowGroupModal(false)}
                    onSave={handleCreateGroup}
                    subscribers={subscribers}
                />
            )}
            {editTarget && (
                <EditModal
                    subscriber={editTarget}
                    onClose={() => setEditTarget(null)}
                    onSave={handleSaveEdit}
                />
            )}
        </div>
    );
};

export default SubscriberPage;
