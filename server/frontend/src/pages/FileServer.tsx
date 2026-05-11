import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { HardDrive, Server } from 'lucide-react';
import { API_BASE_URL } from '../config';
import FileManager from '../components/FileManager';

const FileServer: React.FC = () => {
    const [devices, setDevices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

    useEffect(() => {
        const fetchDevices = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/devices`);
                setDevices(res.data);
            } catch (e) {
                console.error("Failed to fetch devices", e);
            } finally {
                setLoading(false);
            }
        };
        fetchDevices();
    }, []);

    if (selectedDeviceId) {
        const selectedDevice = devices.find(d => d.id === selectedDeviceId);
        return (
            <div className="p-6 lg:p-8 h-full flex flex-col">
                <div className="flex items-center gap-4 mb-6">
                    <button 
                        onClick={() => setSelectedDeviceId(null)}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-semibold transition-colors"
                    >
                        &larr; Back to Drives
                    </button>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <HardDrive className="w-5 h-5 text-indigo-500" />
                        {selectedDevice?.name || 'Device'} Drive
                    </h2>
                </div>
                <div className="flex-1 min-h-0">
                    <FileManager deviceId={selectedDeviceId} />
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 h-full flex flex-col overflow-y-auto">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">Global File Server</h1>
            <p className="text-gray-500 mb-8">Browse and manage files across all connected device drives.</p>
            
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Central Hub */}
                    <div 
                        onClick={() => setSelectedDeviceId("HUB")}
                        className="bg-indigo-50 dark:bg-indigo-900/10 p-6 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-800/50 hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                        <div className="flex items-center gap-4 relative">
                            <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-lg shadow-indigo-500/30">
                                <Server className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-indigo-900 dark:text-indigo-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">Central Hub</h3>
                                <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">Shared Server Storage</p>
                            </div>
                        </div>
                    </div>

                    {/* Connected Devices */}
                    {devices.map(device => (
                        <div 
                            key={device.id} 
                            onClick={() => setSelectedDeviceId(device.id)}
                            className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                    <HardDrive className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{device.name}</h3>
                                    <p className="text-xs font-mono text-gray-400 mt-1 truncate max-w-[150px]">{device.id}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FileServer;
