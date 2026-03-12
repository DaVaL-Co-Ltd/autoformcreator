import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Youtube, Instagram, BookOpen, Link2, Unlink,
    RefreshCw, Loader2, Users, FileText, TrendingUp, AlertCircle
} from 'lucide-react';

const PLATFORM_CONFIGS = [
    {
        id: 'youtube',
        label: '유튜브',
        icon: Youtube,
        color: 'text-red-500',
        bg: 'bg-red-50',
        border: 'border-red-100',
        description: '유튜브 채널을 연결하면 영상을 자동으로 업로드하고 통계를 확인할 수 있습니다.',
        statsLabel: ['구독자', '동영상'],
    },
    {
        id: 'instagram',
        label: '인스타그램',
        icon: Instagram,
        color: 'text-pink-500',
        bg: 'bg-pink-50',
        border: 'border-pink-100',
        description: '인스타그램 계정을 연결하면 릴스와 이미지 게시물을 예약 발행할 수 있습니다.',
        statsLabel: ['팔로워', '게시물'],
    },
    {
        id: 'naver',
        label: '네이버 블로그',
        icon: BookOpen,
        color: 'text-green-600',
        bg: 'bg-green-50',
        border: 'border-green-100',
        description: '네이버 블로그를 연결하면 글을 자동으로 발행하고 방문자 통계를 확인할 수 있습니다.',
        statsLabel: ['이웃', '포스팅'],
    },
];

const MOCK_PLATFORMS = [
    {
        id: 1,
        type: 'youtube',
        connected: true,
        accountName: '@creator_channel',
        stats: { followers: 12400, posts: 87 },
    },
    {
        id: 2,
        type: 'instagram',
        connected: false,
    },
    {
        id: 3,
        type: 'naver',
        connected: true,
        accountName: '크리에이터_블로그',
        stats: { followers: 3200, posts: 145 },
    },
];

const formatNumber = (n) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
};

const DisconnectModal = ({ platformLabel, onConfirm, onClose, loading }) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="p-6 text-center">
                <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Unlink size={24} className="text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">연결을 해제하시겠습니까?</h3>
                <p className="text-sm text-gray-500">
                    <span className="font-bold text-primary">{platformLabel}</span> 연결을 해제하면 자동 발행 기능이 중단됩니다.
                </p>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
                <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                    취소
                </button>
                <button
                    onClick={onConfirm}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    연결 해제
                </button>
            </div>
        </div>
    </div>
);

const PlatformCard = ({ config, platform, onConnect, onDisconnect, onReauth, connecting, disconnecting }) => {
    const Icon = config.icon;
    const connected = platform?.connected;

    return (
        <div className={`bg-white rounded-2xl border shadow-sm p-6 flex flex-col gap-4 hover:shadow-md transition-shadow ${connected ? config.border : 'border-gray-100'}`}>
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className={`p-3 rounded-2xl ${config.bg}`}>
                    <Icon size={28} className={config.color} />
                </div>
                {connected ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-600 text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        연결됨
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-400 text-xs font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                        미연결
                    </span>
                )}
            </div>

            {/* Platform name */}
            <div>
                <h3 className="text-lg font-bold text-primary">{config.label}</h3>
                {connected && platform.accountName && (
                    <p className="text-sm text-gray-400 mt-0.5">{platform.accountName}</p>
                )}
            </div>

            {/* Stats or description */}
            {connected && platform.stats ? (
                <div className="grid grid-cols-2 gap-3">
                    <div className={`p-3 rounded-xl ${config.bg} text-center`}>
                        <div className="flex items-center justify-center gap-1 mb-1">
                            <Users size={13} className={config.color} />
                            <span className="text-xs text-gray-500">{config.statsLabel[0]}</span>
                        </div>
                        <div className={`text-xl font-black ${config.color}`}>{formatNumber(platform.stats.followers)}</div>
                    </div>
                    <div className={`p-3 rounded-xl ${config.bg} text-center`}>
                        <div className="flex items-center justify-center gap-1 mb-1">
                            <FileText size={13} className={config.color} />
                            <span className="text-xs text-gray-500">{config.statsLabel[1]}</span>
                        </div>
                        <div className={`text-xl font-black ${config.color}`}>{formatNumber(platform.stats.posts)}</div>
                    </div>
                </div>
            ) : !connected ? (
                <p className="text-sm text-gray-400 leading-relaxed flex-1">{config.description}</p>
            ) : null}

            {/* Actions */}
            <div className="flex flex-col gap-2 mt-auto">
                {connected ? (
                    <>
                        <button
                            onClick={onReauth}
                            className="w-full py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                        >
                            <RefreshCw size={14} />
                            재인증
                        </button>
                        <button
                            onClick={onDisconnect}
                            disabled={disconnecting}
                            className="w-full py-2 rounded-xl border border-red-200 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {disconnecting ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
                            연결 해제
                        </button>
                    </>
                ) : (
                    <button
                        onClick={onConnect}
                        disabled={connecting}
                        className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {connecting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                        연결하기
                    </button>
                )}
            </div>
        </div>
    );
};

const PlatformPage = () => {
    const [platforms, setPlatforms] = useState(MOCK_PLATFORMS);
    const [loading, setLoading] = useState(false);
    const [connectingId, setConnectingId] = useState(null);
    const [disconnectTarget, setDisconnectTarget] = useState(null);
    const [disconnecting, setDisconnecting] = useState(false);

    useEffect(() => {
        setLoading(true);
        axios.get('/api/platforms')
            .then(r => setPlatforms(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const handleConnect = async (type) => {
        setConnectingId(type);
        try {
            const res = await axios.post('/api/platforms/connect', { type });
            setPlatforms(prev => prev.map(p => p.type === type ? { ...p, ...res.data, connected: true } : p));
        } catch {
            setPlatforms(prev => prev.map(p => p.type === type
                ? { ...p, connected: true, accountName: `@${type}_account`, stats: { followers: 0, posts: 0 } }
                : p
            ));
        }
        setConnectingId(null);
    };

    const handleDisconnect = async () => {
        if (!disconnectTarget) return;
        setDisconnecting(true);
        try {
            await axios.delete(`/api/platforms/${disconnectTarget.id}`);
        } catch {}
        setPlatforms(prev => prev.map(p => p.id === disconnectTarget.id ? { ...p, connected: false, accountName: undefined, stats: undefined } : p));
        setDisconnecting(false);
        setDisconnectTarget(null);
    };

    const handleReauth = async (type) => {
        setConnectingId(type);
        try {
            await axios.post('/api/platforms/connect', { type });
        } catch {}
        setConnectingId(null);
    };

    const connectedCount = platforms.filter(p => p.connected).length;

    return (
        <div>
                <div className="mb-8">
                    <h1 className="text-3xl font-black text-primary tracking-tight">플랫폼 연동</h1>
                    <p className="text-gray-500 mt-1">외부 플랫폼 계정을 연결하고 관리하세요.</p>
                </div>

                {/* Summary banner */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-8 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-primary">
                        <TrendingUp size={20} className="text-white" />
                    </div>
                    <div className="flex-1">
                        <div className="text-sm font-bold text-primary">
                            {connectedCount}개 플랫폼 연결됨
                        </div>
                        <div className="text-xs text-gray-400">
                            총 {PLATFORM_CONFIGS.length}개 중 {connectedCount}개 활성화
                        </div>
                    </div>
                    {connectedCount < PLATFORM_CONFIGS.length && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full">
                            <AlertCircle size={12} />
                            {PLATFORM_CONFIGS.length - connectedCount}개 미연결
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="animate-spin text-gray-400" size={36} />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {PLATFORM_CONFIGS.map(config => {
                            const platform = platforms.find(p => p.type === config.id);
                            return (
                                <PlatformCard
                                    key={config.id}
                                    config={config}
                                    platform={platform}
                                    connecting={connectingId === config.id}
                                    disconnecting={disconnectTarget?.type === config.id && disconnecting}
                                    onConnect={() => handleConnect(config.id)}
                                    onDisconnect={() => setDisconnectTarget(platform)}
                                    onReauth={() => handleReauth(config.id)}
                                />
                            );
                        })}
                    </div>
                )}

            {disconnectTarget && (
                <DisconnectModal
                    platformLabel={PLATFORM_CONFIGS.find(c => c.id === disconnectTarget.type)?.label || ''}
                    onConfirm={handleDisconnect}
                    onClose={() => setDisconnectTarget(null)}
                    loading={disconnecting}
                />
            )}
        </div>
    );
};

export default PlatformPage;
