export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  getVersion: () => Promise<string>;
  printSilent: (options?: { silent?: boolean; deviceName?: string }) => Promise<boolean>;
  showNotification: (title: string, body: string) => void;
  onWindowMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
