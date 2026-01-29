import { useState } from 'react';
import Header from '../components/Header';
import { Upload, Lock, ShieldCheck, Play, FileText, AlertCircle } from 'lucide-react';

const SolutionPage = () => {
    const [file, setFile] = useState(null);
    const [passkey, setPasskey] = useState('');
    const [status, setStatus] = useState('upload'); // upload, verifying, executing
    const [error, setError] = useState('');

    const handleFileUpload = (e) => {
        const uploadedFile = e.target.files[0];
        if (uploadedFile && uploadedFile.name.endsWith('.daval')) {
            setFile(uploadedFile);
            setError('');
        } else {
            setError('Please upload a valid .daval file.');
        }
    };

    const handleVerify = () => {
        if (passkey.length < 8) {
            setError('Invalid passkey. Key must be at least 8 characters.');
            return;
        }

        setStatus('verifying');
        // Simulate decryption/verification
        setTimeout(() => {
            setStatus('executing');
        }, 2000);
    };

    return (
        <div className="min-h-screen bg-background pb-20">
            <Header />

            <main className="max-w-4xl mx-auto px-4 py-16">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-black text-primary tracking-tight mb-3">Solution Operator</h1>
                    <p className="text-gray-500">Upload your .daval file and enter your secure passkey to run the automation.</p>
                </div>

                <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
                    {status === 'upload' && (
                        <div className="p-12 text-center">
                            <div className="mb-10">
                                <label className="cursor-pointer group">
                                    <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mx-auto mb-6 group-hover:bg-primary group-hover:text-white transition-all duration-500">
                                        <Upload size={32} />
                                    </div>
                                    <input type="file" className="hidden" accept=".daval" onChange={handleFileUpload} />
                                    <div className="text-xl font-bold text-primary mb-2">
                                        {file ? file.name : 'Select Solution File (.daval)'}
                                    </div>
                                    <p className="text-sm text-gray-400">Drag and drop or click to browse</p>
                                </label>
                            </div>

                            {file && (
                                <div className="max-w-xs mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="text-left">
                                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Secure Passkey</label>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                            <input
                                                type="password"
                                                value={passkey}
                                                onChange={(e) => setPasskey(e.target.value)}
                                                placeholder="Enter 16-character key"
                                                className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-12 pr-4 py-3 outline-none focus:ring-2 focus:ring-primary transition-all"
                                            />
                                        </div>
                                    </div>

                                    {error && <p className="text-xs font-bold text-red-500 flex items-center justify-center gap-1"><AlertCircle size={14} /> {error}</p>}

                                    <button
                                        onClick={handleVerify}
                                        className="w-full bg-primary text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-all shadow-lg"
                                    >
                                        Unlock & Execute
                                        <ShieldCheck size={18} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {status === 'verifying' && (
                        <div className="p-32 text-center animate-pulse">
                            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                            <h3 className="text-xl font-bold text-primary mb-2">Decrypted Integrity Check</h3>
                            <p className="text-gray-500">Verifying secure payload and runtime environment...</p>
                        </div>
                    )}

                    {status === 'executing' && (
                        <div className="p-0 flex flex-col h-[500px]">
                            <div className="bg-gray-900 p-4 flex items-center justify-between text-white">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 bg-red-500 rounded-full" />
                                    <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                                    <span className="ml-4 text-xs font-mono text-gray-400">daval-runtime://invoice-bot-v1.2</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1 text-completed">
                                        <ShieldCheck size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Verified</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 bg-white p-12 overflow-y-auto">
                                <div className="max-w-xl mx-auto text-center space-y-8 animate-in zoom-in-95 duration-700">
                                    <div className="p-6 bg-completed/10 rounded-2xl inline-block text-completed mb-4">
                                        <Play size={40} />
                                    </div>
                                    <h2 className="text-3xl font-black text-primary">Automation Ready</h2>
                                    <p className="text-gray-500">Your custom invoice processing system is now loaded in-memory and ready to start.</p>

                                    <div className="grid grid-cols-2 gap-4 text-left">
                                        <div className="p-4 bg-gray-50 rounded-xl">
                                            <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Last Updated</div>
                                            <div className="text-sm font-bold text-primary">2024.03.29</div>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-xl">
                                            <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Runtime Version</div>
                                            <div className="text-sm font-bold text-primary">v2.4.0 (Secure)</div>
                                        </div>
                                    </div>

                                    <button className="w-full bg-completed text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-completed/20 hover:scale-[1.02] transition-transform active:scale-95">
                                        Start Process
                                    </button>

                                    <button className="text-sm font-bold text-gray-400 hover:text-primary transition-colors flex items-center justify-center gap-1 mx-auto">
                                        <FileText size={16} />
                                        View Documentation
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default SolutionPage;
