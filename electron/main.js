const { app, BrowserWindow, shell, ipcMain, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

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

  // Strip 'Electron' from User-Agent to avoid Google OAuth '403 disallowed_useragent' error
  try {
    const rawUa = mainWindow.webContents.userAgent;
    const cleanUa = rawUa.replace(/Electron\/\S+\s?/, '');
    mainWindow.webContents.setUserAgent(cleanUa);
  } catch (uaErr) {
    console.warn('Could not sanitize User-Agent:', uaErr);
  }

  // Handle window popups: allow Google OAuth & Firebase Auth popups to open natively,
  // while redirecting external links to the user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isAuthUrl =
      url.includes('accounts.google.com') ||
      url.includes('firebaseapp.com') ||
      url.includes('/__/auth/') ||
      url.includes('google.com/o/oauth2') ||
      url.includes('apis.google.com');

    if (isAuthUrl) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          autoHideMenuBar: true,
          title: 'تسجيل الدخول عبر Google',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      };
    }

    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isAppOrigin = url.startsWith(DEV_URL) || url.startsWith('file://');
    const isAuthUrl =
      url.includes('accounts.google.com') ||
      url.includes('firebaseapp.com') ||
      url.includes('/__/auth/') ||
      url.includes('google.com/o/oauth2');

    if (!isAppOrigin && !isAuthUrl) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Load appropriate content
  if (isDev) {
    loadDevServer(mainWindow);
  } else {
    // Production: Look for static export index.html across standard Electron package paths
    const candidatePaths = [
      path.join(__dirname, '../out/index.html'),
      path.join(__dirname, 'out/index.html'),
      path.join(app.getAppPath(), 'out/index.html'),
      path.join(process.resourcesPath || '', 'app/out/index.html'),
      path.join(process.resourcesPath || '', 'app.asar/out/index.html'),
    ];

    let foundIndexPath = null;
    for (const cand of candidatePaths) {
      if (cand && fs.existsSync(cand)) {
        foundIndexPath = cand;
        break;
      }
    }

    if (foundIndexPath) {
      mainWindow.loadFile(foundIndexPath);
    } else {
      // In server/standalone build or local serve mode, connect to server endpoint
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

// ==========================================
// MikroTik RouterOS Bridge & Direct Push Engine
// ==========================================

function getMikroTikSettingsFilePath() {
  return path.join(app.getPath('userData'), 'mikrotik-settings.json');
}

function loadSavedMikroTikSettings() {
  try {
    const filePath = getMikroTikSettingsFilePath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('Could not read saved MikroTik settings:', err);
  }
  return null;
}

function saveMikroTikSettingsToDisk(settings) {
  try {
    const filePath = getMikroTikSettingsFilePath();
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to write MikroTik settings:', err);
    return false;
  }
}

/**
 * Execute native HTTP/HTTPS request to MikroTik RouterOS v7 REST API.
 * Uses rejectUnauthorized: false to allow standard self-signed certificates on local router IPs.
 */
function sendMikroTikRequest({ host, port, useHttps, username, password, method, path: reqPath, body, timeoutMs = 8000 }) {
  return new Promise((resolve, reject) => {
    const isHttps = useHttps !== false && (port === 443 || useHttps === true);
    const lib = isHttps ? https : http;
    const authHeader = 'Basic ' + Buffer.from(`${username || 'mosthassan'}:${password || ''}`).toString('base64');
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

    const options = {
      hostname: host || 'router.samtecai.com',
      port: port || (isHttps ? 443 : 80),
      path: reqPath,
      method: method || 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      },
      timeout: timeoutMs,
      rejectUnauthorized: false, // Critical for self-signed certificates on MikroTik RouterOS
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 0, data });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`انتهت مهلة الاتصال بالراوتر (${host}:${port}) بعد ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Injects a single voucher card directly into RouterOS v7 (/rest/ip/hotspot/user)
 */
async function injectSingleCardDirect(card, batchComment, routerConfig) {
  const cardName = card.code || card.name;
  const payload = {
    name: cardName,
    password: card.password || cardName,
    profile: card.profile || 'default',
    comment: batchComment,
  };

  if (card.limitBytesTotal) {
    payload['limit-bytes-total'] = String(card.limitBytesTotal);
  }
  if (card.limitUptime) {
    payload['limit-uptime'] = String(card.limitUptime);
  }

  const endpointPath = '/rest/ip/hotspot/user';

  try {
    let res = await sendMikroTikRequest({
      ...routerConfig,
      method: 'PUT',
      path: endpointPath,
      body: payload,
      timeoutMs: routerConfig.timeoutMs || 8000,
    });

    if (res.statusCode === 404 || res.statusCode === 405) {
      res = await sendMikroTikRequest({
        ...routerConfig,
        method: 'POST',
        path: endpointPath,
        body: payload,
        timeoutMs: routerConfig.timeoutMs || 8000,
      });
    }

    if (res.statusCode === 201 || res.statusCode === 200) {
      return { card: cardName, status: 'added' };
    }

    const lowerData = (res.data || '').toLowerCase();
    if (
      res.statusCode === 400 &&
      (lowerData.includes('already exists') || lowerData.includes('duplicate') || lowerData.includes('already have user'))
    ) {
      return { card: cardName, status: 'already_exists' };
    }

    return {
      card: cardName,
      status: 'failed',
      error: `رفض الراوتر [${res.statusCode}]: ${res.data || 'خطأ غير معروف'}`,
    };
  } catch (err) {
    return {
      card: cardName,
      status: 'failed',
      error: err.message || 'خطأ في الاتصال بالراوتر',
    };
  }
}

/**
 * Post-upload verification: Queries RouterOS /ip/hotspot/user/print filtered by batch comment
 */
async function verifyRegisteredUsersDirect(routerConfig, batchComment) {
  // Method 1: POST /rest/ip/hotspot/user/print with query filter
  try {
    const res = await sendMikroTikRequest({
      ...routerConfig,
      method: 'POST',
      path: '/rest/ip/hotspot/user/print',
      body: { '?comment': batchComment },
      timeoutMs: 8000,
    });
    if (res.statusCode === 200) {
      const parsed = JSON.parse(res.data);
      if (Array.isArray(parsed)) return parsed.length;
    }
  } catch (e) {
    // continue to fallback
  }

  // Method 2: GET with query param /rest/ip/hotspot/user?comment=...
  try {
    const res = await sendMikroTikRequest({
      ...routerConfig,
      method: 'GET',
      path: `/rest/ip/hotspot/user?comment=${encodeURIComponent(batchComment)}`,
      timeoutMs: 8000,
    });
    if (res.statusCode === 200) {
      const parsed = JSON.parse(res.data);
      if (Array.isArray(parsed)) return parsed.length;
    }
  } catch (e) {
    // continue to fallback
  }

  // Method 3: GET /rest/ip/hotspot/user and filter locally
  try {
    const res = await sendMikroTikRequest({
      ...routerConfig,
      method: 'GET',
      path: '/rest/ip/hotspot/user',
      timeoutMs: 12000,
    });
    if (res.statusCode === 200) {
      const parsed = JSON.parse(res.data);
      if (Array.isArray(parsed)) {
        return parsed.filter((u) => u.comment === batchComment).length;
      }
    }
  } catch (e) {
    console.warn('Could not verify registered users on router:', e.message);
  }

  return -1;
}

// IPC Handlers for MikroTik
ipcMain.handle('save-mikrotik-settings', async (_event, settings) => {
  return saveMikroTikSettingsToDisk(settings);
});

ipcMain.handle('get-mikrotik-settings', async () => {
  return loadSavedMikroTikSettings();
});

ipcMain.handle('push-vouchers-to-router', async (event, payload) => {
  const { cards = [], batchComment, routerConfig: incomingConfig } = payload || {};
  const savedSettings = loadSavedMikroTikSettings() || {};

  const effectiveConfig = {
    host:
      incomingConfig?.host?.trim() ||
      savedSettings.apiHost?.trim() ||
      savedSettings.routerIp?.trim() ||
      'router.samtecai.com',
    port:
      incomingConfig?.port ||
      savedSettings.apiPort ||
      (incomingConfig?.useHttps === false ? 80 : 443),
    username:
      incomingConfig?.username?.trim() ||
      savedSettings.apiUser?.trim() ||
      'mosthassan',
    password:
      incomingConfig?.password !== undefined
        ? incomingConfig.password
        : (savedSettings.apiPassword || ''),
    useHttps:
      incomingConfig?.useHttps !== undefined
        ? incomingConfig.useHttps
        : (incomingConfig?.port === 443 || savedSettings.apiPort === 443 || true),
    timeoutMs: incomingConfig?.timeoutMs || 8000,
  };

  // Sync back to stored settings if incoming was provided
  if (incomingConfig) {
    saveMikroTikSettingsToDisk({ ...savedSettings, ...incomingConfig });
  }

  const totalCards = cards.length;
  if (totalCards === 0) {
    return {
      success: false,
      total: 0,
      added: 0,
      alreadyExisted: 0,
      failed: 0,
      verified: false,
      verifiedCount: 0,
      batchComment: batchComment || '',
      message: 'لا توجد كروت للدفع',
    };
  }

  let addedCount = 0;
  let existsCount = 0;
  let failedCount = 0;
  const errorDetails = [];

  // Safe chunked batches (100 cards/chunk) to preserve router CPU performance
  const CHUNK_SIZE = 100;
  const SUB_BATCH_CONCURRENCY = 10; // Process 10 cards at a time within each chunk
  const chunks = [];
  for (let i = 0; i < totalCards; i += CHUNK_SIZE) {
    chunks.push(cards.slice(i, i + CHUNK_SIZE));
  }

  let processedCount = 0;

  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunk = chunks[cIdx];

    for (let sIdx = 0; sIdx < chunk.length; sIdx += SUB_BATCH_CONCURRENCY) {
      const subBatch = chunk.slice(sIdx, sIdx + SUB_BATCH_CONCURRENCY);
      const subResults = await Promise.all(
        subBatch.map((card) => injectSingleCardDirect(card, batchComment, effectiveConfig))
      );

      for (const res of subResults) {
        processedCount++;
        if (res.status === 'added') {
          addedCount++;
        } else if (res.status === 'already_exists') {
          existsCount++;
        } else {
          failedCount++;
          errorDetails.push({ card: res.card, error: res.error });
        }
      }

      // Live progress notification to renderer window
      const pct = Math.min(94, Math.round((processedCount / totalCards) * 94));
      event.sender.send('mikrotik-push-progress', {
        current: processedCount,
        total: totalCards,
        percentage: pct,
        status: 'uploading',
        message: `جاري الرفع: ${processedCount} / ${totalCards}...`,
        added: addedCount,
        exists: existsCount,
        failed: failedCount,
        currentChunk: cIdx + 1,
        totalChunks: chunks.length,
      });

      // Safe pause to protect RouterOS CPU
      if (sIdx + SUB_BATCH_CONCURRENCY < chunk.length) {
        await new Promise((r) => setTimeout(r, 25));
      }
    }

    // Cooling pause between 100-card chunks
    if (cIdx + 1 < chunks.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // Post-upload verification: Execute query (/ip/hotspot/user/print filtered by batch comment)
  event.sender.send('mikrotik-push-progress', {
    current: totalCards,
    total: totalCards,
    percentage: 97,
    status: 'verifying',
    message: 'جاري فحص وتأكيد تسجيل الكروت في الراوتر (/ip/hotspot/user/print)...',
    added: addedCount,
    exists: existsCount,
    failed: failedCount,
  });

  const verifiedCount = await verifyRegisteredUsersDirect(effectiveConfig, batchComment);
  const isVerified =
    verifiedCount >= totalCards ||
    (verifiedCount >= (addedCount + existsCount) && verifiedCount > 0);

  const finalProgress = {
    current: totalCards,
    total: totalCards,
    percentage: 100,
    status: failedCount === 0 || addedCount > 0 ? 'completed' : 'failed',
    message: isVerified
      ? `تم الرفع والتحقق بنجاح 100% (${verifiedCount} / ${totalCards} كرت مسجل بالراوتر) ✓`
      : `تم إنهاء الدفع: ${addedCount} كرت مضاف، ${existsCount} مسجل مسبقاً، ${failedCount} متعثر`,
    added: addedCount,
    exists: existsCount,
    failed: failedCount,
    verifiedCount: verifiedCount >= 0 ? verifiedCount : (addedCount + existsCount),
    verified: isVerified,
  };

  event.sender.send('mikrotik-push-progress', finalProgress);

  return {
    success: failedCount === 0 || addedCount > 0,
    total: totalCards,
    added: addedCount,
    alreadyExisted: existsCount,
    failed: failedCount,
    verified: isVerified,
    verifiedCount: verifiedCount >= 0 ? verifiedCount : (addedCount + existsCount),
    batchComment,
    errors: errorDetails,
  };
});

// Sanitize webContents created dynamically (popups, oauth windows)
app.on('web-contents-created', (_event, contents) => {
  try {
    const childUa = contents.getUserAgent().replace(/Electron\/\S+\s?/, '');
    contents.setUserAgent(childUa);
  } catch (err) {
    // ignore
  }

  contents.setWindowOpenHandler(({ url }) => {
    const isAuthUrl =
      url.includes('accounts.google.com') ||
      url.includes('firebaseapp.com') ||
      url.includes('/__/auth/') ||
      url.includes('google.com/o/oauth2');

    if (isAuthUrl) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
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
