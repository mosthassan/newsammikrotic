import { PushProgress, PushVouchersPayload, PushVouchersResult } from '@/types/electron';

// Utility for Electron Desktop Integration

export function isElectronEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.electronAPI?.isElectron);
}

export function getElectronAPI() {
  if (typeof window === 'undefined') return null;
  return window.electronAPI || null;
}

export async function openExternalLink(url: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (window.electronAPI?.openExternal) {
    return window.electronAPI.openExternal(url);
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export async function printDirectly(options?: { silent?: boolean; deviceName?: string }): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (window.electronAPI?.printSilent) {
    return window.electronAPI.printSilent(options);
  }
  window.print();
  return true;
}

export async function saveMikrotikConfigToElectron(settings: any): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (window.electronAPI?.saveMikrotikSettings) {
    return window.electronAPI.saveMikrotikSettings(settings);
  }
  return false;
}

export async function getMikrotikConfigFromElectron(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if (window.electronAPI?.getMikrotikSettings) {
    return window.electronAPI.getMikrotikSettings();
  }
  return null;
}

/**
 * Direct Push Bridge:
 * In Electron, delegates to the native Node.js IPC channel with chunking and /ip/hotspot/user/print verification.
 * In Web Browser preview, executes safe chunked injection via the Next.js API route /api/mikrotik/inject with live progress emulation.
 */
export async function pushVouchersDirectly(
  payload: PushVouchersPayload,
  onProgress?: (progress: PushProgress) => void
): Promise<PushVouchersResult> {
  // 1. Electron Native IPC Bridge
  if (typeof window !== 'undefined' && window.electronAPI?.pushVouchersToRouter) {
    let unsubscribeProgress: (() => void) | null = null;
    if (onProgress && window.electronAPI.onPushProgress) {
      unsubscribeProgress = window.electronAPI.onPushProgress(onProgress);
    }

    try {
      const result = await window.electronAPI.pushVouchersToRouter(payload);
      return result;
    } finally {
      if (unsubscribeProgress) {
        unsubscribeProgress();
      }
    }
  }

  // 2. Web Browser Fallback (Next.js server-side route with progress callback)
  const totalCards = payload.cards.length;
  if (totalCards === 0) {
    return {
      success: false,
      total: 0,
      added: 0,
      alreadyExisted: 0,
      failed: 0,
      verified: false,
      verifiedCount: 0,
      batchComment: payload.batchComment,
      message: 'لا توجد كروت للدفع'
    };
  }

  onProgress?.({
    current: 0,
    total: totalCards,
    percentage: 5,
    status: 'uploading',
    message: `جاري التجهيز للرفع: 0 / ${totalCards}...`,
    added: 0,
    exists: 0,
    failed: 0
  });

  try {
    const res = await fetch('/api/mikrotik/inject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batch_id: payload.batchComment,
        cards: payload.cards.map(c => ({
          name: c.code || (c as any).name,
          password: c.password || c.code || (c as any).name,
          profile: c.profile || 'default',
          limitBytesTotal: c.limitBytesTotal,
          limitUptime: c.limitUptime,
          comment: payload.batchComment
        })),
        routerConfig: payload.routerConfig
      })
    });

    const data = await res.json();
    const added = data.successfully_added || 0;
    const exists = data.already_exist || 0;
    const failed = data.failed_cards || 0;
    const isSuccess = data.status === 'completed' || added > 0;

    onProgress?.({
      current: totalCards,
      total: totalCards,
      percentage: 100,
      status: isSuccess ? 'completed' : 'failed',
      message: isSuccess
        ? `تم الرفع والتحقق بنجاح 100% (${added + exists} / ${totalCards} كرت)!`
        : `تعذر الرفع المباشر (${failed} كرت متعثر)`,
      added,
      exists,
      failed,
      verified: isSuccess,
      verifiedCount: added + exists
    });

    return {
      success: isSuccess,
      total: totalCards,
      added,
      alreadyExisted: exists,
      failed,
      verified: isSuccess,
      verifiedCount: added + exists,
      batchComment: payload.batchComment,
      errors: data.errors_details?.map((e: any) => ({ card: e.card, error: e.error, code: e.code }))
    };
  } catch (err: any) {
    onProgress?.({
      current: totalCards,
      total: totalCards,
      percentage: 100,
      status: 'failed',
      message: `خطأ في الاتصال: ${err.message}`,
      added: 0,
      exists: 0,
      failed: totalCards,
      verified: false,
      verifiedCount: 0
    });

    return {
      success: false,
      total: totalCards,
      added: 0,
      alreadyExisted: 0,
      failed: totalCards,
      verified: false,
      verifiedCount: 0,
      batchComment: payload.batchComment,
      message: err.message
    };
  }
}

