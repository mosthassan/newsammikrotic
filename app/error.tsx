'use client';

import { useEffect } from 'react';
import { AlertOctagon, RefreshCw, Trash2, Home } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Root Error:', error);
  }, [error]);

  const handleClearAndReload = () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }
    } catch (e) {
      console.warn('Clear storage error:', e);
    }
    window.location.href = '/';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6 text-center" dir="rtl">
      <div className="w-16 h-16 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mb-4 border border-rose-500/20 shadow-xl">
        <AlertOctagon className="w-8 h-8" />
      </div>

      <h2 className="text-2xl font-black text-rose-500 mb-2">حدث خطأ أثناء تحميل الصفحة</h2>
      <p className="text-slate-400 mb-4 max-w-md text-sm leading-relaxed">
        نعتذر، حدث تعارض أثناء معالجة البيانات في المتصفح. يمكنك إعادة المحاولة أو استعادة ضبط النظام.
      </p>

      {error?.message && (
        <div className="p-3 mb-6 bg-slate-900 border border-slate-800 rounded-xl text-left font-mono text-xs text-rose-300 max-w-lg w-full overflow-x-auto" dir="ltr">
          {error.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg transition text-xs flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" />
          <span>إعادة المحاولة</span>
        </button>

        <button
          onClick={handleClearAndReload}
          className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition text-xs flex items-center gap-1.5 border border-slate-700"
        >
          <Trash2 className="w-4 h-4 text-amber-400" />
          <span>مسح الذاكرة المؤقتة والبدء من جديد</span>
        </button>

        <button
          onClick={() => { window.location.href = '/'; }}
          className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-bold rounded-xl transition text-xs flex items-center gap-1.5 border border-slate-800"
        >
          <Home className="w-4 h-4" />
          <span>الرئيسية</span>
        </button>
      </div>
    </div>
  );
}

