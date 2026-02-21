import { useState, useEffect } from 'react';
import './UpdateManager.css';

// UpdateManager now only handles download/install overlays when triggered
// from outside the settings (e.g. auto-update on startup).
// The startup "no-update" toast is removed.
export function UpdateManager() {
    const [status, setStatus] = useState('idle');
    const [version, setVersion] = useState('');
    const [progress, setProgress] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!window.electronAPI) return;

        const removeAvailableHelper = window.electronAPI.onUpdateAvailable((info) => {
            setVersion(info.version);
            setStatus('available');
            setIsVisible(true);
        });

        const removeProgressHelper = window.electronAPI.onUpdateProgress((progressObj) => {
            setStatus('downloading');
            setProgress(progressObj.percent);
            setIsVisible(true);
        });

        const removeDownloadedHelper = window.electronAPI.onUpdateDownloaded(() => {
            setStatus('ready');
            setIsVisible(true);
        });

        const removeErrorHelper = window.electronAPI.onUpdateError((err) => {
            // Only show overlay for errors if user was already seeing the overlay
            if (isVisible) {
                console.error("Update error received:", err);
                setStatus('error');
                setErrorMessage(err);
            }
        });

        // Do NOT show "no-update" toast on startup
        const removeNotAvailableHelper = window.electronAPI.onUpdateNotAvailable(() => {
            // Silently ignore — the Settings modal handles this inline
        });

        return () => {
            if (removeAvailableHelper) removeAvailableHelper();
            if (removeProgressHelper) removeProgressHelper();
            if (removeDownloadedHelper) removeDownloadedHelper();
            if (removeErrorHelper) removeErrorHelper();
            if (removeNotAvailableHelper) removeNotAvailableHelper();
        };
    }, []);

    const handleDownload = () => {
        window.electronAPI.downloadUpdate();
        setStatus('downloading');
    };

    const handleInstall = () => {
        window.electronAPI.installUpdate();
    };

    const handleLater = () => {
        setIsVisible(false);
        setStatus('idle');
    };

    return (
        <>
            {isVisible && (
                <div className="update-manager-overlay">
                    <div className="update-card glass-card animate-fadeIn">
                        <div className="update-header">
                            <h3>🚀 Updater</h3>
                            <button className="close-btn" onClick={handleLater}>×</button>
                        </div>

                        <div className="update-content">
                            {status === 'checking' && <p>Checking for updates...</p>}

                            {status === 'error' && (
                                <div style={{ color: '#ef4444', marginBottom: '16px' }}>
                                    <p style={{ margin: 0, fontWeight: 'bold' }}>Error checking for updates:</p>
                                    <code style={{
                                        display: 'block',
                                        background: 'rgba(0,0,0,0.3)',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        marginTop: '8px',
                                        fontSize: '11px',
                                        wordBreak: 'break-all'
                                    }}>{errorMessage}</code>
                                </div>
                            )}

                            {status === 'available' && (
                                <>
                                    <p>A new version <strong>{version}</strong> is available.</p>
                                    <div className="update-actions">
                                        <button className="btn btn-primary" onClick={handleDownload}>Download Now</button>
                                        <button className="btn btn-ghost" onClick={handleLater}>Later</button>
                                    </div>
                                </>
                            )}

                            {status === 'downloading' && (
                                <>
                                    <p>Downloading update...</p>
                                    <div className="progress-bar-container">
                                        <div
                                            className="progress-bar-fill"
                                            style={{ width: `${progress}%` }}
                                        ></div>
                                    </div>
                                    <p className="text-right text-xs text-muted">{Math.round(progress)}%</p>
                                </>
                            )}

                            {status === 'ready' && (
                                <>
                                    <p>Update downloaded.</p>
                                    <div className="update-actions">
                                        <button className="btn btn-primary" onClick={handleInstall}>Install & Restart</button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
