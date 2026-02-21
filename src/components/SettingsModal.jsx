// SettingsModal - In-app settings panel with inline update flow
import { useState, useEffect } from 'react';
import './SettingsModal.css';

const FONT_SIZES = [
    { label: 'Small', value: 13 },
    { label: 'Medium', value: 15 },
    { label: 'Large', value: 17 },
    { label: 'Extra Large', value: 19 },
];

const STORAGE_KEY = 'decentrachat_font_size';

export function SettingsModal({ onClose, onDeleteAccount }) {
    const [fontSize, setFontSize] = useState(() => {
        return parseInt(localStorage.getItem(STORAGE_KEY)) || 15;
    });

    // Update states: idle, checking, available, no-update, downloading, ready, error
    const [updateStatus, setUpdateStatus] = useState('idle');
    const [updateVersion, setUpdateVersion] = useState('');
    const [updateProgress, setUpdateProgress] = useState(0);
    const [updateError, setUpdateError] = useState('');

    useEffect(() => {
        document.documentElement.style.fontSize = `${fontSize}px`;
        localStorage.setItem(STORAGE_KEY, fontSize.toString());
    }, [fontSize]);

    // Listen for update events while settings is open
    useEffect(() => {
        if (!window.electronAPI) return;

        const removeAvailable = window.electronAPI.onUpdateAvailable((info) => {
            setUpdateVersion(info.version);
            setUpdateStatus('available');
        });

        const removeNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
            setUpdateStatus('no-update');
        });

        const removeProgress = window.electronAPI.onUpdateProgress((progressObj) => {
            setUpdateStatus('downloading');
            setUpdateProgress(progressObj.percent);
        });

        const removeDownloaded = window.electronAPI.onUpdateDownloaded(() => {
            setUpdateStatus('ready');
        });

        const removeError = window.electronAPI.onUpdateError((err) => {
            setUpdateStatus('error');
            setUpdateError(err);
        });

        return () => {
            if (removeAvailable) removeAvailable();
            if (removeNotAvailable) removeNotAvailable();
            if (removeProgress) removeProgress();
            if (removeDownloaded) removeDownloaded();
            if (removeError) removeError();
        };
    }, []);

    const handleCheckUpdate = () => {
        if (!window.electronAPI?.checkForUpdates) return;
        setUpdateStatus('checking');
        setUpdateError('');
        window.electronAPI.checkForUpdates();
    };

    const handleDownload = () => {
        if (!window.electronAPI?.downloadUpdate) return;
        setUpdateStatus('downloading');
        window.electronAPI.downloadUpdate();
    };

    const handleInstall = () => {
        if (!window.electronAPI?.installUpdate) return;
        window.electronAPI.installUpdate();
    };

    // Find nearest preset label
    const getPresetLabel = (val) => {
        const closest = FONT_SIZES.reduce((prev, curr) =>
            Math.abs(curr.value - val) < Math.abs(prev.value - val) ? curr : prev
        );
        return Math.abs(closest.value - val) <= 1 ? closest.label : `${val}px`;
    };

    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-modal glass-card animate-scaleIn" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>⚙️ Settings</h2>
                    <button className="settings-close-btn" onClick={onClose}>×</button>
                </div>

                <div className="settings-body">
                    {/* Font Size */}
                    <div className="settings-section">
                        <div className="settings-section-header">
                            <span className="settings-section-icon">🔤</span>
                            <h3>Font Size</h3>
                        </div>
                        <p className="settings-description">Adjust the app's text size to your preference</p>

                        <div className="font-size-control">
                            <span className="font-size-label-small">A</span>
                            <input
                                type="range"
                                min="11"
                                max="21"
                                step="1"
                                value={fontSize}
                                onChange={(e) => setFontSize(parseInt(e.target.value))}
                                className="font-size-slider"
                            />
                            <span className="font-size-label-large">A</span>
                        </div>
                        <div className="font-size-value">{getPresetLabel(fontSize)}</div>

                        <div className="font-size-presets">
                            {FONT_SIZES.map((preset) => (
                                <button
                                    key={preset.value}
                                    className={`preset-btn ${fontSize === preset.value ? 'active' : ''}`}
                                    onClick={() => setFontSize(preset.value)}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Updates — fully inline */}
                    <div className="settings-section">
                        <div className="settings-section-header">
                            <span className="settings-section-icon">🔄</span>
                            <h3>Updates</h3>
                        </div>

                        {updateStatus === 'idle' && (
                            <div className="settings-row">
                                <p className="settings-description" style={{ margin: 0 }}>Current version: v{__APP_VERSION__}</p>
                                <button className="btn btn-secondary settings-action-btn" onClick={handleCheckUpdate}>
                                    Check for Updates
                                </button>
                            </div>
                        )}

                        {updateStatus === 'checking' && (
                            <div className="update-inline-status">
                                <span className="spinner-small"></span>
                                <span>Checking for updates...</span>
                            </div>
                        )}

                        {updateStatus === 'no-update' && (
                            <div className="update-inline-status success">
                                <span>✅</span>
                                <span>You're on the latest version (v{__APP_VERSION__})</span>
                            </div>
                        )}

                        {updateStatus === 'available' && (
                            <div className="update-inline-block">
                                <p className="update-inline-text">
                                    🎉 A new version <strong>v{updateVersion}</strong> is available!
                                </p>
                                <div className="update-inline-actions">
                                    <button className="btn btn-primary settings-action-btn" onClick={handleDownload}>
                                        Download Now
                                    </button>
                                    <button className="btn btn-ghost settings-action-btn" onClick={() => setUpdateStatus('idle')}>
                                        Later
                                    </button>
                                </div>
                            </div>
                        )}

                        {updateStatus === 'downloading' && (
                            <div className="update-inline-block">
                                <p className="update-inline-text">Downloading update...</p>
                                <div className="update-progress-bar">
                                    <div className="update-progress-fill" style={{ width: `${updateProgress}%` }}></div>
                                </div>
                                <span className="update-progress-label">{Math.round(updateProgress)}%</span>
                            </div>
                        )}

                        {updateStatus === 'ready' && (
                            <div className="update-inline-block">
                                <p className="update-inline-text">✅ Update downloaded and ready!</p>
                                <button className="btn btn-primary settings-action-btn" onClick={handleInstall}>
                                    Install & Restart
                                </button>
                            </div>
                        )}

                        {updateStatus === 'error' && (
                            <div className="update-inline-block">
                                <p className="update-inline-text" style={{ color: '#ef4444' }}>
                                    ❌ Update check failed
                                </p>
                                <code className="update-error-code">{updateError}</code>
                                <button className="btn btn-secondary settings-action-btn" onClick={handleCheckUpdate} style={{ marginTop: '8px' }}>
                                    Retry
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Delete Account */}
                    {onDeleteAccount && (
                        <div className="settings-section settings-section-danger">
                            <div className="settings-section-header">
                                <span className="settings-section-icon">⚠️</span>
                                <h3>Danger Zone</h3>
                            </div>
                            <p className="settings-description">
                                Permanently delete your account, messages, and encryption keys
                            </p>
                            <button className="btn btn-danger settings-action-btn" onClick={onDeleteAccount}>
                                🗑️ Delete Account
                            </button>
                        </div>
                    )}
                </div>

                <div className="settings-footer">
                    <span className="text-muted text-xs">DecentraChat v{__APP_VERSION__}</span>
                </div>
            </div>
        </div>
    );
}
