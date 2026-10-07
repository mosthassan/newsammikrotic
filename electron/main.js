const { app, BrowserWindow, shell, ipcMain, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const PORT = process.env.PORT || 3000;
const DEV_URL = `http://localhost:${PORT}`;

let mainWindow = null;

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function resolveAppIcon() {
  const possiblePaths = [
    path.join(__dirname, '../public/favicon.ico'),
    path.join(__dirname, '../public/icon-512.png'),
    path.join(__dirname, '../public/icon-192.png'),
  ];
  for (const iconPath of possiblePaths) {
    if (fs.existsSync(iconPath)) {
      return nativeImage.createFromPath(iconPath);
    }
  }
  return undefined;
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: 'حول طلقة نت' },
              { type: 'separator' },
              { role: 'services', label: 'الخدمات' },
              { type: 'separator' },
              { role: 'hide', label: 'إخفاء طلقة نت' },
              { role: 'hideOthers', label: 'إخفاء البرامج الأخرى' },
              { role: 'unhide', label: 'إظهار الكل' },
              { type: 'separator' },
              { role: 'quit', label: 'إنهاء البرنامج' },
            ],
          },
        ]
      : []),
    {
      label: 'ملف (File)',
      submenu: [
        {
          label: 'إعادة التحميل (Reload)',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.reload(),
        },
        {
          label: 'إعادة تحميل إجبارية (Force Reload)',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow && mainWindow.webContents.reloadIgnoringCache(),
        },
        { type: 'separator' },
        {
          label: 'طباعة سريعة (Print)',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow && mainWindow.webContents.print(),
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'إغلاق النافذة' } : { role: 'quit', label: 'خروج من النظام' },
      ],
    },
    {
      label: 'عرض (View)',
      submenu: [
        { role: 'resetZoom', label: 'إعادة ضبط الحجم (100%)' },
        { role: 'zoomIn', label: 'تكبير الشاشة' },
        { role: 'zoomOut', label: 'تصغير الشاشة' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'وضع ملء الشاشة' },
        ...(isDev
          ? [
              { type: 'separator' },
              {
                label: 'أدوات المطور (Developer Tools)',
                accelerator: 'CmdOrCtrl+Shift+I',
                click: () => mainWindow && mainWindow.webContents.toggleDevTools(),
              },
            ]
          : []),
      ],
    },
    {
      label: 'نافذة (Window)',
      submenu: [
        { role: 'minimize', label: 'تصغير' },
        { role: 'zoom', label: 'تكبير' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front', label: 'إحضار للأمام' },
              { type: 'separator' },
              { role: 'window', label: 'النافذة' },
            ]
          : [{ role: 'close', label: 'إغلاق' }]),
      ],
    },
    {
      label: 'مساعدة (Help)',
      submenu: [
        {
          label: 'التوثيق والدعم الفني',
          click: async () => {
            await shell.openExternal('https://mikrotik.com');
          },
        },
        {
          label: 'حول نظام طلقة نت',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'طلقة نت مانجر (Talqa Net Manager)',
              message: 'نظام طلقة نت لإدارة شبكات المايكروتك وتوليد الكروت v0.1.0',
              detail: 'تطبيق سطح مكتب هجين مبني باستخدام Electron.js و Next.js و React.\nجميع الحقوق محفوظة © 2026',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function loadDevServer(win, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await win.loadURL(DEV_URL);
      return;
    } catch (err) {
      if (i === maxAttempts - 1) {
        console.error('Failed to connect to dev server:', err);
        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
          <div style="font-family:sans-serif;padding:40px;text-align:center;direction:rtl;">
            <h2>تعذر الاتصال بخادم التطوير (Next.js Dev Server)</h2>
            <p>يرجى التأكد من تشغيل <code>npm run dev</code> على المنفذ ${PORT}.</p>
            <button onclick="location.reload()" style="padding:10px 20px;cursor:pointer;background:#0284c7;color:white;border:none;border-radius:6px;font-size:16px;">إعادة المحاولة</button>
          </div>
        `)}`);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}

function createWindow() {
  const appIcon = resolveAppIcon();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'طلقة نت مانجر - إدارة الشبكات وتوليد الكروت',
    icon: appIcon,
    backgroundColor: '#0a0f1d',
    show: false, // Prevents white flash before rendering
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  createApplicationMenu();

  // Graceful show on ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Window state notification to renderer
  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximize-changed', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximize-changed', false);
    }
  });

  // Ensure external links open in the user's default browser, not in the Electron shell
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isAppOrigin = url.startsWith(DEV_URL) || url.startsWith('file://');
    if (!isAppOrigin) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Load appropriate content
  if (isDev) {
    loadDevServer(mainWindow);
  } else {
    // Production: Check static output directory first, then fallback to local Next build
    const indexPath = path.join(__dirname, '../out/index.html');
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      // In standalone / server mode, load dev URL or local production server
      loadDevServer(mainWindow);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.on('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

ipcMain.handle('print-silent', async (_event, options = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: options.silent ?? false,
        printBackground: true,
        deviceName: options.deviceName || '',
        ...options,
      },
      (success, failureReason) => {
        if (!success) {
          console.warn('Electron print failed or canceled:', failureReason);
        }
        resolve(success);
      }
    );
  });
});

ipcMain.on('show-notification', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: resolveAppIcon() }).show();
  }
});

// App Lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
