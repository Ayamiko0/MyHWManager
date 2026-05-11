import React, { useState, useEffect, useRef } from 'react';
import { Folder, File, Upload, FolderPlus, Download, Trash2, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface FileNode {
    id: number;
    owner_device_id: string;
    parent_id: number | null;
    name: string;
    is_dir: boolean;
    size: number;
    mime_type: string;
    created_at: string;
}

interface ClientFileManagerProps {
    targetId: string;
    clientId: string;
    serverIp: string;
}

const ClientFileManager: React.FC<ClientFileManagerProps> = ({ targetId, clientId, serverIp }) => {
    const { t } = useTranslation();
    const [files, setFiles] = useState<FileNode[]>([]);
    const [currentFolder, setCurrentFolder] = useState<number | null>(null);
    const [folderPath, setFolderPath] = useState<{id: number | null, name: string}[]>([{id: null, name: t('home')}]);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const agentToken = localStorage.getItem('agent_token') || '';
    const apiBase = `http://${serverIp}/api/files`;

    const getHeaders = () => ({
        'X-Agent-Token': agentToken,
        'X-Device-ID': clientId
    });

    const fetchFiles = async (parentId: number | null) => {
        if (!serverIp) return;
        setLoading(true);
        try {
            const url = new URL(`${apiBase}/list`);
            url.searchParams.append('device_id', targetId);
            if (parentId) url.searchParams.append('parent_id', parentId.toString());

            const res = await fetch(url.toString(), { headers: getHeaders() });
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setFiles(data || []);
            setCurrentFolder(parentId);
        } catch (e) {
            console.error("Failed to fetch files", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (serverIp) fetchFiles(null);
    }, [targetId, clientId, serverIp]);

    const handleCreateFolder = async () => {
        const name = prompt(t('enterFolderName'));
        if (!name) return;

        try {
            const res = await fetch(`${apiBase}/create_folder`, {
                method: 'POST',
                headers: { ...getHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    owner_device_id: targetId,
                    parent_id: currentFolder,
                    name: name
                })
            });
            if (!res.ok) throw new Error('Failed to create folder');
            fetchFiles(currentFolder);
        } catch (e) {
            console.error("Failed to create folder", e);
            alert(t('createFolderFailed'));
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];

        const formData = new FormData();
        formData.append("owner_device_id", targetId);
        if (currentFolder !== null) {
            formData.append("parent_id", currentFolder.toString());
        }
        formData.append("file", file);

        try {
            const res = await fetch(`${apiBase}/upload`, {
                method: 'POST',
                headers: getHeaders(), // Note: Do not set Content-Type for FormData, browser sets it with boundary
                body: formData
            });
            if (!res.ok) throw new Error('Failed to upload');
            fetchFiles(currentFolder);
        } catch (err) {
            console.error("Failed to upload file", err);
            alert(t('uploadFailed'));
        }
    };

    const handleDownload = async (file: FileNode) => {
        try {
            const res = await fetch(`${apiBase}/download/${file.id}`, {
                headers: getHeaders()
            });
            if (!res.ok) throw new Error('Failed to download');
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', file.name);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error("Failed to download file", e);
            alert("Failed to download file");
        }
    };

    const handleDelete = async (fileId: number) => {
        if (!confirm("Are you sure you want to delete this?")) return;
        try {
            const res = await fetch(`${apiBase}/${fileId}`, {
                method: 'DELETE',
                headers: getHeaders()
            });
            if (!res.ok) throw new Error('Failed to delete');
            fetchFiles(currentFolder);
        } catch (e) {
            console.error("Failed to delete", e);
        }
    };

    const openFolder = (folder: FileNode) => {
        setFolderPath(prev => [...prev, {id: folder.id, name: folder.name}]);
        fetchFiles(folder.id);
    };

    const navigateUp = (index: number) => {
        const target = folderPath[index];
        setFolderPath(prev => prev.slice(0, index + 1));
        fetchFiles(target.id);
    };

    if (!serverIp) {
        return <div className="p-8 text-center text-gray-500">Please connect to a server first.</div>;
    }

    return (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col h-[500px]">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                    {folderPath.map((crumb, idx) => (
                        <div key={idx} className="flex items-center whitespace-nowrap">
                            <button 
                                onClick={() => navigateUp(idx)}
                                className={`text-sm font-medium hover:text-indigo-600 transition-colors ${idx === folderPath.length - 1 ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500'}`}
                            >
                                {crumb.name}
                            </button>
                            {idx < folderPath.length - 1 && <ChevronRight className="w-4 h-4 mx-1 text-gray-400" />}
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <button onClick={handleCreateFolder} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors" title="New Folder">
                        <FolderPlus className="w-5 h-5" />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-sm font-semibold">
                        <Upload className="w-4 h-4" /> {t('upload')}
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleUpload} />
                </div>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : files.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                        <Folder className="w-16 h-16 mb-4 opacity-20" />
                        <p>{t('folderEmpty')}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {files.map(file => (
                            <div key={file.id} className="group relative flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-transparent hover:border-indigo-100 dark:hover:border-indigo-800/50 transition-all cursor-pointer">
                                
                                {/* Actions */}
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 z-10">
                                    {!file.is_dir && (
                                        <button onClick={(e) => { e.stopPropagation(); handleDownload(file); }} className="p-1.5 bg-white dark:bg-gray-700 shadow text-gray-600 dark:text-gray-200 rounded-md hover:text-indigo-600">
                                            <Download className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }} className="p-1.5 bg-white dark:bg-gray-700 shadow text-gray-600 dark:text-gray-200 rounded-md hover:text-red-500">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <div onClick={() => file.is_dir ? openFolder(file) : null} className="w-full flex flex-col items-center justify-center">
                                    {file.is_dir ? (
                                        <Folder className="w-12 h-12 text-blue-400 mb-3 drop-shadow-sm" fill="currentColor" fillOpacity={0.2} />
                                    ) : (
                                        <File className="w-12 h-12 text-gray-400 mb-3" />
                                    )}
                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 text-center w-full truncate px-1" title={file.name}>
                                        {file.name}
                                    </span>
                                    {!file.is_dir && (
                                        <span className="text-xs text-gray-400 mt-1">
                                            {(file.size / 1024).toFixed(1)} KB
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClientFileManager;
