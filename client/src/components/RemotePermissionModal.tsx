import React from 'react';
import { ShieldAlert, Check, X } from 'lucide-react';

interface RemotePermissionModalProps {
    onAccept: () => void;
    onReject: () => void;
}

const RemotePermissionModal: React.FC<RemotePermissionModalProps> = ({ onAccept, onReject }) => {

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/80 backdrop-blur-md p-4">
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl max-w-sm w-full border border-red-500/30 overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-red-500 p-6 flex flex-col items-center text-white">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 animate-pulse">
                        <ShieldAlert className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-center">Remote Access Request</h2>
                </div>
                <div className="p-6">
                    <p className="text-gray-600 dark:text-gray-300 text-sm text-center mb-6">
                        An administrator is requesting remote control of your device. Do you want to allow this connection?
                    </p>
                    <div className="flex gap-3">
                        <button 
                            onClick={onReject}
                            className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-sm transition-colors flex justify-center items-center gap-2"
                        >
                            <X className="w-4 h-4" /> Reject
                        </button>
                        <button 
                            onClick={onAccept}
                            className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-600/30 transition-all flex justify-center items-center gap-2"
                        >
                            <Check className="w-4 h-4" /> Allow
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RemotePermissionModal;
