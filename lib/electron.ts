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
