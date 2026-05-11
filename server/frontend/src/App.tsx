import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ThemeMode, LangKey } from './types';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import DeviceDetail from './pages/DeviceDetail';
import DevicesList from './pages/DevicesList';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import FileServer from './pages/FileServer';

// 15 minutes in milliseconds
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { i18n } = useTranslation();

  // Theme & Language State
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("theme") as ThemeMode) || "system");
  const [lang, setLang] = useState<LangKey>(() => (localStorage.getItem("language") as LangKey) || "en");

  const changeLanguage = (l: LangKey) => {
    i18n.changeLanguage(l);
    setLang(l);
    localStorage.setItem("language", l);
  };

  const handleSetTheme = (t: ThemeMode) => {
    setTheme(t);
    localStorage.setItem("theme", t);
  };

  // Apply Theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_user');
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem('admin_token');
    if (token) setIsAuthenticated(true);
  }, []);

  // Set up Axios Interceptor for 401 errors
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 401) {
          // Token is invalid
          handleLogout();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [handleLogout]);

  // Inactivity Timer
  useEffect(() => {
    if (!isAuthenticated) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.log("Logged out due to inactivity");
        handleLogout();
      }, INACTIVITY_TIMEOUT);
    };

    const events = ['mousemove', 'mousedown', 'keypress', 'DOMMouseScroll', 'mousewheel', 'touchmove', 'MSPointerMove'];
    events.forEach(evt => document.addEventListener(evt, resetTimer, true));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(evt => document.removeEventListener(evt, resetTimer, true));
    };
  }, [isAuthenticated, handleLogout]);

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <Router>
      <div className="h-screen w-full flex flex-col bg-gray-50 dark:bg-gray-950 font-sans overflow-hidden">
        <Header onLogout={handleLogout} />
        <div className="flex flex-1 overflow-hidden">
           <Sidebar />
           <main className="flex-1 overflow-hidden">
              <Routes>
                 <Route path="/" element={<Dashboard />} />
                 <Route path="/devices/:id" element={<DeviceDetail />} />
                 <Route path="/devices" element={<DevicesList />} />
                 <Route path="/files" element={<FileServer />} />
                 <Route path="/settings" element={<SettingsPage theme={theme} setTheme={handleSetTheme} lang={lang} changeLanguage={changeLanguage} />} />
              </Routes>
           </main>
        </div>
      </div>
    </Router>
  );
}

export default App;
