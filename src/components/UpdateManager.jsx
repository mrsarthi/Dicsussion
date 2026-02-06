import { useState, useEffect } from 'react';
import './UpdateManager.css';

export function UpdateManager() {
    const [status, setStatus] = useState('idle'); // idle, available, downloading, ready
    const [version, setVersion] = useState('');
    const [progress, setProgress] = useState(0);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Only run if window.electronAPI exists (prod environment)
        if (!window.electronAPI) return;

        // Listeners would need to be exposed via preload.js
        // Assuming we will update preload.js to expose these events

        const removeAvailableListener = window.electronAPI.onUpdateAvailable((info) => {
            setVersion(info.version);
            setStatus('available');
            setIsVisible(true);
        });

        const removeProgressListener = window.electronAPI.onUpdateProgress((progressObj) => {
            setStatus('downloading');
            setProgress(progressObj.percent);
            setIsVisible(true);
        });

        const removeDownloadedListener = window.electronAPI.onUpdateDownloaded(() => {
            setStatus('ready');
            setIsVisible(true);
        });

        return () => {
            if (removeAvailableListener) removeAvailableListener();
            if (removeProgressListener) removeProgressListener();
            if (removeDownloadedListener) removeDownloadedListener();
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
    };

    if (!isVisible) return null;

    return (
        <div className="update-manager-overlay">
            <div className="update-card glass-card animate-fadeIn">
                <div className="update-header">
                    <h3>🚀 Update Available</h3>
                    {status !== 'downloading' && (
                        <button className="close-btn" onClick={handleLater}>×</button>
                    )}
                </div>

                <div className="update-content">
                    {status === 'available' && (
                        <>
                            <p>A new version <strong>{version}</strong> is available.</p>
                            <p className="text-muted text-sm">Update now to get the latest features and fixes.</p>
                            <div className="update-actions">
                                <button className="btn btn-ghost" onClick={handleLater}>Later</button>
                                <button className="btn btn-primary" onClick={handleDownload}>Download Update</button>
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
                            <p>Update downloaded and ready to install.</p>
                            <div className="update-actions">
                                <button className="btn btn-ghost" onClick={handleLater}>Install Later</button>
                                <button className="btn btn-primary" onClick={handleInstall}>Install & Restart</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
