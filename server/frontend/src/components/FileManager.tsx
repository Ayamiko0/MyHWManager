import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Folder, File, Upload, FolderPlus, Download, Trash2, ArrowLeft, ChevronRight } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useTranslation } from 'react-i18next';

interface FileNode {
    id: string | number;
    owner_device_id?: string;
    parent_id: string | number | null;
    name: string;
    is_dir: boolean;
    size: number;
    mime_type?: string;
    created_at?: string;
}

interface FileManagerProps {
    deviceId: string;
}

const FileManager: React.FC<FileManagerProps> = ({ deviceId }) => {
    const { t } = useTranslation();
    const [files, setFiles] = useState<FileNode[]>([]);
    const [currentFolder, setCurrentFolder] = useState<string | number | null>(null);
    const [folderPath, setFolderPath] = useState<{id: string | number | null, name: string}[]>([{id: null, name: t('home')}]);
    const [loading, setLoading] = useState(false);
    const [contextMenu, setContextMenu] = useState<{x: number, y: number, file: FileNode} | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        document.addEventListener('click', closeMenu);
        return () => document.removeEventListener('click', closeMenu);
    }, []);

    const fetchFiles = async (parentId: string | number | null) => {
        setLoading(true);
        try {
            const token = sessionStorage.getItem('admin_token');
            let res;
            if (deviceId === 'HUB') {
                res = await axios.get(`${API_BASE_URL}/api/files/list`, {
                    params: { device_id: deviceId, parent_id: parentId || 'null' },
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                res = await axios.get(`${API_BASE_URL}/api/devices/${deviceId}/fs/list`, {
                    params: { path: parentId || '/' },
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            setFiles(res.data || []);
            setCurrentFolder(parentId);
        } catch (e) {
            console.error("Failed to fetch files", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles(null);
    }, [deviceId]);

    const handleCreateFolder = async () => {
        const name = prompt(t('enterFolderName'));
        if (!name) return;

        try {
            const token = sessionStorage.getItem('admin_token');
            if (deviceId === 'HUB') {
                await axios.post(`${API_BASE_URL}/api/files/create_folder`, {
                    owner_device_id: deviceId,
                    parent_id: currentFolder,
                    name: name
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                await axios.post(`${API_BASE_URL}/api/devices/${deviceId}/fs/create_folder`, {
                    path: currentFolder || '/',
                    name: name
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            fetchFiles(currentFolder);
        } catch (e) {
            console.error("Failed to create folder", e);
            alert(t('createFolderFailed'));
        }
    };

    const handleRename = async (file: FileNode) => {
        const newName = prompt(t('enterNewName'), file.name);
        if (!newName || newName === file.name) return;
        try {
            const token = sessionStorage.getItem('admin_token');
            if (deviceId === 'HUB') {
                await axios.put(`${API_BASE_URL}/api/files/rename/${file.id}`, { name: newName }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                await axios.put(`${API_BASE_URL}/api/devices/${deviceId}/fs/rename`, {
                    path: file.id,
                    name: newName
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            fetchFiles(currentFolder);
        } catch (e) {
            console.error("Failed to rename", e);
            alert(t('renameFailed'));
        }
    };

    const handleMove = async (file: FileNode) => {
        const newPath = prompt(deviceId === 'HUB' ? t('enterParentId') : t('enterAbsPath'));
        if (!newPath) return;
        try {
            const token = sessionStorage.getItem('admin_token');
            if (deviceId === 'HUB') {
                await axios.put(`${API_BASE_URL}/api/files/move/${file.id}`, { 
                    parent_id: newPath === 'null' ? null : parseInt(newPath)
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                await axios.put(`${API_BASE_URL}/api/devices/${deviceId}/fs/move`, {
                    path: file.id,
                    name: newPath
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            fetchFiles(currentFolder);
        } catch (e) {
            console.error("Failed to move", e);
            alert(t('moveFailed'));
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        
        try {
            const token = sessionStorage.getItem('admin_token');
            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];
                const formData = new FormData();
                formData.append("file", file);
                
                if (deviceId === 'HUB') {
                    formData.append("owner_device_id", deviceId);
                    if (currentFolder !== null) {
                        formData.append("parent_id", currentFolder.toString());
                    }
                    await axios.post(`${API_BASE_URL}/api/files/upload`, formData, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                } else {
                    formData.append("path", currentFolder?.toString() || '/');
                    await axios.post(`${API_BASE_URL}/api/devices/${deviceId}/fs/upload`, formData, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                }
            }
            fetchFiles(currentFolder);
        } catch (err) {
            console.error("Failed to upload files", err);
            alert(t('uploadFailed'));
        }
    };

    const handleDownload = async (file: FileNode) => {
        try {
            const token = sessionStorage.getItem('admin_token');
            let res;
            if (deviceId === 'HUB') {
                res = await axios.get(`${API_BASE_URL}/api/files/download/${file.id}`, {
                    responseType: 'blob',
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                res = await axios.get(`${API_BASE_URL}/api/devices/${deviceId}/fs/download`, {
                    params: { path: file.id },
                    responseType: 'blob',
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            
            const url = window.URL.createObjectURL(new Blob([res.data]));
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

    const handleDelete = async (fileId: string | number) => {
        if (!confirm("Are you sure you want to delete this?")) return;
        try {
            const token = sessionStorage.getItem('admin_token');
            if (deviceId === 'HUB') {
                await axios.delete(`${API_BASE_URL}/api/files/${fileId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                await axios.delete(`${API_BASE_URL}/api/devices/${deviceId}/fs/delete`, {
                    data: { path: fileId },
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
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
                    <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleUpload} />
                </div>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar" onClick={() => setContextMenu(null)}>
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
                            <div 
                                key={file.id} 
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenu({ x: e.pageX, y: e.pageY, file });
                                }}
                                className="group relative flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-transparent hover:border-indigo-100 dark:hover:border-indigo-800/50 transition-all cursor-pointer"
                            >
                                
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

            {/* Context Menu */}
            {contextMenu && (
                <div 
                    className="fixed z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[150px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button 
                        onClick={() => { handleRename(contextMenu.file); setContextMenu(null); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        {t('rename')}
                    </button>
                    <button 
                        onClick={() => { handleMove(contextMenu.file); setContextMenu(null); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        {t('moveTo')}
                    </button>
                    {!contextMenu.file.is_dir && (
                        <button 
                            onClick={() => { handleDownload(contextMenu.file); setContextMenu(null); }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            {t('download')}
                        </button>
                    )}
                    <div className="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
                    <button 
                        onClick={() => { handleDelete(contextMenu.file.id); setContextMenu(null); }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    >
                        {t('delete')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default FileManager;
