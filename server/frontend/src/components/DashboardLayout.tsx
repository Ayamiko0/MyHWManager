import React, { useState, useMemo } from "react";
import { HardwareInfo, RealtimeStats } from "../types";

interface DashboardLayoutProps {
    hardwareInfo: HardwareInfo | null;
    realtime: RealtimeStats | null;
    loading: boolean;
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ hardwareInfo, realtime, loading }) => {
    const [activeCardId, setActiveCardId] = useState<string | null>(null);

    const tempsSorted = useMemo(() => {
        if (!realtime) return { cpu: [], disk: [], net: [], board: [] };
        const temps = realtime.temps || [];
        const filterTemps = (keywords: string[]) => temps.filter(t => keywords.some(k => t.label.toLowerCase().includes(k)));
    
        const cpu = filterTemps(['coretemp', 'k10temp', 'cpu', 'package']);
        const disk = filterTemps(['nvme', 'disk', 'ssd', 'hdd']);
        const net = filterTemps(['wifi', 'iwl', 'mac']);
        
        const allFiltered = [...cpu, ...disk, ...net];
        const board = temps.filter(t => !allFiltered.some(f => f.label === t.label));
    
        return { cpu, disk, net, board };
    }, [realtime]);

    const toggleCard = (id: string) => setActiveCardId(prev => prev === id ? null : id);

    if (loading && !hardwareInfo) {
        return (
            <div className="flex-1 flex justify-center items-center">
               <div className="animate-pulse flex flex-col items-center">
                 <div className="h-12 w-12 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin mb-4"></div>
                 <p className="text-indigo-600 font-medium tracking-widest uppercase">Connecting to Node...</p>
               </div>
            </div>
        );
    }

    if (!hardwareInfo) return null;

    // Card Inner Renderers
    const renderOsCard = (isDetail: boolean) => (
      <div className="flex flex-col h-full">
        <div className="text-2xl font-bold mt-auto pb-2">{hardwareInfo.os_name}</div>
        {isDetail && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 animate-fade-in flex flex-col gap-3">
            <div className="flex justify-between"><span className="text-gray-500">Kernel Version</span><span className="font-mono dark:text-gray-300">{hardwareInfo.os_version}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Hostname</span><span className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded dark:text-gray-200">{hardwareInfo.host_name}</span></div>
            {tempsSorted.board.length > 0 && (
               <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Board Sensors</p>
                  <div className="flex flex-wrap gap-2">
                    {tempsSorted.board.map((t, idx) => (
                      <div key={idx} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md px-2 py-1 flex gap-2 text-xs">
                        <span className="text-gray-500 truncate max-w-[150px]" title={t.label}>{t.label}</span>
                        <span className={`font-semibold shrink-0 ${t.temperature > 85 ? 'text-red-500' : t.temperature > 65 ? 'text-orange-500' : 'text-green-500'}`}>{t.temperature.toFixed(1)}°C</span>
                      </div>
                    ))}
                  </div>
               </div>
            )}
          </div>
        )}
      </div>
    );
  
    const renderCpuCard = (isDetail: boolean) => (
      <div className="flex flex-col h-full">
        <div className="text-lg font-bold truncate mb-3" title={hardwareInfo.cpu_name}>{hardwareInfo.cpu_name}</div>
        {realtime && (
          <div className="mt-auto">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500 dark:text-gray-400">Total Usage</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{realtime.global_cpu_usage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-3">
              <div className="bg-indigo-600 h-3 rounded-full transition-all duration-300" style={{ width: `${Math.min(realtime.global_cpu_usage, 100)}%` }}></div>
            </div>
          </div>
        )}
        
        {isDetail && realtime && (
          <div className="animate-fade-in mt-6 border-t border-gray-100 dark:border-gray-800 pt-6">
            <p className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Thread Matrix</p>
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 mb-8">
              {realtime.cpu_cores.map((core, i) => (
                <div key={i} className="bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-lg p-2 flex flex-col items-center justify-center relative overflow-hidden group">
                   <div className="absolute bottom-0 left-0 w-full bg-indigo-500/20 dark:bg-indigo-600/30 transition-all duration-300 z-0" style={{ height: `${Math.min(core.usage, 100)}%` }}></div>
                   <span className="text-[10px] text-gray-500 font-semibold z-10">Thread {i}</span>
                   <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 z-10">{core.usage.toFixed(0)}%</span>
                </div>
              ))}
            </div>
  
            {tempsSorted.cpu.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">CPU Sensors</p>
                <div className="flex flex-wrap gap-2">
                  {tempsSorted.cpu.map((sens, idx) => (
                    <div key={idx} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md px-3 py-1.5 flex gap-2 text-sm shadow-sm">
                      <span className="text-gray-500">{sens.label}</span>
                      <span className={`font-bold shrink-0 ${sens.temperature > 85 ? 'text-red-500' : sens.temperature > 65 ? 'text-orange-500' : 'text-green-500'}`}>{sens.temperature.toFixed(1)}°C</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  
    const renderGpuCard = (isDetail: boolean) => (
      <div className="flex flex-col h-full">
        <div className="text-lg font-bold mt-auto pb-2 truncate" title={hardwareInfo.gpu_name}>{hardwareInfo.gpu_name}</div>
        {isDetail && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 animate-fade-in flex flex-col gap-3 text-sm">
            <div className="bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-400 p-3 rounded-lg border border-orange-100 dark:border-orange-900 text-xs italic mb-2">
              Note: Remote GPU telemetry via WebSocket requires elevated capabilities on client.
            </div>
            <div className="flex justify-between"><span className="text-gray-500">Utilization</span><span className="font-mono text-gray-400">N/A</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Temperature</span><span className="font-mono text-gray-400">N/A</span></div>
          </div>
        )}
      </div>
    );
  
    const renderRamCard = (isDetail: boolean) => (
      <div className="flex flex-col h-full">
        {realtime && hardwareInfo ? (
          <div className="mt-auto">
            <div className="flex items-end gap-2 mb-2">
              <span className="text-3xl font-black text-gray-800 dark:text-gray-100">{formatBytes(realtime.used_memory)}</span>
              <span className="text-gray-400 text-sm mb-1">/ {formatBytes(hardwareInfo.total_memory)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500">Used</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">{((realtime.used_memory / hardwareInfo.total_memory) * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-3">
              <div className="bg-blue-500 h-3 rounded-full transition-all duration-300" style={{ width: `${(realtime.used_memory / hardwareInfo.total_memory) * 100}%` }}></div>
            </div>
          </div>
        ) : null}
  
        {isDetail && hardwareInfo && (
          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 animate-fade-in flex flex-col gap-3 text-sm">
            <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-400 p-3 rounded-lg border border-blue-100 dark:border-blue-900 text-xs mb-2">
              Some memory hardware specifics require ROOT execution on Client.
            </div>
            <div className="flex justify-between"><span className="text-gray-500">Total Installed</span><span className="font-bold dark:text-gray-200">{formatBytes(hardwareInfo.total_memory)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Available</span><span className="font-bold text-green-600 dark:text-green-400">{formatBytes(hardwareInfo.total_memory - (realtime?.used_memory || 0))}</span></div>
          </div>
        )}
      </div>
    );
  
    const renderNetworkCard = (isDetail: boolean) => (
      <div className="flex flex-col h-full">
        <div className="grid grid-cols-2 gap-4 mt-auto py-2">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1 mb-1 whitespace-nowrap">
              <span className="w-2 h-2 bg-green-500 rounded-full inline-block"></span> Download
            </span>
            <span className="text-lg lg:text-xl font-bold dark:text-gray-200 whitespace-nowrap overflow-hidden text-ellipsis">{realtime ? formatBytes(realtime.network.download_bytes_per_sec) : '0 B'}/s</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1 mb-1 whitespace-nowrap">
              <span className="w-2 h-2 bg-blue-500 rounded-full inline-block"></span> Upload
            </span>
            <span className="text-lg lg:text-xl font-bold dark:text-gray-200 whitespace-nowrap overflow-hidden text-ellipsis">{realtime ? formatBytes(realtime.network.upload_bytes_per_sec) : '0 B'}/s</span>
          </div>
        </div>
        
        {isDetail && tempsSorted.net.length > 0 && (
           <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 animate-fade-in flex flex-col gap-3">
             <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Network Sensors</p>
             <div className="flex flex-wrap gap-2">
              {tempsSorted.net.map((sens, idx) => (
                <div key={idx} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md px-2 py-1 flex gap-2 text-xs">
                  <span className="text-gray-500">{sens.label}</span>
                  <span className={`font-semibold shrink-0 ${sens.temperature > 85 ? 'text-red-500' : sens.temperature > 65 ? 'text-orange-500' : 'text-green-500'}`}>{sens.temperature.toFixed(1)}°C</span>
                </div>
              ))}
             </div>
           </div>
        )}
      </div>
    );
  
    const renderStorageCard = (isDetail: boolean) => (
      <div className="flex flex-col h-full">
         {!isDetail ? (
            <div className="grid grid-cols-1 gap-2 mt-auto">
               <div className="text-2xl font-bold">{hardwareInfo.disks.length} Partitions</div>
               <p className="text-xs text-gray-500 max-w-[200px] truncate" title="Expand to view">Expand device to view partition layout...</p>
            </div>
         ) : (
            <div className="flex flex-col gap-4 mt-2 animate-fade-in">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {hardwareInfo.disks.map((disk, idx) => {
                    const used = disk.total_space - disk.available_space;
                    const ratio = disk.total_space ? (used/disk.total_space)*100 : 0;
                    return (
                      <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 rounded-xl flex flex-col shadow-sm">
                          <div className="flex justify-between items-center mb-3">
                            <span className="font-bold truncate text-sm flex items-center gap-2">
                               💿 {disk.name || 'Drive'}
                            </span>
                            <span className="text-xs shrink-0 bg-gray-100 dark:bg-gray-700 text-gray-500 px-2 py-0.5 rounded font-mono border dark:border-gray-600">{disk.mount_point}</span>
                          </div>
                          <div className="mt-auto">
                            <div className="flex justify-between text-xs mb-1 text-gray-500">
                               <span>{formatBytes(used)}</span>
                               <span className="font-semibold text-gray-800 dark:text-gray-300">{formatBytes(disk.total_space)}</span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full transition-all ${ratio > 90 ? 'bg-red-500' : ratio > 75 ? 'bg-orange-500' : 'bg-green-500'}`} style={{width: `${ratio}%`}}></div>
                            </div>
                          </div>
                      </div>
                    )
                  })}
               </div>
  
               {tempsSorted.disk.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Storage Sensors</p>
                    <div className="flex flex-wrap gap-2">
                      {tempsSorted.disk.map((sens, idx) => (
                        <div key={idx} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md px-3 py-1.5 flex gap-2 text-sm shadow-sm relative overflow-hidden max-w-[280px]">
                          <span className="text-gray-500 truncate" title={sens.label}>{sens.label}</span>
                          <span className={`font-bold shrink-0 ${sens.temperature > 85 ? 'text-red-500' : sens.temperature > 65 ? 'text-orange-500' : 'text-green-500'} flex-shrink-0`}>{sens.temperature.toFixed(1)}°C</span>
                        </div>
                      ))}
                    </div>
                  </div>
               )}
            </div>
         )}
      </div>
    );
  
    const CARDS = [
      { id: 'os', title: 'Operating System', live: false, render: renderOsCard },
      { id: 'cpu', title: 'Processor', live: true, render: renderCpuCard },
      { id: 'gpu', title: 'Graphics', live: false, render: renderGpuCard },
      { id: 'ram', title: 'Memory', live: true, render: renderRamCard },
      { id: 'network', title: 'Network I/O', live: true, render: renderNetworkCard },
      { id: 'storage', title: 'Storage', live: false, render: renderStorageCard }
    ];

    return (
        <div className="flex-1 flex flex-col relative w-full h-full">
          {activeCardId === null ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 overflow-y-auto pb-6 custom-scrollbar h-full auto-rows-max">
               {CARDS.map(card => (
                  <div key={card.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col transition-all min-h-[180px]">
                    <div className="p-5 lg:p-6 flex flex-col flex-1 h-full">
                       <div className="flex justify-between items-start mb-4 gap-2">
                          <h2 className="text-[11px] lg:text-sm font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{card.title}</h2>
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                             {card.live && (
                                <div className="text-[9px] lg:text-[10px] whitespace-nowrap uppercase tracking-wide text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/40 px-1.5 py-0.5 lg:px-2 lg:py-1 rounded-sm font-bold flex items-center gap-1 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                  LIVE
                                </div>
                             )}
                             <button onClick={() => toggleCard(card.id)} className="text-[10px] lg:text-xs whitespace-nowrap shrink-0 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 px-2 py-1 lg:px-2.5 lg:py-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-semibold transition-colors">
                                Expand
                             </button>
                          </div>
                       </div>
                       {card.render(false)}
                    </div>
                  </div>
               ))}
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6 h-full pb-2">
               <div className="w-full lg:w-1/3 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar h-full shrink-0">
                  <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 pl-2 shrink-0">Components</div>
                  {CARDS.map(card => {
                    const isActive = activeCardId === card.id;
                    return (
                        <div 
                          key={card.id} 
                          onClick={() => toggleCard(card.id)}
                          className={`rounded-2xl shrink-0 border transition-all cursor-pointer overflow-hidden relative ${isActive ? 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800 shadow-md ring-1 ring-indigo-500/20' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700/50 shadow-sm opacity-90 hover:opacity-100'}`}
                        >
                          {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>}
                          <div className="p-4 flex flex-col h-full pl-5">
                            <div className="flex justify-between items-center mb-2 gap-2">
                                <h2 className={`text-[10px] lg:text-xs font-bold uppercase tracking-wider whitespace-nowrap truncate ${isActive ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`}>{card.title}</h2>
                                {card.live && !isActive && <span className="w-2 h-2 shrink-0 rounded-full bg-green-500 animate-pulse"></span>}
                            </div>
                            <div className={`scale-95 origin-left ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                                {card.render(false)}
                            </div>
                          </div>
                        </div>
                    );
                  })}
               </div>
               <div className="w-full lg:w-2/3 bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-y-auto flex flex-col relative custom-scrollbar animate-fade-in h-full">
                  <button 
                    onClick={() => setActiveCardId(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-full p-2 transition-colors z-10 shrink-0"
                  >
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                  <div className="p-6 lg:p-8 flex flex-col h-full">
                     <div className="mb-6 pr-8 shrink-0">
                       <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex flex-wrap items-center gap-3">
                         <span>{CARDS.find(c => c.id === activeCardId)?.title}</span>
                         {CARDS.find(c => c.id === activeCardId)?.live && (
                             <span className="inline-block text-[10px] uppercase tracking-wide text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/40 px-2 py-1 rounded-sm font-bold border border-green-200 dark:border-green-800 whitespace-nowrap shrink-0">LIVE</span>
                         )}
                       </h2>
                     </div>
                     <div className="flex-1 shrink-0">
                        {CARDS.find(c => c.id === activeCardId)?.render(true)}
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>
    );
};

export default DashboardLayout;
