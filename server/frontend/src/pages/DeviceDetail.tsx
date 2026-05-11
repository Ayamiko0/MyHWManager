import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { RealtimeStats, HardwareInfo } from '../types';
import DashboardLayout from '../components/DashboardLayout';
import { ArrowLeft, Activity, MonitorPlay, Terminal as TerminalIcon, HardDrive, Cpu } from 'lucide-react';
import { API_BASE_URL } from '../config';
import RemoteDesktopModal from '../components/RemoteDesktopModal';
import TerminalModal from '../components/TerminalModal';
import FileManager from '../components/FileManager';
import { useTranslation } from 'react-i18next';

const DeviceDetail: React.FC = () => {
    const { t } = useTranslation();
    const { id } = useParams<{id: string}>();
    const navigate = useNavigate();
    const [realtime, setRealtime] = useState<RealtimeStats | null>(null);
    const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(false);
    
    // Remote Desktop State
    const [remoteSession, setRemoteSession] = useState<string | null>(null); // stores sessionId
    const [isRequestingRemote, setIsRequestingRemote] = useState(false);

    // Terminal State
    const [terminalSession, setTerminalSession] = useState<string | null>(null);
    const [isRequestingTerminal, setIsRequestingTerminal] = useState(false);

    const [activeTab, setActiveTab] = useState<'hardware' | 'files'>('hardware');

    useEffect(() => {
        const fetchDevice = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/devices`);
                const device = res.data.find((d: any) => d.id === id);
                if (device) {
                    setIsOnline(device.status === 'online');
                    if (device.hardware_data) {
                        try {
                            setHardwareInfo(JSON.parse(device.hardware_data));
                        } catch (parseErr) {
                            console.error("Failed to parse hardware_data:", parseErr);
                            setHardwareInfo({ host_name: device.name, os_name: device.os, os_version: 'Unknown', cpu_name: device.cpu_name, cpu_cores: 0, total_memory: device.ram_total, used_memory: 0, gpu_name: 'Unknown', disks: [] });
                        }
                    } else {
                        setHardwareInfo({ host_name: device.name, os_name: device.os, os_version: 'Unknown', cpu_name: device.cpu_name, cpu_cores: 0, total_memory: device.ram_total, used_memory: 0, gpu_name: 'Unknown', disks: [] });
                    }
                }
            } catch (e) { console.error("Failed to fetch device info", e); } finally { setLoading(false); }
        };
        fetchDevice();
    }, [id]);

    useEffect(() => {
        const fetchTelemetry = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/devices/${id}/telemetry`);
                setRealtime(res.data); setIsOnline(true); setError('');
            } catch (err) { setError('Telemetry stream offline'); setIsOnline(false); }
        };
        if (isOnline) { fetchTelemetry(); const i = setInterval(fetchTelemetry, 1000); return () => clearInterval(i); }
    }, [id, isOnline]);

    const handleRemoteControl = async () => {
        if (!isOnline) return;
        setIsRequestingRemote(true);
        try {
            const token = sessionStorage.getItem('admin_token');
            const res = await axios.post(`${API_BASE_URL}/api/remote/request/${id}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRemoteSession(res.data.session_id);
        } catch (e) {
            console.error("Failed to request remote session", e);
            alert("Failed to start remote control");
        } finally {
            setIsRequestingRemote(false);
        }
    };

    const handleTerminal = async () => {
        if (!isOnline) return;
        setIsRequestingTerminal(true);
        try {
            const token = sessionStorage.getItem('admin_token');
            const res = await axios.post(`${API_BASE_URL}/api/remote/terminal/${id}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTerminalSession(res.data.session_id);
        } catch (e) {
            console.error("Failed to request terminal session", e);
            alert("Failed to start terminal");
        } finally {
            setIsRequestingTerminal(false);
        }
    };
    return (
        <div className="flex flex-col h-full w-full p-6 lg:p-8 overflow-y-auto">
            {remoteSession && (
                <RemoteDesktopModal 
                    sessionId={remoteSession} 
                    deviceName={hardwareInfo?.host_name || 'Device'}
                    onClose={() => setRemoteSession(null)} 
                />
            )}
            {terminalSession && (
                <TerminalModal 
                    sessionId={terminalSession} 
                    deviceName={hardwareInfo?.host_name || 'Device'}
                    onClose={() => setTerminalSession(null)} 
                />
            )}
            <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-full transition-colors"><ArrowLeft className="w-5 h-5" /></button>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
                            {hardwareInfo?.host_name || 'Device Diagnostics'}
                            {isOnline ? (<span className="text-[10px] uppercase tracking-wide text-green-600 bg-green-50 dark:bg-green-900/40 px-2 py-1 rounded-sm font-bold border border-green-200 dark:border-green-800 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> {t('online')}</span>)
                            : (<span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-sm font-bold border border-gray-200 dark:border-gray-700">{t('offline')}</span>)}
                        </h2>
                        <p className="text-gray-500 font-mono text-sm mt-1">ID: {id}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleTerminal} 
                        disabled={!isOnline || isRequestingTerminal}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                            isOnline && !isRequestingTerminal 
                            ? 'bg-slate-800 hover:bg-slate-900 text-white shadow-md' 
                            : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        {isRequestingTerminal ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> {t('connecting')}</>
                        ) : (
                            <><TerminalIcon className="w-4 h-4" /> {t('terminal').toUpperCase()}</>
                        )}
                    </button>
                    
                    <button 
                        onClick={handleRemoteControl} 
                        disabled={!isOnline || isRequestingRemote}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                            isOnline && !isRequestingRemote 
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20' 
                            : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        {isRequestingRemote ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> {t('connecting')}</>
                        ) : (
                            <><MonitorPlay className="w-4 h-4" /> {t('remoteDesktop').toUpperCase()}</>
                        )}
                    </button>
                </div>
            </div>
            {loading ? (<div className="flex-1 flex justify-center items-center"><div className="animate-pulse flex flex-col items-center"><div className="h-12 w-12 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin mb-4"></div><p className="text-indigo-600 font-medium tracking-widest uppercase">Loading Matrix...</p></div></div>)
            : error && !hardwareInfo ? (<div className="flex-1 flex items-center justify-center"><div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 p-6 rounded-2xl border border-red-100 dark:border-red-900 flex flex-col items-center"><Activity className="w-10 h-10 mb-2 opacity-50" /><p className="font-bold text-lg">{error}</p><p className="text-sm mt-1">Ensure the client is running and linked to the server.</p></div></div>)
            : (
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center gap-2 mb-4 shrink-0">
                        <button 
                            onClick={() => setActiveTab('hardware')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'hardware' ? 'bg-white dark:bg-gray-800 text-indigo-600 shadow-sm border border-gray-200 dark:border-gray-700' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                        >
                            <Cpu className="w-4 h-4" /> HARDWARE
                        </button>
                        <button 
                            onClick={() => setActiveTab('files')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'files' ? 'bg-white dark:bg-gray-800 text-indigo-600 shadow-sm border border-gray-200 dark:border-gray-700' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                        >
                            <HardDrive className="w-4 h-4" /> FILES
                        </button>
                    </div>
                
                    {activeTab === 'hardware' ? (
                        <div className="flex-1 overflow-hidden relative w-full h-full">
                            <DashboardLayout hardwareInfo={hardwareInfo} realtime={realtime} loading={loading} />
                            {!isOnline && hardwareInfo && (<div className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-[2px] z-50 flex items-center justify-center rounded-2xl"><div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-xl flex flex-col items-center border border-gray-200 dark:border-gray-800"><Activity className="w-10 h-10 text-gray-400 mb-2" /><h3 className="font-bold text-lg">Device is Offline</h3><p className="text-sm text-gray-500 mt-1 text-center max-w-xs">Cannot stream real-time telemetry. Viewing static hardware profile only.</p></div></div>)}
                        </div>
                    ) : (
                        <div className="flex-1 overflow-hidden relative w-full h-full">
                            <FileManager deviceId={id || ''} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DeviceDetail;
