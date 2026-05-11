import React from 'react';
import { Monitor, Bell, LogOut } from 'lucide-react';

interface HeaderProps {
  onLogout?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onLogout }) => {
  const username = sessionStorage.getItem('admin_user') || 'admin';

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 shrink-0 z-10">
      <div className="flex items-center gap-3">
         <div className="bg-indigo-100 dark:bg-indigo-900/40 p-2 rounded-lg">
            <Monitor className="text-indigo-600 dark:text-indigo-400 w-5 h-5" />
         </div>
         <div>
            <h1 className="font-bold text-lg leading-tight">MyHWManager Server</h1>
            <p className="text-[10px] uppercase font-semibold text-gray-400 tracking-widest">Admin Dashboard</p>
         </div>
      </div>
      
      <div className="flex items-center gap-4">
         <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-full relative">
            <Bell className="w-4 h-4" />
            <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
         </button>
         <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 border-2 border-white dark:border-gray-800 shadow-sm flex items-center justify-center text-white text-xs font-bold">
               {username.charAt(0).toUpperCase()}
            </div>
            {onLogout && (
               <button onClick={onLogout} className="p-2 text-gray-400 hover:text-red-500 bg-gray-100 dark:bg-gray-800 rounded-full transition-colors" title="Logout">
                  <LogOut className="w-4 h-4" />
               </button>
            )}
         </div>
      </div>
    </header>
  );
};

export default Header;
