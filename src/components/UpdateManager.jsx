import { useState, useEffect } from 'react';
import './UpdateManager.css';

export function UpdateManager() {
    const [status, setStatus] = useState('idle'); // idle, checking, available, no-update, downloading, ready, error
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
            console.error("Update error received:", err);
            setStatus('error');
            setErrorMessage(err);
            setIsVisible(true);
        });

        const removeNotAvailableHelper = window.electronAPI.onUpdateNotAvailable(() => {
            setStatus('no-update');
            setIsVisible(true);
            setTimeout(() => {
                if (status === 'no-update') setIsVisible(false);
            }, 3000); // Hide after 3s
        });

        return () => {
            if (removeAvailableHelper) removeAvailableHelper();
            if (removeProgressHelper) removeProgressHelper();
            if (removeDownloadedHelper) removeDownloadedHelper();
            if (removeErrorHelper) removeErrorHelper();
            if (removeNotAvailableHelper) removeNotAvailableHelper();
        };
    }, []);

    const handleCheck = async () => {
        setStatus('checking');
        setIsVisible(true);
        setErrorMessage('');
        await window.electronAPI.checkForUpdates();
    };

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

    // If strictly idle and not visible, show a floating "Check Update" button maybe? 
    // Or just suppress. Let's make it always visible for debugging requested by user.
    // Actually, user wants to debug so let's put a small trigger if hidden?
    // For now, adhere to original design: hidden unless active. 
    // BUT we need a way to trigger it. Let's add a small trigger button bottom-right if hidden?

    // Changing behavior: Always return container, but overlay only if active or checking.
    // Wait, the user can't see "Check for Updates" if it returns null.
    // I will add a small trigger button fixed at bottom right for now.

    return (
        <>
            {!isVisible && (
                <button
                    onClick={handleCheck}
                    className="update-toggle-btn"
                    title="Check for Updates"
                >
                    build: v{localStorage.getItem('appVersion') || '1.2.0'} 🔄
                </button>
            )}

            {isVisible && (
                <div className="update-manager-overlay">
                    <div className="update-card glass-card animate-fadeIn">
                        <div className="update-header">
                            <h3>🚀 Updater</h3>
                            <button className="close-btn" onClick={handleLater}>×</button>
                        </div>

                        <div className="update-content">
                            {status === 'checking' && <p>Checking for updates...</p>}

                            {status === 'no-update' && <p>You are on the latest version.</p>}

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
                                        <button className="btn btn-primary" onClick={handleDownload}>Download Check</button>
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
