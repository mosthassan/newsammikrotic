export interface PushProgress {
  current: number;
  total: number;
  percentage: number;
  status: 'uploading' | 'verifying' | 'completed' | 'failed';
  message: string;
  added?: number;
  exists?: number;
  failed?: number;
  verifiedCount?: number;
  verified?: boolean;
  currentChunk?: number;
  totalChunks?: number;
}

export interface PushVouchersPayload {
  cards: Array<{
    code: string;
    name?: string;
    password?: string;
    profile?: string;
    limitBytesTotal?: string | number;
    limitUptime?: string;
    comment?: string;
  }>;
  batchComment: string;
  batchNumber?: string;
  routerConfig?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    useHttps?: boolean;
    timeoutMs?: number;
  };
}

export interface PushVouchersResult {
  success: boolean;
  total: number;
  added: number;
  alreadyExisted: number;
  failed: number;
  verified: boolean;
  verifiedCount: number;
  batchComment: string;
  errors?: Array<{ card?: string; error: string; code?: number }>;
  message?: string;
}

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

  // MikroTik Direct Push & Settings Sync
  pushVouchersToRouter: (payload: PushVouchersPayload) => Promise<PushVouchersResult>;
  onPushProgress: (callback: (progress: PushProgress) => void) => () => void;
  saveMikrotikSettings: (settings: any) => Promise<boolean>;
  getMikrotikSettings: () => Promise<any>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
