import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Device, DeviceGroup } from '../types';
import { Server, Activity, Plus, Trash2, FolderPlus } from 'lucide-react';
import { API_BASE_URL } from '../config';

const DevicesList: React.FC = () => {
    const [devices, setDevices] = useState<Device[]>([]);
    const [groups, setGroups] = useState<DeviceGroup[]>([]);
    const [recentIds, setRecentIds] = useState<string[]>(JSON.parse(localStorage.getItem('recent_devices') || '[]'));
    const [showPinModal, setShowPinModal] = useState(false);
    const [pin, setPin] = useState<string | null>(null);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");
    const [newGroupDevice, setNewGroupDevice] = useState("");

    const authH = () => {
        const t = sessionStorage.getItem('admin_token');
        return t ? { Authorization: `Bearer ${t}` } : {};
    };

    const fetchData = async () => {
        try {
            const h = authH();
            const [devR, grpR] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/devices`),
                axios.get(`${API_BASE_URL}/api/groups`, { headers: h })
            ]);
            setDevices(devR.data);
            setGroups(grpR.data);
        } catch (e) { console.error("Fetch error"); }
    };

    useEffect(() => { fetchData(); const i = setInterval(fetchData, 30000); return () => clearInterval(i); }, []);
    useEffect(() => { const h = () => { if (document.visibilityState === 'visible') fetchData(); }; document.addEventListener('visibilitychange', h); return () => document.removeEventListener('visibilitychange', h); }, []);

    const handleAddDevice = async () => {
        try {
            const res = await axios.post(`${API_BASE_URL}/api/admin/generate-pin`, {}, { headers: authH() });
            setPin(res.data.pin); setShowPinModal(true);
        } catch(e: any) { alert(e.response?.status === 401 ? "Session expired." : "Failed to generate PIN."); }
    };
    const handleDeleteDevice = async (e: React.MouseEvent, id: string) => {
        e.preventDefault(); e.stopPropagation();
        if (confirm("Delete this device?")) { await axios.delete(`${API_BASE_URL}/api/devices/${id}`, { headers: authH() }); fetchData(); }
    };
    const handleCreateGroup = () => {
        if (devices.length === 0) { alert("Need at least one device."); return; }
        setNewGroupName(""); setNewGroupDevice(""); setShowGroupModal(true);
    };
    const submitCreateGroup = async () => {
        if (!newGroupName || !newGroupDevice) return;
        try {
            const h = authH();
            const res = await axios.post(`${API_BASE_URL}/api/groups`, { name: newGroupName }, { headers: h });
            await axios.put(`${API_BASE_URL}/api/devices/${newGroupDevice}/group`, { group_id: res.data.id }, { headers: h });
            setShowGroupModal(false); fetchData();
        } catch (e) { alert("Failed to create group."); }
    };
    const handleAssignGroup = async (e: React.ChangeEvent<HTMLSelectElement>, did: string) => {
        const gid = e.target.value === "" ? null : Number(e.target.value);
        await axios.put(`${API_BASE_URL}/api/devices/${did}/group`, { group_id: gid }, { headers: authH() });
        fetchData();
    };

    const recentDevices = devices.filter(d => recentIds.includes(d.id));
    const renderCard = (dev: Device) => (
        <Link key={dev.id} to={`/devices/${dev.id}`}
            onClick={() => { const r = [dev.id, ...recentIds.filter(i => i !== dev.id)].slice(0, 4); setRecentIds(r); localStorage.setItem('recent_devices', JSON.stringify(r)); }}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col min-h-[220px]">
            <div className="flex justify-between items-start mb-4">
                <div><h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{dev.name}</h3>
                <p className="text-xs font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded inline-block mt-1">{dev.id.substring(0, 16)}...</p></div>
                <div className={`px-2 py-1 rounded text-[10px] font-bold tracking-wide uppercase ${dev.status === 'online' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>{dev.status}</div>
            </div>
            <div className="flex flex-col gap-2 mb-4 mt-auto">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"><span className="w-5 text-center">💻</span><span className="truncate">{dev.os}</span></div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"><span className="w-5 text-center">🧠</span><span className="truncate">{dev.cpu_name}</span></div>
            </div>
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4 flex justify-between items-center z-10" onClick={e => e.preventDefault()}>
                <select value={dev.group_id || ""} onChange={e => handleAssignGroup(e, dev.id)} className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs rounded px-2 py-1">
                    <option value="">No Group</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button onClick={e => handleDeleteDevice(e, dev.id)} className="text-red-500 hover:text-red-700 p-1.5 bg-red-50 dark:bg-red-900/20 rounded transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
            </div>
        </Link>
    );

    return (
        <div className="w-full h-full overflow-y-auto p-6 lg:p-8 pb-10">
            <div className="flex justify-between items-center mb-8">
                <div><h2 className="text-2xl font-bold">Devices Hub</h2><p className="text-gray-500 text-sm mt-1">Manage and organize all your connected instances.</p></div>
                <div className="flex gap-3">
                    <button onClick={handleCreateGroup} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2"><FolderPlus className="w-4 h-4" /> New Group</button>
                    <button onClick={handleAddDevice} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-sm"><Plus className="w-4 h-4" /> Add Device</button>
                </div>
            </div>
            {recentDevices.length > 0 && (<div className="mb-10"><h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Activity className="w-4 h-4" /> Recently Viewed</h3><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">{recentDevices.map(renderCard)}</div></div>)}
            <div><h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Server className="w-4 h-4" /> All Devices</h3><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">{devices.map(renderCard)}{devices.length === 0 && <div className="text-gray-500 italic">No devices found.</div>}</div></div>
            {showPinModal && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"><div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-8 w-full max-w-sm text-center"><h3 className="text-xl font-bold mb-2">Pair New Device</h3><p className="text-sm text-gray-500 mb-6">Enter this PIN into the Client app.</p><div className="bg-gray-100 dark:bg-gray-950 py-4 rounded-xl mb-6"><span className="text-4xl font-mono font-black tracking-widest text-indigo-600">{pin}</span></div><button onClick={() => setShowPinModal(false)} className="w-full bg-gray-100 dark:bg-gray-800 font-bold py-3 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Done</button></div></div>)}
            {showGroupModal && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"><div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-8 w-full max-w-sm"><h3 className="text-xl font-bold mb-4 text-center">Create New Group</h3><div className="mb-4"><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Group Name</label><input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. Production" className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500" /></div><div className="mb-8"><label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Assign Initial Device</label><p className="text-[10px] text-gray-400 mb-2">A group requires at least one device.</p><select value={newGroupDevice} onChange={e => setNewGroupDevice(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-2 text-sm"><option value="" disabled>Select a device...</option>{devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div><div className="flex gap-3"><button onClick={() => setShowGroupModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 font-bold py-2 rounded-xl text-gray-600 dark:text-gray-300">Cancel</button><button onClick={submitCreateGroup} disabled={!newGroupName || !newGroupDevice} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl transition-colors">Create</button></div></div></div>)}
        </div>
    );
};
export default DevicesList;
