import React, { useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, KeyRound, Check, AlertCircle, MonitorSmartphone, Languages } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { ThemeMode, LangKey } from '../types';

interface SettingsPageProps {
    theme: ThemeMode;
    setTheme: (t: ThemeMode) => void;
    lang: LangKey;
    changeLanguage: (l: LangKey) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ theme, setTheme, lang, changeLanguage }) => {
    const { t } = useTranslation();
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const authH = () => {
        const tToken = sessionStorage.getItem('admin_token');
        return tToken ? { Authorization: `Bearer ${tToken}` } : {};
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('idle');
        if (newPw !== confirmPw) { setStatus('error'); setMessage('New passwords do not match.'); return; }
        if (newPw.length < 6) { setStatus('error'); setMessage('Password must be at least 6 characters.'); return; }
        try {
            await axios.put(`${API_BASE_URL}/api/admin/change-password`, { current_password: currentPw, new_password: newPw }, { headers: authH() });
            setStatus('success'); setMessage('Password changed successfully!');
            setCurrentPw(''); setNewPw(''); setConfirmPw('');
        } catch (err: any) {
            setStatus('error'); setMessage(err.response?.data?.error || 'Failed to change password.');
        }
    };

    const username = sessionStorage.getItem('admin_user') || 'admin';

    return (
        <div className="w-full h-full overflow-y-auto p-6 lg:p-8 pb-10">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t('settings')}</h2>
                <p className="text-gray-500 text-sm mt-1">Manage your admin account and preferences.</p>
            </div>

            <div className="max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Account Settings */}
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-sm h-fit">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                            <KeyRound className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">Change Password</h3>
                            <p className="text-xs text-gray-400">Logged in as <span className="font-mono font-bold">{username}</span></p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Current Password</label>
                            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">New Password</label>
                            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500" placeholder="Minimum 6 characters" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Confirm New Password</label>
                            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500" />
                        </div>

                        {status !== 'idle' && (
                            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${status === 'success' ? 'bg-green-50 dark:bg-green-950/30 text-green-600 border border-green-100 dark:border-green-900' : 'bg-red-50 dark:bg-red-950/30 text-red-600 border border-red-100 dark:border-red-900'}`}>
                                {status === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                {message}
                            </div>
                        )}

                        <button type="submit" disabled={!currentPw || !newPw || !confirmPw} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors mt-2">
                            Update Password
                        </button>
                    </form>
                </div>

                {/* Appearance Settings */}
                <div className="flex flex-col gap-8">
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                                <MonitorSmartphone className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">{t('appearance')}</h3>
                                <p className="text-xs text-gray-400">Customize the UI theme</p>
                            </div>
                        </div>

                        <div className="flex bg-gray-100 dark:bg-gray-800 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 w-full">
                            <button onClick={() => setTheme("light")} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${theme === 'light' ? 'bg-white shadow-sm text-indigo-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'}`}>{t('themeLight')}</button>
                            <button onClick={() => setTheme("dark")} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${theme === 'dark' ? 'bg-white shadow-sm text-indigo-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'}`}>{t('themeDark')}</button>
                            <button onClick={() => setTheme("system")} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${theme === 'system' ? 'bg-white shadow-sm text-indigo-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'}`}>{t('themeSystem')}</button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                                <Languages className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">{t('language')}</h3>
                                <p className="text-xs text-gray-400">Change dashboard language</p>
                            </div>
                        </div>

                        <div className="relative flex bg-gray-100 dark:bg-gray-800 p-2 rounded-xl border border-gray-200 dark:border-gray-700">
                            <select 
                                className="appearance-none w-full bg-transparent text-sm font-bold pl-4 pr-8 py-2 rounded-md outline-none cursor-pointer text-gray-700 dark:text-gray-300 transition-colors"
                                value={lang}
                                onChange={(e) => changeLanguage(e.target.value as LangKey)}
                            >
                                <option value="en" className="dark:bg-gray-800 dark:text-gray-200">English</option>
                                <option value="vi" className="dark:bg-gray-800 dark:text-gray-200">Tiếng Việt</option>
                                <option value="ru" className="dark:bg-gray-800 dark:text-gray-200">Русский</option>
                                <option value="zh" className="dark:bg-gray-800 dark:text-gray-200">中文</option>
                                <option value="ja" className="dark:bg-gray-800 dark:text-gray-200">日本語</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-gray-500 dark:text-gray-400">
                                <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default SettingsPage;
