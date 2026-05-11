import React from "react";
import { useTranslation } from "react-i18next";
import { ThemeMode, LangKey } from "../types";

interface HeaderProps {
    theme: ThemeMode;
    setTheme: (t: ThemeMode) => void;
    lang: LangKey;
    changeLanguage: (l: LangKey) => void;
    connectionStatus: "disconnected" | "connecting" | "connected";
    onConnect: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, setTheme, lang, changeLanguage, connectionStatus, onConnect }) => {
    const { t } = useTranslation();

    return (
      <header className="mb-6 shrink-0 flex items-center justify-between bg-white dark:bg-gray-900 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 relative z-20">
        <div>
          <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
            {t('appLogo')}
          </h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mt-1">{t('appSubtitle')}</p>
        </div>

        {/* Global Toolbar */}
        <div className="flex gap-4 items-center">
            {/* Connect Button */}
            <div className="flex items-center">
               <button 
                 onClick={onConnect} 
                 disabled={connectionStatus !== "disconnected"}
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-wide font-bold transition-all border shadow-sm ${
                   connectionStatus === 'connected' 
                     ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-400 dark:border-green-800' 
                     : connectionStatus === 'connecting'
                     ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-800 cursor-not-allowed opacity-70'
                     : 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500'
                 }`}
               >
                 {connectionStatus === 'connected' ? (
                   <><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> {t('live')}</>
                 ) : connectionStatus === 'connecting' ? (
                   <><div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div> {t('pairing')}</>
                 ) : (
                   <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg> {t('linkServer')}</>
                 )}
               </button>
            </div>

            {/* Language Selector */}
            <div className="relative flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
              <select 
                 className="appearance-none bg-transparent hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-medium pl-3 pr-8 py-1.5 rounded-md outline-none cursor-pointer text-gray-700 dark:text-gray-300 transition-colors"
                 value={lang}
                 onChange={(e) => changeLanguage(e.target.value as LangKey)}
              >
                  <option value="en" className="dark:bg-gray-800 dark:text-gray-200">English</option>
                  <option value="vi" className="dark:bg-gray-800 dark:text-gray-200">Tiếng Việt</option>
                  <option value="ru" className="dark:bg-gray-800 dark:text-gray-200">Русский</option>
                  <option value="zh" className="dark:bg-gray-800 dark:text-gray-200">中文</option>
                  <option value="ja" className="dark:bg-gray-800 dark:text-gray-200">日本語</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center px-1 text-gray-500 dark:text-gray-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
              </div>
            </div>

            {/* Theme Toggle */}
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700 whitespace-nowrap">
              <button onClick={() => setTheme("light")} className={`px-2 md:px-3 py-1.5 text-xs font-medium rounded-md transition-shadow ${theme === 'light' ? 'bg-white shadow-sm text-indigo-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'}`}>{t('themeLight')}</button>
              <button onClick={() => setTheme("dark")} className={`px-2 md:px-3 py-1.5 text-xs font-medium rounded-md transition-shadow ${theme === 'dark' ? 'bg-white shadow-sm text-indigo-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'}`}>{t('themeDark')}</button>
              <button onClick={() => setTheme("system")} className={`px-2 md:px-3 py-1.5 text-xs font-medium rounded-md transition-shadow ${theme === 'system' ? 'bg-white shadow-sm text-indigo-600 dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'}`}>{t('themeSystem')}</button>
            </div>
        </div>
      </header>
    );
}

export default Header;
