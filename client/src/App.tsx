import { useState, useEffect, useRef } from "react";
import RemotePermissionModal from "./components/RemotePermissionModal";
import ClientFileManager from "./components/ClientFileManager";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { HardwareInfo, RealtimeStats, ThemeMode, LangKey } from "./types";
import Header from "./components/Header";
import DashboardLayout from "./components/DashboardLayout";
import ClientFilesTab from "./components/ClientFilesTab";
import "./App.css";

function App() {
  const { t, i18n } = useTranslation();
  
  // App Data State
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [realtime, setRealtime] = useState<RealtimeStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Theme & Lang State
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("theme") as ThemeMode) || "system");
  const [lang, setLang] = useState<LangKey>(() => (localStorage.getItem("language") as LangKey) || "en");

  // Server Connection State
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);

  // Persistent Client ID
  const [clientId] = useState<string>(() => {
     let id = localStorage.getItem("client_id");
     if (!id) {
         id = "client-" + crypto.randomUUID();
         localStorage.setItem("client_id", id);
     }
     return id;
  });

  const [serverIp, setServerIp] = useState<string>(() => localStorage.getItem("server_ip") || "");
  const [pinInput, setPinInput] = useState("");
  const [ipInput, setIpInput] = useState("localhost:8080");

  // Remote Desktop State
  const [showPairModal, setShowPairModal] = useState(false);
  const [remoteRequest, setRemoteRequest] = useState<{ sessionId: string } | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const rtcSigWsRef = useRef<WebSocket | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'files'>('dashboard');

  const connectWebSocket = (ip: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;
      setConnectionStatus("connecting");
      const agentToken = localStorage.getItem("agent_token") || "";
      const ws = new WebSocket(`ws://${ip}/ws/ingest/${clientId}?token=${agentToken}`);
      ws.onopen = () => setConnectionStatus("connected");
      ws.onclose = () => setConnectionStatus("disconnected");
      ws.onerror = () => setConnectionStatus("disconnected");
      
      ws.onmessage = (event) => {
          try {
              const data = JSON.parse(event.data);
              if (data.type === "remote_request") {
                  setRemoteRequest({ sessionId: data.session_id });
              } else if (data.type === "terminal_request") {
                  handleStartTerminal(data.session_id);
              } else if (data.type === "fs_request") {
                  handleFsRequest(data);
              }
          } catch (e) {
              console.error("Failed to parse WS message", e);
          }
      };

      wsRef.current = ws;
  };

  const handlePairSubmit = async () => {
     if (!hardwareInfo) return;
     setConnectionStatus("connecting");
     try {
        const res = await fetch(`http://${ipInput}/api/pair`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({
              client_id: clientId,
              pin: pinInput,
              name: hardwareInfo.host_name,
              os: hardwareInfo.os_name,
              cpu_name: hardwareInfo.cpu_name,
              ram_total: hardwareInfo.total_memory,
              hardware_data: JSON.stringify(hardwareInfo)
           })
        });
        
        if (!res.ok) {
           const errData = await res.json();
           throw new Error(errData.error || "Pairing failed");
        }
        
        // Save agent token from server response
        const data = await res.json();
        if (data.agent_token) {
            localStorage.setItem("agent_token", data.agent_token);
        }
        
        localStorage.setItem("server_ip", ipInput);
        setServerIp(ipInput);
        setPinInput("");
        connectWebSocket(ipInput);

     } catch (e: any) {
        console.error("Link error:", e);
        setConnectionStatus("disconnected");
        alert("Pairing failed: " + e.message);
     }
  }

  // Auto-connect and retry every 30 seconds if disconnected
  useEffect(() => {
      let interval: ReturnType<typeof setInterval>;

      const attemptConnection = () => {
          if (serverIp && hardwareInfo && (connectionStatus === "disconnected" || wsRef.current?.readyState !== WebSocket.OPEN)) {
              connectWebSocket(serverIp);
          }
      };

      if (serverIp && hardwareInfo) {
          attemptConnection(); // Initial attempt
          interval = setInterval(attemptConnection, 30000); // Retry every 30s
      }

      return () => clearInterval(interval);
  }, [serverIp, hardwareInfo, connectionStatus]);

  // Sync Theme logic
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Sync Lang Logic
  const changeLanguage = (newLang: LangKey) => {
     setLang(newLang);
     i18n.changeLanguage(newLang);
     localStorage.setItem("language", newLang);
  };

  const streamRef = useRef<MediaStream | null>(null);
  const captureIntervalRef = useRef<number | null>(null);

  const stopRtcSession = () => {
     if (captureIntervalRef.current) {
         clearInterval(captureIntervalRef.current);
         captureIntervalRef.current = null;
     }
     if (streamRef.current) {
         streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
         streamRef.current = null;
     }
     rtcSigWsRef.current?.close();
     rtcSigWsRef.current = null;
  };

  const handleAcceptRemote = async () => {
     if (!remoteRequest || !serverIp) return;
     const { sessionId } = remoteRequest;
     setRemoteRequest(null);

     try {
         // 1. Prompt XDG Portal / Screen Selection (low framerate to reduce load)
         const stream = await (navigator.mediaDevices as any).getDisplayMedia({
             video: { frameRate: { ideal: 5, max: 10 }, cursor: "always" },
             audio: false,
         });
         streamRef.current = stream;

         // 2. Connect to Signaling/Streaming server (binary mode)
         const sigWs = new WebSocket(`ws://${serverIp}/ws/rtc/signal/${sessionId}?role=client`);
         sigWs.binaryType = "arraybuffer";
         rtcSigWsRef.current = sigWs;

         // 3. Setup Video and Canvas for MJPEG extraction
         const video = document.createElement("video");
         video.autoplay = true;
         video.playsInline = true;
         video.muted = true;
         video.srcObject = stream;

         const SCALE = 0.5; // 50% resolution to reduce memory
         const canvas = document.createElement("canvas");
         const ctx = canvas.getContext("2d");

         // Wait for video to be ready before starting capture
         let videoReady = false;
         let wsReady = false;
         let capturing = false; // guard against overlapping captures

         const startCapture = () => {
             if (!videoReady || !wsReady || captureIntervalRef.current) return;
             const w = Math.round(video.videoWidth * SCALE);
             const h = Math.round(video.videoHeight * SCALE);
             canvas.width = w;
             canvas.height = h;
             console.log(`[MJPEG] Starting capture: ${w}x${h} @ 5fps`);
             sigWs.send(JSON.stringify({ type: "ready", width: w, height: h }));
             
             captureIntervalRef.current = window.setInterval(() => {
                 if (sigWs.readyState !== WebSocket.OPEN || !ctx || video.videoWidth === 0 || capturing) return;
                 capturing = true;
                 ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                 // Use toBlob() — avoids creating huge base64 strings in JS memory
                 canvas.toBlob((blob) => {
                     capturing = false;
                     if (blob && sigWs.readyState === WebSocket.OPEN) {
                         sigWs.send(blob);
                     }
                 }, "image/jpeg", 0.4);
             }, 1000 / 5); // 5 fps — gentle on WebKit memory
         };

         video.onloadedmetadata = () => {
             video.play().then(() => {
                 videoReady = true;
                 startCapture();
             }).catch(err => console.error("[MJPEG] video.play() failed:", err));
         };

         // 4. Start capture when WebSocket is open AND video is ready
         sigWs.onopen = () => {
             wsReady = true;
             startCapture();
         };

         // 5. Handle incoming input events from Admin
         sigWs.onmessage = async (e) => {
             const msg = JSON.parse(e.data);
             if (msg.type === "input" && msg.event) {
                 await invoke("simulate_input", { event: msg.event });
             }
         };

         // 6. Cleanup
         sigWs.onclose = () => stopRtcSession();
         sigWs.onerror  = () => setRemoteError("Streaming connection failed.");
         stream.getVideoTracks()[0].onended = () => stopRtcSession(); // User clicked "Stop Sharing" on the floating bar

     } catch (e: any) {
         console.error("Screen capture error:", e);
         if (e?.name === "NotAllowedError") {
             setRemoteError("Screen sharing permission denied. Please allow it in the system dialog.");
         } else {
             setRemoteError(String(e));
         }
         stopRtcSession();
     }
  };

  const handleRejectRemote = () => {
     setRemoteRequest(null);
     stopRtcSession();
  };

  // --- FS Request Logic ---
  const handleFsRequest = async (request: any) => {
      try {
          const res = await invoke("handle_fs_request", { request });
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify(res));
          }
      } catch (err: any) {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                  type: "fs_response",
                  request_id: request.request_id,
                  error: err.toString()
              }));
          }
      }
  };

  // --- Terminal (PTY) Logic ---
  const termWsRef = useRef<WebSocket | null>(null);

  const handleStartTerminal = async (sessionId: string) => {
      if (!serverIp) return;
      try {
          const ws = new WebSocket(`ws://${serverIp}/ws/terminal/signal/${sessionId}?role=client`);
          ws.binaryType = "arraybuffer";
          termWsRef.current = ws;

          ws.onopen = async () => {
              console.log("[PTY] Connected to terminal relay. Spawning PTY...");
              await invoke("spawn_pty");
          };

          ws.onmessage = async (e) => {
              if (typeof e.data === "string") {
                  try {
                      const msg = JSON.parse(e.data);
                      if (msg.type === "resize") {
                          await invoke("resize_pty", { rows: msg.rows, cols: msg.cols });
                          return;
                      }
                  } catch {
                      await invoke("write_pty", { data: e.data });
                  }
              } else {
                  const text = new TextDecoder().decode(e.data);
                  await invoke("write_pty", { data: text });
              }
          };

          ws.onclose = async () => {
              console.log("[PTY] Disconnected. Killing PTY...");
              await invoke("kill_pty");
              termWsRef.current = null;
          };

          ws.onerror = async () => {
              console.error("[PTY] Relay error. Killing PTY...");
              await invoke("kill_pty");
          };

      } catch (err) {
          console.error("[PTY] Setup failed", err);
      }
  };

  // Hardware Fetching logic
  useEffect(() => {
    async function fetchHardwareInfo() {
      setLoading(true);
      try {
        const info = await invoke<HardwareInfo>("get_hardware_info");
        setHardwareInfo(info);
      } catch (e) {
        console.error("Failed to fetch static hardware info:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchHardwareInfo();

    let isMounted = true;
    let unlistenTelemetry: (() => void) | null = null;
    let unlistenPty: (() => void) | null = null;

    const setupListener = async () => {
      const ut = await listen<RealtimeStats>("hardware-telemetry", (event) => {
        setRealtime(event.payload);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(event.payload));
        }
      });
      if (isMounted) {
          unlistenTelemetry = ut;
      } else {
          ut();
      }

      const up = await listen<number[]>("pty_data", (event) => {
          if (termWsRef.current && termWsRef.current.readyState === WebSocket.OPEN) {
              const u8 = new Uint8Array(event.payload);
              termWsRef.current.send(u8);
          }
      });
      if (isMounted) {
          unlistenPty = up;
      } else {
          up();
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unlistenTelemetry) unlistenTelemetry();
      if (unlistenPty) unlistenPty();
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 bg-gray-50 dark:bg-gray-950 transition-colors duration-200 text-gray-800 dark:text-gray-100 font-sans relative">
       <Header 
         theme={theme} setTheme={setTheme} 
         lang={lang} changeLanguage={changeLanguage} 
         connectionStatus={connectionStatus}
         onConnect={() => setShowPairModal(true)}
       />
       
       {connectionStatus === 'connected' && (
           <div className="flex justify-center mb-6">
               <div className="flex bg-gray-200 dark:bg-gray-800 p-1 rounded-xl shadow-inner">
                   <button 
                       onClick={() => setActiveTab('dashboard')}
                       className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'dashboard' ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                   >
                       {t('dashboard')}
                   </button>
                   <button 
                       onClick={() => setActiveTab('files')}
                       className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'files' ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                   >
                       {t('files')}
                   </button>
               </div>
           </div>
       )}

       {activeTab === 'dashboard' || connectionStatus !== 'connected' ? (
           <DashboardLayout 
             hardwareInfo={hardwareInfo} 
             realtime={realtime} 
             loading={loading} 
           />
       ) : (
           <ClientFilesTab clientId={clientId} serverIp={serverIp} />
       )}

       {/* Remote Desktop Request Modal */}
       {remoteRequest && (
           <RemotePermissionModal 
               onAccept={handleAcceptRemote} 
               onReject={handleRejectRemote} 
           />
       )}

       {/* Remote Desktop Error Toast */}
       {remoteError && (
           <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] max-w-sm w-full px-4">
               <div className="bg-red-900/95 backdrop-blur border border-red-700 text-white rounded-2xl shadow-2xl p-4 flex gap-3 items-start animate-in slide-in-from-bottom duration-300">
                   <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                   <div className="flex-1">
                       <p className="font-bold text-sm">{t('remoteSessionFailed')}</p>
                       <p className="text-red-300 text-xs mt-1 whitespace-pre-wrap">{remoteError}</p>
                   </div>
                   <button onClick={() => setRemoteError(null)} className="text-red-400 hover:text-white transition-colors shrink-0">
                       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                   </button>
               </div>
           </div>
       )}

        {/* Pairing Modal */}
        {showPairModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-8 w-full max-w-sm flex flex-col relative animate-in fade-in zoom-in duration-200">
                <button onClick={() => setShowPairModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">{t('linkToServer')}</h3>
                <p className="text-xs text-gray-500 mb-6">{t('enterServerPin')}</p>

                <div className="mb-4">
                   <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">{t('serverAddress')}</label>
                   <input type="text" value={ipInput} onChange={e => setIpInput(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. 192.168.1.10:8080" />
                </div>

                <div className="mb-6">
                   <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-wider">{t('pairingPin')}</label>
                   <input type="text" value={pinInput} onChange={e => setPinInput(e.target.value)} maxLength={6} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-2xl tracking-widest text-center font-mono font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none focus:border-indigo-500 transition-colors" placeholder="000000" />
                </div>

                <button onClick={handlePairSubmit} disabled={pinInput.length !== 6 || !ipInput} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors">
                   {t('connect')}
                </button>
             </div>
          </div>
       )}
    </div>
  );
}

export default App;
