import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Shield, Server, FolderPlus, Trash2, HardDrive, ArrowLeft } from 'lucide-react';
import ClientFileManager from './ClientFileManager';
import { useTranslation } from 'react-i18next';

interface ClientFilesTabProps {
    clientId: string;
    serverIp: string;
}

const ClientFilesTab: React.FC<ClientFilesTabProps> = ({ clientId, serverIp }) => {
    const { t } = useTranslation();
    const [view, setView] = useState<'menu' | 'hub'>('menu');
    const [allowedDirs, setAllowedDirs] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchAllowedDirs = async () => {
        try {
            setLoading(true);
            const dirs = await invoke<string[]>('get_allowed_dirs');
            setAllowedDirs(dirs);
        } catch (e) {
            console.error("Failed to fetch allowed dirs", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllowedDirs();
    }, []);

    const handleAddDir = async () => {
        const dir = prompt(t('enterPathPrompt'));
        if (!dir) return;

        try {
            await invoke('add_allowed_dir', { dir });
            fetchAllowedDirs();
        } catch (e: any) {
            alert(`Failed to add directory: ${e.toString()}`);
        }
    };

    const handleRemoveDir = async (dir: string) => {
        if (!confirm(`${t('removeAccessPrompt')} ${dir}?`)) return;
        try {
            await invoke('remove_allowed_dir', { dir });
            fetchAllowedDirs();
        } catch (e: any) {
            alert(`Failed to remove directory: ${e.toString()}`);
        }
    };

    if (view === 'hub') {
        return (
            <div className="flex flex-col h-full w-full">
                <div className="flex items-center gap-4 mb-4">
                    <button onClick={() => setView('menu')} className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Server className="w-5 h-5 text-indigo-500" />
                        {t('centralHub')}
                    </h2>
                </div>
                <ClientFileManager targetId="HUB" clientId={clientId} serverIp={serverIp} />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full p-4">
            
            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 mb-2 text-indigo-900 dark:text-indigo-300">
                        <Server className="w-6 h-6" /> {t('centralHub')}
                    </h2>
                    <p className="text-sm text-indigo-700 dark:text-indigo-400">
                        {t('centralHubDesc')}
                    </p>
                </div>
                <button 
                    onClick={() => setView('hub')}
                    className="shrink-0 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-colors"
                >
                    {t('openHub')}
                </button>
            </div>

            <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 mb-1">
                            <Shield className="w-6 h-6 text-emerald-500" />
                            {t('allowedDirs')}
                        </h2>
                        <p className="text-sm text-gray-500">
                            {t('allowedDirsDesc')}
                        </p>
                    </div>
                    <button onClick={handleAddDir} className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors">
                        <FolderPlus className="w-4 h-4" /> {t('addPath')}
                    </button>
                </div>

                {loading ? (
                    <div className="p-8 flex justify-center"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
                ) : allowedDirs.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
                        <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p className="font-medium">{t('noDirs')}</p>
                        <p className="text-sm mt-1">{t('adminNoAccess')}</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {allowedDirs.map((dir, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-colors">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <HardDrive className="w-5 h-5 text-gray-400 shrink-0" />
                                    <span className="font-mono text-sm truncate" title={dir}>{dir}</span>
                                </div>
                                <button onClick={() => handleRemoveDir(dir)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

        </div>
    );
};

export default ClientFilesTab;
