'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
  tabName?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class TabErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('TabErrorBoundary caught an error in tab:', this.props.tabName, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleClearLocalCache = () => {
    try {
      if (typeof window !== 'undefined') {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('netflow') || key.includes('template'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      }
    } catch (e) {
      console.warn('Could not clear local cache:', e);
    }
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 my-6 bg-slate-900 border border-rose-900/40 rounded-2xl text-center space-y-4 max-w-2xl mx-auto shadow-2xl">
          <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/20">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-100">
              حدث خطأ أثناء تحميل {this.props.tabName || 'هذا التبويب'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              تم رصد الخطأ وعزله لمنع توقف النظام كاملاً. يمكنك إعادة المحاولة أو استعادة القوالب الافتراضية.
            </p>
          </div>

          {this.state.error && (
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-left font-mono text-[11px] text-rose-300/90 overflow-x-auto max-h-32" dir="ltr">
              {this.state.error.message || 'Unknown error'}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-md shadow-sky-600/20"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة تشغيل التبويب</span>
            </button>

            <button
              onClick={this.handleClearLocalCache}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs flex items-center gap-1.5 transition border border-slate-700"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>استعادة القوالب الافتراضية وتنظيف الكاش</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
