const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow = null;
let tray = null;
let serverProcess = null;
const SERVER_PORT = 3000;

// ─── Single Instance Lock ─────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

// ─── Start Embedded Server ────────────────────────────────────────
function startServer() {
    return new Promise((resolve, reject) => {
        const serverPath = path.join(__dirname, 'server.js');
        serverProcess = fork(serverPath, [], {
            env: { ...process.env, ELECTRON: '1' },
            silent: true
        });

        serverProcess.stdout.on('data', (data) => {
            const msg = data.toString();
            console.log('[Server]', msg.trim());
            if (msg.includes('Trading Chart server running')) {
                resolve();
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error('[Server Error]', data.toString().trim());
        });

        serverProcess.on('error', reject);

        // Fallback resolve after 3s
        setTimeout(resolve, 3000);
    });
}

// ─── Create Main Window ───────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        title: 'Trading Chart Pro',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        backgroundColor: '#0a0e17',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Remove default menu bar
    mainWindow.setMenu(null);

    // Load the app
    mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

    // Show when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // ─── Minimize to Tray instead of close ─────────────────
    mainWindow.on('close', (e) => {
        if (!app.isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('minimize', () => {
        // Optional: hide to tray on minimize too
        // mainWindow.hide();
    });
}

// ─── System Tray ──────────────────────────────────────────────────
function createTray() {
    // Create a simple tray icon (16x16 colored square)
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    let trayIcon;

    try {
        trayIcon = nativeImage.createFromPath(iconPath);
    } catch (e) {
        // Fallback: create a simple colored icon
        trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon.isEmpty() ? createDefaultIcon() : trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '📊 Trading Chart Pro',
            enabled: false
        },
        { type: 'separator' },
        {
            label: 'Show Window',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            }
        },
        {
            label: 'Open DevTools',
            click: () => {
                mainWindow.show();
                mainWindow.webContents.openDevTools();
            }
        },
        { type: 'separator' },
        {
            label: 'Restart Server',
            click: async () => {
                if (serverProcess) serverProcess.kill();
                await startServer();
                mainWindow.reload();
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Trading Chart Pro');
    tray.setContextMenu(contextMenu);

    // Double-click tray icon to show window
    tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.focus();
    });
}

// ─── Default Icon Creator ─────────────────────────────────────────
function createDefaultIcon() {
    // Create a 16x16 icon programmatically (green trading icon)
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            // Simple gradient: dark background with accent center
            const cx = Math.abs(x - 8), cy = Math.abs(y - 8);
            const dist = Math.sqrt(cx * cx + cy * cy);
            if (dist < 6) {
                canvas[i] = 0;      // R
                canvas[i + 1] = 212; // G
                canvas[i + 2] = 170; // B
                canvas[i + 3] = 255; // A
            } else {
                canvas[i] = 10;
                canvas[i + 1] = 14;
                canvas[i + 2] = 23;
                canvas[i + 3] = 255;
            }
        }
    }
    return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

// ─── App Lifecycle ────────────────────────────────────────────────
app.whenReady().then(async () => {
    try {
        await startServer();
        createWindow();
        createTray();
    } catch (e) {
        dialog.showErrorBox('Server Error', `Failed to start server: ${e.message}`);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    // Don't quit — keep in tray
});

app.on('activate', () => {
    if (mainWindow) {
        mainWindow.show();
    }
});

app.on('before-quit', () => {
    app.isQuitting = true;
    if (serverProcess) {
        serverProcess.kill();
    }
});
