import { useState, useEffect } from 'react';
import {
    User, Bell, Shield, Save, Download, Trash2, ExternalLink,
    CheckCircle2, Loader2, AlertTriangle, X
} from 'lucide-react';

const STORAGE_KEY = 'daval_settings';

const defaultSettings = {
    displayName: '',
    email: '',
    bio: '',
    notif_email: true,
    notif_deploy: true,
    notif_newSub: false,
    notif_weekly: true,
};

const Toggle = ({ checked, onChange }) => (
    <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-primary' : 'bg-gray-200'}`}
    >
        <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
    </button>
);

const SectionCard = ({ title, icon: Icon, children }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gray-50">
                <Icon size={18} className="text-gray-600" />
            </div>
            <h2 className="text-base font-bold text-primary">{title}</h2>
        </div>
        <div className="p-6">{children}</div>
    </div>
);

const DeleteModal = ({ onConfirm, onClose }) => {
    const [input, setInput] = useState('');
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-red-600">계정 삭제</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X size={18} className="text-gray-400" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="bg-red-50 rounded-xl p-4 flex gap-3">
                        <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700">
                            계정을 삭제하면 모든 데이터가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                        </p>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                            확인을 위해 <span className="text-red-500 font-bold">삭제</span>를 입력하세요
                        </label>
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="삭제"
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-red-400 transition-colors"
                        />
                    </div>
                </div>
                <div className="p-6 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                        취소
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={input !== '삭제'}
                        className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-40"
                    >
                        계정 삭제
                    </button>
                </div>
            </div>
        </div>
    );
};

const SettingsPage = () => {
    const [settings, setSettings] = useState(defaultSettings);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setSettings(prev => ({ ...prev, ...JSON.parse(stored) }));
            }
        } catch {}
    }, []);

    const set = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setSaved(false);
    };

    const handleSave = async () => {
        setSaving(true);
        await new Promise(r => setTimeout(r, 600));
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {}
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const handleExport = () => {
        const data = JSON.stringify(settings, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'daval_data_export.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleDeleteAccount = () => {
        localStorage.removeItem(STORAGE_KEY);
        setShowDeleteModal(false);
        window.location.href = '/auth';
    };

    return (
        <div>
                <div className="mb-8">
                    <h1 className="text-3xl font-black text-primary tracking-tight">설정</h1>
                    <p className="text-gray-500 mt-1">계정 정보와 알림 설정을 관리하세요.</p>
                </div>

                <div className="space-y-6">
                    {/* Profile */}
                    <SectionCard title="프로필 설정" icon={User}>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-500 block mb-1.5">표시 이름</label>
                                <input
                                    type="text"
                                    value={settings.displayName}
                                    onChange={e => set('displayName', e.target.value)}
                                    placeholder="표시 이름을 입력하세요"
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-primary transition-colors"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-500 block mb-1.5">이메일</label>
                                <input
                                    type="email"
                                    value={settings.email}
                                    readOnly
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-100 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
                                />
                                <p className="text-xs text-gray-400 mt-1">이메일은 변경할 수 없습니다.</p>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-500 block mb-1.5">소개</label>
                                <textarea
                                    value={settings.bio}
                                    onChange={e => set('bio', e.target.value)}
                                    placeholder="자신을 소개해 주세요"
                                    rows={3}
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-primary transition-colors resize-none"
                                />
                            </div>
                            <div className="flex justify-end">
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {saving ? (
                                        <Loader2 size={15} className="animate-spin" />
                                    ) : saved ? (
                                        <CheckCircle2 size={15} />
                                    ) : (
                                        <Save size={15} />
                                    )}
                                    {saving ? '저장 중...' : saved ? '저장됨' : '저장'}
                                </button>
                            </div>
                        </div>
                    </SectionCard>

                    {/* Notifications */}
                    <SectionCard title="알림 설정" icon={Bell}>
                        <div className="space-y-4">
                            {[
                                { key: 'notif_email', label: '이메일 알림 수신', desc: '주요 업데이트를 이메일로 받습니다.' },
                                { key: 'notif_deploy', label: '배포 완료 알림', desc: '콘텐츠 배포가 완료되면 알림을 받습니다.' },
                                { key: 'notif_newSub', label: '새 구독자 알림', desc: '새로운 구독자가 생기면 알림을 받습니다.' },
                                { key: 'notif_weekly', label: '주간 리포트 수신', desc: '매주 월요일 주간 성과 리포트를 받습니다.' },
                            ].map(({ key, label, desc }) => (
                                <div key={key} className="flex items-center justify-between gap-4 py-2">
                                    <div>
                                        <div className="text-sm font-semibold text-primary">{label}</div>
                                        <div className="text-xs text-gray-400">{desc}</div>
                                    </div>
                                    <Toggle
                                        checked={settings[key]}
                                        onChange={val => set(key, val)}
                                    />
                                </div>
                            ))}
                            <div className="pt-2 flex justify-end">
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                                    저장
                                </button>
                            </div>
                        </div>
                    </SectionCard>

                    {/* Privacy */}
                    <SectionCard title="개인정보 보호" icon={Shield}>
                        <div className="space-y-3">
                            <button
                                onClick={handleExport}
                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <Download size={18} className="text-gray-400 group-hover:text-primary transition-colors" />
                                    <div className="text-left">
                                        <div className="text-sm font-semibold text-primary">데이터 내보내기</div>
                                        <div className="text-xs text-gray-400">내 데이터를 JSON 파일로 다운로드합니다.</div>
                                    </div>
                                </div>
                                <ExternalLink size={14} className="text-gray-300" />
                            </button>

                            <a
                                href="#privacy"
                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <Shield size={18} className="text-gray-400 group-hover:text-primary transition-colors" />
                                    <div className="text-left">
                                        <div className="text-sm font-semibold text-primary">개인정보 처리방침</div>
                                        <div className="text-xs text-gray-400">개인정보 처리방침을 확인하세요.</div>
                                    </div>
                                </div>
                                <ExternalLink size={14} className="text-gray-300" />
                            </a>

                            <div className="pt-2 border-t border-gray-100">
                                <button
                                    onClick={() => setShowDeleteModal(true)}
                                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-red-100 hover:bg-red-50 transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Trash2 size={18} className="text-red-400" />
                                        <div className="text-left">
                                            <div className="text-sm font-semibold text-red-500">계정 삭제</div>
                                            <div className="text-xs text-red-300">모든 데이터가 영구 삭제됩니다.</div>
                                        </div>
                                    </div>
                                    <ExternalLink size={14} className="text-red-200" />
                                </button>
                            </div>
                        </div>
                    </SectionCard>
                </div>

            {showDeleteModal && (
                <DeleteModal
                    onConfirm={handleDeleteAccount}
                    onClose={() => setShowDeleteModal(false)}
                />
            )}
        </div>
    );
};

export default SettingsPage;
