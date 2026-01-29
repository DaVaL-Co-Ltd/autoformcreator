import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import axios from 'axios';
import Header from '../components/Header';
import { Clock, CheckCircle2, PlayCircle, Hourglass, Loader2, ArrowRight } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, colorClass }) => (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${colorClass}`}>
                <Icon size={24} className="text-white" />
            </div>
        </div>
        <div className="text-3xl font-black text-primary mb-1">{value}</div>
        <div className="text-sm font-medium text-gray-400 lowercase">{title}</div>
    </div>
);

const DashboardPage = () => {
    const navigate = useNavigate();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRequests = async () => {
            try {
                const response = await axios.get('/api/requests');
                setRequests(response.data);
            } catch (error) {
                console.error('Failed to fetch requests:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchRequests();
    }, []);

    const getStatusColor = (status) => {
        switch (status) {
            case '진단 대기': return 'bg-waiting';
            case '개발 중': return 'bg-developing';
            case '완료': return 'bg-completed';
            default: return 'bg-gray-400';
        }
    };

    return (
        <div className="min-h-screen bg-background pb-20">
            <Header />

            <main className="max-w-7xl mx-auto px-4 py-10">
                <div className="mb-10">
                    <h1 className="text-3xl font-black text-primary tracking-tight">Dashboard</h1>
                    <p className="text-gray-500">Monitor and manage your business automation requests.</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                    <StatCard title="Total Requests" value={requests.length} icon={Clock} colorClass="bg-primary" />
                    <StatCard title="In Progress" value={requests.filter(r => r.status === '개발 중').length} icon={PlayCircle} colorClass="bg-developing" />
                    <StatCard title="Completed" value={requests.filter(r => r.status === '완료').length} icon={CheckCircle2} colorClass="bg-completed" />
                    <StatCard title="Waiting" value={requests.filter(r => r.status === '진단 대기').length} icon={Hourglass} colorClass="bg-waiting" />
                </div>

                {/* Requests List */}
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
                    <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                        <h2 className="text-xl font-bold text-primary">Recent Requests</h2>
                        <button className="text-sm font-bold text-primary hover:underline">View All</button>
                    </div>

                    <div className="divide-y divide-gray-50">
                        {loading ? (
                            <div className="py-32 flex flex-col items-center justify-center text-gray-400">
                                <Loader2 className="animate-spin mb-4" size={40} />
                                <p className="font-medium">Loading requests...</p>
                            </div>
                        ) : requests.length > 0 ? (
                            requests.map((req) => (
                                <div
                                    key={req.id}
                                    className="p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors cursor-pointer group"
                                    onClick={() => navigate(`/request/${req.id}`)}
                                >
                                    <div>
                                        <h3 className="text-lg font-bold text-primary group-hover:text-blue-600 transition-colors mb-1">
                                            {req.title}
                                        </h3>
                                        <p className="text-sm text-gray-400">Submitted on {req.date} • #REQ-{req.id.toString().slice(-4).toUpperCase()}</p>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <span className={`px-4 py-1.5 rounded-full text-xs font-bold text-white ${getStatusColor(req.status)}`}>
                                            {req.status}
                                        </span>
                                        <button className="text-sm font-bold text-gray-400 group-hover:text-primary transition-colors flex items-center gap-1">
                                            View details
                                            <ArrowRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="py-32 flex flex-col items-center justify-center text-center px-10">
                                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-6">
                                    <Hourglass size={40} />
                                </div>
                                <h3 className="text-xl font-bold text-primary mb-2">No requests yet</h3>
                                <p className="text-gray-500 mb-8 max-w-xs">You haven't submitted any automation requests. Start by completing a simple diagnosis survey.</p>
                                <button
                                    onClick={() => navigate('/request/new')}
                                    className="bg-primary text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-800 transition-all shadow-lg"
                                >
                                    Create Request
                                    <ArrowRight size={18} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default DashboardPage;
