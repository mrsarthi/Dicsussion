// Platform Service — unified abstraction over Electron / Capacitor / Browser
// All platform-specific calls go through this module.

import { Capacitor } from '@capacitor/core';

// ─── Platform Detection ────────────────────────────────────────
const _isElectron =
    typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

const _isCapacitor =
    typeof window !== 'undefined' && Capacitor.isNativePlatform();

const _isBrowser = !_isElectron && !_isCapacitor;

// Are we running inside a "native" shell (Electron or Capacitor)?
const _isNativeApp = _isElectron || _isCapacitor;

export const platform = {
    type: _isElectron ? 'electron' : _isCapacitor ? 'capacitor' : 'browser',
    isElectron: _isElectron,
    isCapacitor: _isCapacitor,
    isBrowser: _isBrowser,
    isNativeApp: _isNativeApp,
};

// ─── Wallet / Auth ─────────────────────────────────────────────

/**
 * Open the system browser for MetaMask wallet authentication.
 *  - Electron  → uses IPC to open default browser + local auth server
 *  - Capacitor → uses @capacitor/browser to open MetaMask mobile deeplink
 *  - Browser   → no-op (MetaMask is available in-page)
 */
export async function openAuthBrowser() {
    if (_isElectron) {
        return window.electronAPI.openAuthBrowser();
    }

    if (_isCapacitor) {
        const { Browser } = await import('@capacitor/browser');

        // To use MetaMask on mobile, the DApp URL must be publicly accessible.
        // We use the signaling server since we just configured it to host auth.html.
        const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://decentrachat-singnalling.onrender.com';
        let authHostUrl = SERVER_URL + '/auth.html?nonce=' + Date.now() + '&platform=capacitor';

        // MetaMask requires the full URL to be properly encoded for its dapp deep links
        const encodedUrl = encodeURIComponent(authHostUrl);

        // 1. Try the official Universal Link (used as a fallback to trigger Play Store download)
        const metamaskUniversalLink = `https://metamask.app.link/dapp/${authHostUrl}`;

        // 2. Try the classic dapp:// link natively via AppLauncher
        // dapp:// requires the protocol stripped
        const cleanAuthUrl = authHostUrl.replace(/^https?:\/\//, '');
        const metamaskClassicLink = `dapp://${cleanAuthUrl}`;

        try {
            // Import the newly installed AppLauncher
            const { AppLauncher } = await import('@capacitor/app-launcher');

            // Raw-fire the intent to Android. This breaks out of the WebView completely and goes straight to PackageManager.
            // If MetaMask is installed, it opens. If not, this throws an error.
            await AppLauncher.openUrl({ url: metamaskClassicLink });
        } catch (e) {
            console.warn("App launcher failed (MetaMask likely not installed), failing over to website...", e);
            try {
                // Fallback to the web link so they can be routed to the Play Store
                await Browser.open({ url: metamaskUniversalLink, windowName: '_system' });
            } catch (err) {
                console.error("All deep links failed", err);
            }
        }
        return null; // result comes back via onWalletAuth deep-link listener
    }

    return null; // browser — no separate auth needed
}

/**
 * Listen for wallet auth data coming back after the browser auth flow.
 *  - Electron  → IPC event from the local auth server
 *  - Capacitor → App URL open event (deep link)
 *  - Browser   → no-op
 */
export function onWalletAuth(callback) {
    if (_isElectron) {
        window.electronAPI.onWalletAuth(callback);
        return;
    }

    if (_isCapacitor) {
        import('@capacitor/app').then(({ App }) => {
            App.addListener('appUrlOpen', (event) => {
                try {
                    const url = new URL(event.url);
                    const address = url.searchParams.get('address');
                    const signature = url.searchParams.get('signature');
                    if (address && signature) {
                        callback({ address, signature });
                    }
                } catch (e) {
                    console.error('Failed to parse auth deep link:', e);
                }
            });
        });
        return;
    }
    // browser — nothing to listen for
}

// ─── UI helpers ────────────────────────────────────────────────

/**
 * Flash the window / provide haptic feedback to get user attention.
 */
export async function notifyUser() {
    if (_isElectron && window.electronAPI?.flashFrame) {
        window.electronAPI.flashFrame(true);
        return;
    }

    if (_isCapacitor) {
        try {
            const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
            await Haptics.impact({ style: ImpactStyle.Medium });
        } catch {
            // Haptics not available — ignore
        }
        return;
    }
}

/**
 * Exit the application.
 */
export async function appExit() {
    if (_isElectron && window.electronAPI?.appExit) {
        window.electronAPI.appExit();
        return;
    }

    if (_isCapacitor) {
        const { App } = await import('@capacitor/app');
        await App.exitApp();
        return;
    }
}

// ─── Update System ─────────────────────────────────────────────
// Electron:   uses electron-updater IPC
// Capacitor:  self-hosted version.json + APK download
// Browser:    no updates

// The URL your website serves version info from.
// Example response: { "version": "1.7.0", "apkUrl": "https://yoursite.com/downloads/DecentraChat-1.7.0.apk" }
const VERSION_CHECK_URL = 'https://yoursite.com/api/version.json';

// ── Internal state for Capacitor updater ──
let _capUpdateCallbacks = {
    onAvailable: [],
    onProgress: [],
    onDownloaded: [],
    onError: [],
    onNotAvailable: [],
};

function _capEmit(event, data) {
    (_capUpdateCallbacks[event] || []).forEach((cb) => cb(data));
}

/**
 * Subscribe to "update available" events.
 * @returns {Function} unsubscribe
 */
export function onUpdateAvailable(callback) {
    if (_isElectron && window.electronAPI?.onUpdateAvailable) {
        return window.electronAPI.onUpdateAvailable(callback);
    }
    if (_isCapacitor) {
        _capUpdateCallbacks.onAvailable.push(callback);
        return () => {
            _capUpdateCallbacks.onAvailable = _capUpdateCallbacks.onAvailable.filter(
                (cb) => cb !== callback
            );
        };
    }
    return () => { };
}

export function onUpdateProgress(callback) {
    if (_isElectron && window.electronAPI?.onUpdateProgress) {
        return window.electronAPI.onUpdateProgress(callback);
    }
    if (_isCapacitor) {
        _capUpdateCallbacks.onProgress.push(callback);
        return () => {
            _capUpdateCallbacks.onProgress = _capUpdateCallbacks.onProgress.filter(
                (cb) => cb !== callback
            );
        };
    }
    return () => { };
}

export function onUpdateDownloaded(callback) {
    if (_isElectron && window.electronAPI?.onUpdateDownloaded) {
        return window.electronAPI.onUpdateDownloaded(callback);
    }
    if (_isCapacitor) {
        _capUpdateCallbacks.onDownloaded.push(callback);
        return () => {
            _capUpdateCallbacks.onDownloaded = _capUpdateCallbacks.onDownloaded.filter(
                (cb) => cb !== callback
            );
        };
    }
    return () => { };
}

export function onUpdateError(callback) {
    if (_isElectron && window.electronAPI?.onUpdateError) {
        return window.electronAPI.onUpdateError(callback);
    }
    if (_isCapacitor) {
        _capUpdateCallbacks.onError.push(callback);
        return () => {
            _capUpdateCallbacks.onError = _capUpdateCallbacks.onError.filter(
                (cb) => cb !== callback
            );
        };
    }
    return () => { };
}

export function onUpdateNotAvailable(callback) {
    if (_isElectron && window.electronAPI?.onUpdateNotAvailable) {
        return window.electronAPI.onUpdateNotAvailable(callback);
    }
    if (_isCapacitor) {
        _capUpdateCallbacks.onNotAvailable.push(callback);
        return () => {
            _capUpdateCallbacks.onNotAvailable =
                _capUpdateCallbacks.onNotAvailable.filter((cb) => cb !== callback);
        };
    }
    return () => { };
}

/**
 * Compare two semver strings.
 * Returns true if remote > local.
 */
function _isNewerVersion(remote, local) {
    const r = remote.replace(/^v/, '').split('.').map(Number);
    const l = local.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((r[i] || 0) > (l[i] || 0)) return true;
        if ((r[i] || 0) < (l[i] || 0)) return false;
    }
    return false;
}

// Store the latest APK URL for download
let _latestApkUrl = null;

/**
 * Check for updates.
 */
export async function checkForUpdates() {
    if (_isElectron && window.electronAPI?.checkForUpdates) {
        window.electronAPI.checkForUpdates();
        return;
    }

    if (_isCapacitor) {
        try {
            const res = await fetch(VERSION_CHECK_URL, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            const currentVersion =
                typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

            if (_isNewerVersion(data.version, currentVersion)) {
                _latestApkUrl = data.apkUrl;
                _capEmit('onAvailable', { version: data.version });
            } else {
                _capEmit('onNotAvailable', {});
            }
        } catch (err) {
            _capEmit('onError', err.message || 'Update check failed');
        }
        return;
    }
}

/**
 * Download the update.
 *  - Electron → IPC to electron-updater
 *  - Capacitor → open the APK URL in the system browser for download
 */
export async function downloadUpdate() {
    if (_isElectron && window.electronAPI?.downloadUpdate) {
        window.electronAPI.downloadUpdate();
        return;
    }

    if (_isCapacitor && _latestApkUrl) {
        try {
            // Open the APK URL in the system browser — Android will handle the download
            const { Browser } = await import('@capacitor/browser');
            _capEmit('onProgress', { percent: 50 }); // Indeterminate-ish
            await Browser.open({ url: _latestApkUrl });
            // The user will install from the browser download
            _capEmit('onDownloaded', {});
        } catch (err) {
            _capEmit('onError', err.message || 'Download failed');
        }
        return;
    }
}

/**
 * Install the update.
 *  - Electron → quit and install
 *  - Capacitor → no-op (user installs APK from downloads)
 */
export function installUpdate() {
    if (_isElectron && window.electronAPI?.installUpdate) {
        window.electronAPI.installUpdate();
        return;
    }
    // Capacitor: The APK was opened in browser — user installs manually
}

/**
 * Whether the update system is available on this platform.
 */
export const hasUpdateSupport = _isElectron || _isCapacitor;
