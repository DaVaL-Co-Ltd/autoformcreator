import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import { ChevronRight, ChevronLeft, Send, Check } from 'lucide-react';

const StepIndicator = ({ currentStep }) => (
    <div className="flex items-center justify-center gap-4 mb-12">
        {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${currentStep === step
                    ? 'bg-primary text-white scale-110 shadow-lg'
                    : currentStep > step ? 'bg-completed text-white' : 'bg-gray-100 text-gray-400'
                    }`}>
                    {currentStep > step ? <Check size={20} /> : step}
                </div>
                {step < 4 && (
                    <div className={`w-12 h-1 bg-gray-100 mx-2 rounded-full overflow-hidden`}>
                        <div className={`h-full bg-primary transition-all duration-500 ${currentStep > step ? 'w-full' : 'w-0'}`} />
                    </div>
                )}
            </div>
        ))}
    </div>
);

const NewRequestPage = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        // Step 1: Basic Info
        processName: '',
        department: '',
        headcount: '',
        // Step 2: Current Process
        currentWorkflow: '',
        dailyTimeSpent: '',
        frequency: '',
        // Step 3: Goals
        coreProblems: '',
        expectedROI: '',
        priority: 'Medium',
        // Step 4: Technical
        toolsUsed: '',
        budget: '',
        timeline: '',
    });

    const nextStep = () => setStep(s => Math.min(s + 1, 4));
    const prevStep = () => setStep(s => Math.max(s - 1, 1));

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post('/api/requests/submit', formData);
            navigate('/dashboard');
        } catch (error) {
            console.error('Submission failed:', error);
            alert('Failed to submit request. Please try again.');
        }
    };

    return (
        <div className="min-h-screen bg-background pb-20">
            <Header />

            <main className="max-w-3xl mx-auto px-4 py-16">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-black text-primary tracking-tight mb-3">New Automation Request</h1>
                    <p className="text-gray-500">Tell us about your business process to start the diagnosis.</p>
                </div>

                <StepIndicator currentStep={step} />

                <div className="bg-white rounded-3xl border border-gray-100 shadow-xl p-10">
                    <form onSubmit={handleSubmit}>
                        {step === 1 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <h2 className="text-2xl font-bold text-primary mb-6">Step 1: Basic Information</h2>
                                <div>
                                    <label className="block text-sm font-bold text-primary mb-2">Process Name</label>
                                    <input
                                        name="processName"
                                        value={formData.processName}
                                        onChange={handleChange}
                                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary transition-all"
                                        placeholder="e.g. Monthly Invoice Processing"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-primary mb-2">Department</label>
                                        <input
                                            name="department"
                                            value={formData.department}
                                            onChange={handleChange}
                                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary transition-all"
                                            placeholder="e.g. Finance"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-primary mb-2">Team Headcount</label>
                                        <input
                                            name="headcount"
                                            value={formData.headcount}
                                            onChange={handleChange}
                                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary transition-all"
                                            placeholder="e.g. 5"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <h2 className="text-2xl font-bold text-primary mb-6">Step 2: Current Workflow</h2>
                                <div>
                                    <label className="block text-sm font-bold text-primary mb-2">Describe Your Current Manual Workflow</label>
                                    <textarea
                                        name="currentWorkflow"
                                        value={formData.currentWorkflow}
                                        onChange={handleChange}
                                        rows={4}
                                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
                                        placeholder="Step by step description..."
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-primary mb-2">Daily Time Spent (Hours)</label>
                                        <input
                                            name="dailyTimeSpent"
                                            value={formData.dailyTimeSpent}
                                            onChange={handleChange}
                                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary transition-all"
                                            placeholder="e.g. 2"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-primary mb-2">Frequency</label>
                                        <select
                                            name="frequency"
                                            value={formData.frequency}
                                            onChange={handleChange}
                                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary transition-all appearance-none"
                                        >
                                            <option value="">Select frequency</option>
                                            <option value="Daily">Daily</option>
                                            <option value="Weekly">Weekly</option>
                                            <option value="Monthly">Monthly</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <h2 className="text-2xl font-bold text-primary mb-6">Step 3: Goals & Impact</h2>
                                <div>
                                    <label className="block text-sm font-bold text-primary mb-2">Core Problems to Solve</label>
                                    <textarea
                                        name="coreProblems"
                                        value={formData.coreProblems}
                                        onChange={handleChange}
                                        rows={3}
                                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
                                        placeholder="What is the biggest pain point?"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-primary mb-2">Priority</label>
                                    <div className="flex gap-4">
                                        {['Low', 'Medium', 'High'].map(p => (
                                            <button
                                                key={p}
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, priority: p }))}
                                                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all border ${formData.priority === p
                                                    ? 'bg-primary text-white border-primary shadow-lg'
                                                    : 'bg-white text-gray-400 border-gray-100 hover:border-primary hover:text-primary'
                                                    }`}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <h2 className="text-2xl font-bold text-primary mb-6">Step 4: Technical & Timeline</h2>
                                <div>
                                    <label className="block text-sm font-bold text-primary mb-2">Current Tools Used</label>
                                    <input
                                        name="toolsUsed"
                                        value={formData.toolsUsed}
                                        onChange={handleChange}
                                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary transition-all"
                                        placeholder="e.g. Excel, Slack, Notion"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-primary mb-2">Desired Timeline</label>
                                    <input
                                        name="timeline"
                                        value={formData.timeline}
                                        onChange={handleChange}
                                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary transition-all"
                                        placeholder="e.g. Within 2 weeks"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="mt-12 flex justify-between">
                            {step > 1 ? (
                                <button
                                    type="button"
                                    onClick={prevStep}
                                    className="flex items-center gap-2 text-primary font-bold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors"
                                >
                                    <ChevronLeft size={20} />
                                    Previous
                                </button>
                            ) : <div />}

                            {step < 4 ? (
                                <button
                                    type="button"
                                    onClick={nextStep}
                                    className="flex items-center gap-2 bg-primary text-white font-bold px-8 py-3 rounded-xl hover:bg-gray-800 shadow-xl transition-all"
                                >
                                    Next Step
                                    <ChevronRight size={20} />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    className="flex items-center gap-2 bg-completed text-white font-bold px-10 py-3 rounded-xl hover:bg-green-600 shadow-xl transition-all"
                                >
                                    Submit Request
                                    <Send size={20} />
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
};

export default NewRequestPage;
