import { useState, useEffect } from 'react';
import axios from 'axios';
import Header from '../components/Header';
import { Users, FileText, Settings, ExternalLink, MoreVertical, Filter } from 'lucide-react';

const AdminDashboardPage = () => {
    const [allRequests, setAllRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const response = await axios.get('/api/requests'); // Admin would use a special "all" endpoint
                setAllRequests(response.data);
            } catch (error) {
                console.error('Admin fetch error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    return (
        <div className="min-h-screen bg-background pb-20">
            <Header />

            <main className="max-w-7xl mx-auto px-4 py-10">
                <div className="flex justify-between items-end mb-10">
                    <div>
                        <h1 className="text-3xl font-black text-primary tracking-tight">Admin Console</h1>
                        <p className="text-gray-500">Global overview and project management.</p>
                    </div>
                    <div className="flex gap-3">
                        <button className="flex items-center gap-2 bg-white border border-gray-100 px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors">
                            <Filter size={16} /> Filters
                        </button>
                        <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg hover:bg-gray-800 transition-all">
                            <Settings size={16} /> System Config
                        </button>
                    </div>
                </div>

                {/* Admin Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                        <div>
                            <div className="text-xs font-bold text-gray-400 uppercase mb-1">Total Clients</div>
                            <div className="text-3xl font-black text-primary">24</div>
                        </div>
                        <div className="p-4 bg-primary/5 rounded-2xl text-primary"><Users size={24} /></div>
                    </div>
                    <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                        <div>
                            <div className="text-xs font-bold text-gray-400 uppercase mb-1">Active Projects</div>
                            <div className="text-3xl font-black text-primary">{allRequests.length}</div>
                        </div>
                        <div className="p-4 bg-developing/10 rounded-2xl text-developing"><Activity size={24} /></div>
                    </div>
                    <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                        <div>
                            <div className="text-xs font-bold text-gray-400 uppercase mb-1">Pending Invoices</div>
                            <div className="text-3xl font-black text-primary">₩4.2M</div>
                        </div>
                        <div className="p-4 bg-waiting/10 rounded-2xl text-waiting"><FileText size={24} /></div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="px-8 py-5 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50">Client / Request</th>
                                <th className="px-8 py-5 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50">Status</th>
                                <th className="px-8 py-5 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50">Date</th>
                                <th className="px-8 py-5 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {allRequests.map((req) => (
                                <tr key={req.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="font-bold text-primary group-hover:text-blue-600 transition-colors">{req.title}</div>
                                        <div className="text-xs text-gray-400">#REQ-{req.id.slice(-4).toUpperCase()}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase text-white ${req.status === '진단 대기' ? 'bg-waiting' : req.status === '개발 중' ? 'bg-developing' : 'bg-completed'
                                            }`}>
                                            {req.status}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6 text-sm text-gray-500 font-medium">{req.date}</td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-2">
                                            <button className="p-2 text-gray-300 hover:text-primary transition-colors"><ExternalLink size={18} /></button>
                                            <button className="p-2 text-gray-300 hover:text-primary transition-colors"><MoreVertical size={18} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {allRequests.length === 0 && !loading && (
                        <div className="py-20 text-center text-gray-400 font-medium italic">
                            No project data available in Notion.
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default AdminDashboardPage;
