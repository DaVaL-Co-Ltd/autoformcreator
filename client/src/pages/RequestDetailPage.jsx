import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import { ChevronLeft, Calendar, Tag, Activity, FileCode, MessageSquare, Download } from 'lucide-react';
import { useState, useEffect } from 'react';

const RequestDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [request, setRequest] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                const response = await axios.get(`/api/requests/${id}`);
                setRequest(response.data);
            } catch (error) {
                console.error('Failed to fetch request detail:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchDetail();
    }, [id]);

    const getStatusBadge = (status) => {
        const colors = {
            '진단 대기': 'bg-waiting',
            '개발 중': 'bg-developing',
            '완료': 'bg-completed',
        };
        return (
            <span className={`px-4 py-1.5 rounded-full text-xs font-bold text-white ${colors[status] || 'bg-gray-400'}`}>
                {status}
            </span>
        );
    };

    if (loading) return <div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center py-20">Loading...</div></div>;
    if (!request) return <div className="min-h-screen bg-background"><Header /><div className="flex items-center justify-center py-20">Request not found.</div></div>;

    return (
        <div className="min-h-screen bg-background pb-20">
            <Header />

            <main className="max-w-5xl mx-auto px-4 py-12">
                <button
                    onClick={() => navigate('/dashboard')}
                    className="flex items-center gap-2 text-gray-400 hover:text-primary font-bold mb-8 transition-colors"
                >
                    <ChevronLeft size={20} />
                    Back to Dashboard
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-8">
                        <div className="bg-white p-10 rounded-3xl border border-gray-100 shadow-sm">
                            <div className="flex justify-between items-start mb-8">
                                <div>
                                    <h1 className="text-3xl font-black text-primary mb-2">{request.title}</h1>
                                    <p className="text-gray-400 flex items-center gap-2 text-sm">
                                        <Calendar size={14} /> Submitted on {request.date} • #REQ-{id.slice(-4).toUpperCase()}
                                    </p>
                                </div>
                                {getStatusBadge(request.status)}
                            </div>

                            <div className="space-y-8">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Tag size={16} /> Process Overview
                                    </h3>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="p-4 bg-gray-50 rounded-2xl">
                                            <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Department</div>
                                            <div className="font-bold text-primary">{request.department || 'Not specified'}</div>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-2xl">
                                            <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Impact</div>
                                            <div className="font-bold text-primary">{request.priority || 'Medium'} Priority</div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Activity size={16} /> Current Workflow (Decrypted)
                                    </h3>
                                    <div className="bg-gray-50 p-6 rounded-2xl text-gray-700 leading-relaxed whitespace-pre-wrap">
                                        {request.currentWorkflow || 'No description provided.'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Experts Notes/Communication */}
                        <div className="bg-white p-10 rounded-3xl border border-gray-100 shadow-sm">
                            <h3 className="text-xl font-bold text-primary mb-6 flex items-center gap-2">
                                <MessageSquare size={20} /> Expert Consultation
                            </h3>
                            <div className="space-y-6">
                                <div className="flex gap-4">
                                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">DV</div>
                                    <div className="bg-gray-50 p-4 rounded-2xl text-sm text-gray-700">
                                        Hello! Our team is currently analyzing your workflow. We expect to provide a solution design by next week.
                                        <div className="mt-2 text-[10px] font-bold text-gray-400">Mar 25, 2024 • 10:30 AM</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Area */}
                    <div className="space-y-8">
                        {request.status === '완료' ? (
                            <div className="bg-completed text-white p-8 rounded-3xl shadow-xl shadow-completed/20">
                                <h3 className="text-xl font-black mb-2">Build Ready</h3>
                                <p className="text-white/80 text-sm mb-6">Your custom automation solution has been developed and verified.</p>
                                <div className="space-y-3">
                                    <button
                                        onClick={() => navigate(`/solution/${id}`)}
                                        className="w-full bg-white text-completed py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"
                                    >
                                        <FileCode size={18} />
                                        Solution Operator
                                    </button>
                                    <button className="w-full bg-white/10 text-white py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-all">
                                        <Download size={16} />
                                        Download .daval
                                    </button>
                                    <div className="pt-4 mt-4 border-t border-white/10 text-center">
                                        <button className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
                                            Request Maintenance
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm text-center">
                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mx-auto mb-4">
                                    <Activity size={32} />
                                </div>
                                <h3 className="text-lg font-bold text-primary mb-2">In Progress</h3>
                                <p className="text-gray-500 text-sm">Our experts are working on your solution. You'll be notified once it's ready.</p>
                            </div>
                        )}

                        {user?.role === 'admin' && (
                            <div className="bg-white p-8 rounded-3xl border-2 border-dashed border-gray-100 text-center">
                                <h3 className="text-lg font-bold text-primary mb-2">Admin Oversight</h3>
                                <p className="text-gray-500 text-xs mb-6">Manage this project's status and deliver solutions.</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <button className="bg-gray-50 text-primary py-3 rounded-2xl text-xs font-bold hover:bg-gray-100 transition-colors">Update Status</button>
                                    <button className="bg-primary text-white py-3 rounded-2xl text-xs font-bold hover:bg-gray-800 transition-colors">Deliver .daval</button>
                                </div>
                            </div>
                        )}

                        <div className="bg-primary text-white p-8 rounded-3xl shadow-xl shadow-primary/20">
                            <h3 className="text-lg font-bold mb-2 tracking-tight">Need help?</h3>
                            <p className="text-white/60 text-xs mb-6">Connect with your dedicated automation manager.</p>
                            <button className="w-full bg-white/10 py-3 rounded-2xl text-sm font-bold border border-white/20 hover:bg-white/20 transition-all">
                                Contact Support
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default RequestDetailPage;
