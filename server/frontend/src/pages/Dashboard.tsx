import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Device, ActivityLog, AppSettings } from '../types';
import { Activity, Server, ShieldCheck, Clock, Wifi, WifiOff, Settings } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useTranslation } from 'react-i18next';

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const getAuthHeaders = () => {
    const token = sessionStorage.getItem('admin_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchData = async () => {
    try {
      const headers = getAuthHeaders();
      const [devRes, logRes, setRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/devices`),
        axios.get(`${API_BASE_URL}/api/logs`, { headers }),
        axios.get(`${API_BASE_URL}/api/settings`, { headers })
      ]);
      setDevices(devRes.data);
      setLogs(logRes.data);
      setSettings(setRes.data);
    } catch (e) {
      console.error("Failed to fetch dashboard data");
    }
  };

  const handleUpdateRetention = async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      await axios.put(`${API_BASE_URL}/api/settings`, { log_retention_period: val }, { headers: getAuthHeaders() });
      setSettings(prev => prev ? { ...prev, log_retention_period: val } : null);
      setShowSettings(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Pause polling when tab is not visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const onlineCount = devices.filter(d => d.status === 'online').length;

  return (
    <div className="w-full h-full overflow-y-auto p-6 lg:p-8 pb-10 flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{t('cmdCenter')}</h2>
        <p className="text-gray-500 text-sm mt-1">{t('sysOverview')}</p>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 flex flex-col justify-between shadow-sm">
           <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{t('totalDevices')}</h3>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg"><Server className="w-5 h-5" /></div>
           </div>
           <div className="text-4xl font-black text-gray-800 dark:text-gray-100">{devices.length}</div>
        </div>
        
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 flex flex-col justify-between shadow-sm">
           <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{t('onlineNodes')}</h3>
              <div className="p-2 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg"><Wifi className="w-5 h-5" /></div>
           </div>
           <div className="text-4xl font-black text-green-600 dark:text-green-400">{onlineCount}</div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 flex flex-col justify-between shadow-sm">
           <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{t('offlineNodes')}</h3>
              <div className="p-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg"><WifiOff className="w-5 h-5" /></div>
           </div>
           <div className="text-4xl font-black text-red-600 dark:text-red-400">{devices.length - onlineCount}</div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 flex flex-col justify-between shadow-sm">
           <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{t('sysStatus')}</h3>
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg"><ShieldCheck className="w-5 h-5" /></div>
           </div>
           <div className="text-xl font-black text-blue-600 dark:text-blue-400">{t('operational')}</div>
        </div>
      </div>

      {/* ACTIVITY LOG */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl flex flex-col shadow-sm overflow-hidden min-h-[400px]">
         <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center relative">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
               <Activity className="w-5 h-5 text-indigo-500" /> {t('recentActivity')}
            </h3>
            
            <button onClick={() => setShowSettings(!showSettings)} className="text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
               <Settings className="w-5 h-5" />
            </button>

            {showSettings && (
               <div className="absolute top-16 right-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl p-4 z-10 w-64">
                  <h4 className="font-bold text-sm mb-2">{t('logRetention')}</h4>
                  <label className="block text-xs text-gray-500 mb-1">Auto-delete logs older than:</label>
                  <select 
                     value={settings?.log_retention_period || "1w"}
                     onChange={handleUpdateRetention}
                     className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm"
                  >
                     <option value="1h">1 Hour</option>
                     <option value="8h">8 Hours</option>
                     <option value="12h">12 Hours</option>
                     <option value="1d">1 Day</option>
                     <option value="3d">3 Days</option>
                     <option value="1w">1 Week</option>
                     <option value="1m">1 Month</option>
                     <option value="never">Never Delete</option>
                  </select>
               </div>
            )}
         </div>
         <div className="p-0 overflow-y-auto max-h-[600px]">
            {logs.length === 0 ? (
               <div className="p-8 text-center text-gray-500">{t('noActivity')}</div>
            ) : (
               <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {logs.map(log => (
                     <li key={log.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors flex items-start gap-4">
                        <div className={`mt-1 p-1.5 rounded-full ${
                           log.event === 'connected' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                           log.event === 'disconnected' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                           'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                        }`}>
                           {log.event === 'connected' ? <Wifi className="w-4 h-4" /> :
                            log.event === 'disconnected' ? <WifiOff className="w-4 h-4" /> :
                            <Server className="w-4 h-4" />}
                        </div>
                        <div className="flex-1">
                           <p className="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize">{log.event}</p>
                           <p className="text-sm text-gray-600 dark:text-gray-400">{log.message} <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded ml-1">{log.device_id.substring(0,8)}...</span></p>
                        </div>
                        <div className="text-xs text-gray-400 flex items-center gap-1">
                           <Clock className="w-3 h-3" />
                           {new Date(log.timestamp).toLocaleTimeString()}
                        </div>
                     </li>
                  ))}
               </ul>
            )}
         </div>
      </div>
    </div>
  );
};
export default Dashboard;
