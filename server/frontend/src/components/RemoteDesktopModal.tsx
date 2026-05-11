import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Maximize2, Monitor, Wifi, WifiOff } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useTranslation } from 'react-i18next';

interface RemoteDesktopModalProps {
    sessionId: string;
    onClose: () => void;
    deviceName: string;
}

const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const RemoteDesktopModal: React.FC<RemoteDesktopModalProps> = ({ sessionId, onClose, deviceName }) => {
    const { t } = useTranslation();
    const imgRef = useRef<HTMLImageElement>(null);
    const wsRef  = useRef<WebSocket | null>(null);

    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
    const [statusMsg, setStatusMsg] = useState('Waiting for client to accept…');

    // ── Cleanup ───────────────────────────────────────────────────────────────
    const cleanup = useCallback(() => {
        wsRef.current?.close();
        wsRef.current = null;
    }, []);

    // ── Setup WebRTC Viewer ────────────────────────────────────────────────────
    useEffect(() => {
        const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/ws/rtc/signal/${sessionId}?role=viewer`;

        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'blob';
        wsRef.current = ws;

        let prevUrl: string | null = null;

        ws.onmessage = (e) => {
            // Binary frames arrive as Blob (JPEG image data)
            if (e.data instanceof Blob) {
                if (imgRef.current) {
                    const url = URL.createObjectURL(e.data);
                    imgRef.current.src = url;
                    // Revoke the previous URL to free memory
                    if (prevUrl) URL.revokeObjectURL(prevUrl);
                    prevUrl = url;
                    if (status !== 'connected') {
                        setStatus('connected');
                        setStatusMsg('Connected');
                    }
                }
                return;
            }

            // Text messages are JSON control messages
            try {
                const msg = JSON.parse(e.data as string);
                if (msg.type === 'ready') {
                    setStatus('connected');
                    setStatusMsg('Connected');
                }
            } catch {
                // ignore
            }
        };

        ws.onerror = () => {
            setStatus('error');
            setStatusMsg('Signaling WebSocket error');
        };

        ws.onclose = () => {
            if (status !== 'connected') {
                setStatus('disconnected');
                setStatusMsg('Signaling closed before stream established');
            }
        };

        return () => cleanup();
    }, [sessionId]);

    const sendInput = useCallback((eventPayload: object) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'input', event: eventPayload }));
        }
    }, []);

    const handleFullscreen = () => {
        if (imgRef.current?.requestFullscreen) imgRef.current.requestFullscreen();
    };

    const handleClose = () => {
        cleanup();
        onClose();
    };

    // Status badge style
    const badgeClass =
        status === 'connected'   ? 'bg-green-900/60  text-green-400' :
        status === 'connecting'  ? 'bg-amber-900/60  text-amber-400  animate-pulse' :
                                   'bg-red-900/60    text-red-400';

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
            {/* ── Toolbar ── */}
            <div className="h-12 shrink-0 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 text-gray-200">
                <div className="flex items-center gap-3">
                    <Monitor className="w-4 h-4 text-indigo-400" />
                    <span className="font-semibold text-sm">{deviceName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badgeClass}`}>
                        {status === 'connected' ? <span className="flex items-center gap-1"><Wifi className="w-3 h-3" /> {t('online')}</span>
                         : status === 'connecting' ? t('connecting').toUpperCase()
                         : <span className="flex items-center gap-1"><WifiOff className="w-3 h-3" /> {t(status).toUpperCase()}</span>}
                    </span>
                    {status === 'connecting' && (
                        <span className="text-gray-500 text-xs">{statusMsg}</span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={handleFullscreen}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                        title="Fullscreen">
                        <Maximize2 className="w-4 h-4" />
                    </button>
                    <button onClick={handleClose}
                        className="p-2 hover:bg-red-900/50 hover:text-red-400 rounded-lg transition-colors"
                        title={t('endSession')}>
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ── Video Canvas ── */}
            <div className="flex-1 flex items-center justify-center bg-gray-950 relative overflow-hidden">
                <img
                    ref={imgRef}
                    tabIndex={0}
                    className="max-w-full max-h-full focus:outline-none"
                    onMouseMove={(e) => {
                        const rect = (e.target as HTMLImageElement).getBoundingClientRect();
                        sendInput({ type: 'mousemove', x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
                    }}
                    onMouseDown={(e) => sendInput({ type: 'mousedown', button: e.button })}
                    onMouseUp={(e) => sendInput({ type: 'mouseup', button: e.button })}
                    onKeyDown={(e) => { e.preventDefault(); sendInput({ type: 'keydown', key: e.key, code: e.code }); }}
                    onKeyUp={(e) => { e.preventDefault(); sendInput({ type: 'keyup', key: e.key, code: e.code }); }}
                    style={{ cursor: 'none', display: status === 'connected' ? 'block' : 'none' }}
                    draggable={false}
                />

                {/* Overlay while waiting */}
                {status !== 'connected' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-gray-400">
                        {status === 'connecting' && (
                            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        )}
                        {status === 'disconnected' && <WifiOff className="w-12 h-12 text-red-500" />}
                        {status === 'error'        && <WifiOff className="w-12 h-12 text-red-500" />}
                        <p className="text-sm font-medium text-center max-w-xs">{statusMsg}</p>
                        {status === 'connecting' && (
                            <p className="text-xs text-gray-600 text-center max-w-xs">
                                The client needs to accept the remote request and pick a screen to share.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RemoteDesktopModal;
