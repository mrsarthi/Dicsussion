const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

// Handle creating/removing shortcuts on Windows when installing/uninstalling
try {
    if (require('electron-squirrel-startup')) {
        app.quit();
    }
} catch (e) {
    // Module not available, ignore
}

// Keep a global reference of the window object
let mainWindow;
let authServer;
let authResolve = null;

// Auth server port
const AUTH_PORT = 47823;

// Determine if we're in development or production
const isDev = !app.isPackaged;

// Create local auth server to receive wallet connection from browser
function createAuthServer() {
    authServer = http.createServer((req, res) => {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (req.method === 'POST' && req.url === '/auth-callback') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    console.log('Auth received:', data.address);

                    // Send auth data to renderer
                    if (mainWindow) {
                        mainWindow.webContents.send('wallet-auth', data);
                        mainWindow.focus();
                    }

                    if (authResolve) {
                        authResolve(data);
                        authResolve = null;
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (error) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid request' }));
                }
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    authServer.listen(AUTH_PORT, '127.0.0.1', () => {
        console.log(`Auth server running on port ${AUTH_PORT}`);
    });
}

function createWindow() {
    // Create the browser window with optimized settings
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        frame: true,
        titleBarStyle: 'default',
        backgroundColor: '#0a0a0f',
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    // Load the app
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC handlers
ipcMain.handle('open-auth-browser', async () => {
    const nonce = Date.now().toString();
    let authUrl;

    if (isDev) {
        authUrl = `http://localhost:5173/auth.html?nonce=${nonce}`;
    } else {
        // In production, serve from file protocol
        authUrl = `file://${path.join(__dirname, '../dist/auth.html')}?nonce=${nonce}`;
    }

    shell.openExternal(authUrl);

    // Wait for auth callback
    return new Promise((resolve) => {
        authResolve = resolve;
        // Timeout after 5 minutes
        setTimeout(() => {
            if (authResolve === resolve) {
                authResolve = null;
                resolve(null);
            }
        }, 5 * 60 * 1000);
    });
});

ipcMain.handle('get-stored-auth', async () => {
    // This would read from secure storage in production
    return null;
});

// Performance optimizations
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// Create window when ready
app.whenReady().then(() => {
    createAuthServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Cleanup
app.on('window-all-closed', () => {
    if (authServer) {
        authServer.close();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
