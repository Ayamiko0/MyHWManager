import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Terminal as TerminalIcon } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { API_BASE_URL } from '../config';
import { useTranslation } from 'react-i18next';

interface TerminalModalProps {
    sessionId: string;
    onClose: () => void;
    deviceName: string;
}

const TerminalModal: React.FC<TerminalModalProps> = ({ sessionId, onClose, deviceName }) => {
    const { t } = useTranslation();
    const terminalRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

    // Setup Xterm and WebSocket
    useEffect(() => {
        if (!terminalRef.current) return;

        // 1. Initialize xterm
        const term = new Terminal({
            cursorBlink: true,
            theme: {
                background: '#0f172a', // Slate 900
                foreground: '#f8fafc',
                cursor: '#38bdf8',
            },
            fontFamily: '"Fira Code", monospace',
            fontSize: 14,
        });
        
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // 2. Setup WebSocket
        const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/ws/terminal/signal/${sessionId}?role=viewer`;

        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
            setStatus('connected');
            term.focus();
            
            // Send initial resize
            ws.send(JSON.stringify({
                type: 'resize',
                rows: term.rows,
                cols: term.cols
            }));
        };

        ws.onmessage = (e) => {
            if (e.data instanceof ArrayBuffer) {
                term.write(new Uint8Array(e.data));
            } else if (typeof e.data === 'string') {
                term.write(e.data);
            }
        };

        ws.onclose = () => setStatus('disconnected');
        ws.onerror = () => setStatus('error');

        // 3. Forward xterm input to WebSocket
        const disposable = term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        // 4. Handle window resize
        const handleResize = () => {
            fitAddon.fit();
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'resize',
                    rows: term.rows,
                    cols: term.cols
                }));
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            disposable.dispose();
            window.removeEventListener('resize', handleResize);
            ws.close();
            term.dispose();
        };
    }, [sessionId]);

    const handleClose = () => {
        wsRef.current?.close();
        onClose();
    };

    const badgeClass =
        status === 'connected'   ? 'bg-green-900/60  text-green-400' :
        status === 'connecting'  ? 'bg-amber-900/60  text-amber-400  animate-pulse' :
                                   'bg-red-900/60    text-red-400';

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-5xl h-full max-h-[800px] flex flex-col bg-[#0f172a] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <TerminalIcon className="w-5 h-5 text-sky-400" />
                        <div>
                            <h3 className="font-bold text-white tracking-wide text-sm flex items-center gap-2">
                                {deviceName}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase flex items-center gap-1.5 ${badgeClass}`}>
                                    {status === 'connected' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>}
                                    {t(status)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={handleClose} className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors group">
                            <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                        </button>
                    </div>
                </div>

                {/* Terminal Container */}
                <div className="flex-1 relative bg-[#0f172a] p-2 overflow-hidden flex">
                    {/* xterm attaches here */}
                    <div ref={terminalRef} className="flex-1 h-full w-full" />
                </div>
            </div>
        </div>
    );
};

export default TerminalModal;
