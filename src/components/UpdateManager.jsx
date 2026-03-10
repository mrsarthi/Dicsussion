import { useState, useEffect } from 'react';
import './UpdateManager.css';
import {
    hasUpdateSupport,
    onUpdateAvailable,
    onUpdateError,
    onUpdateNotAvailable,
    startNativeUpdate,
} from '../services/platformService';

// UpdateManager now only handles download/install overlays when triggered
// from outside the settings (e.g. auto-update on startup).
// The startup "no-update" toast is removed.
export function UpdateManager() {
    const [status, setStatus] = useState('idle');
    const [version, setVersion] = useState('');
    const [isVisible, setIsVisible] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!hasUpdateSupport) return;

        const removeAvailableHelper = onUpdateAvailable((info) => {
            setVersion(info.version);
            setStatus('available');
            setIsVisible(true);
        });

        const removeErrorHelper = onUpdateError((err) => {
            // Only show overlay for errors if user was already seeing the overlay
            if (isVisible) {
                console.error("Update error received:", err);
                setStatus('error');
                setErrorMessage(err);
            }
        });

        // Do NOT show "no-update" toast on startup
        const removeNotAvailableHelper = onUpdateNotAvailable(() => {
            // Silently ignore — the Settings modal handles this inline
        });

        return () => {
            if (removeAvailableHelper) removeAvailableHelper();
            if (removeErrorHelper) removeErrorHelper();
            if (removeNotAvailableHelper) removeNotAvailableHelper();
        };
    }, []);

    const handleUpdate = () => {
        startNativeUpdate();
        setStatus('downloading'); // Show temporary UI state
        // Give the OS a second to open the browser, then hide the banner
        setTimeout(() => {
            setIsVisible(false);
            setStatus('idle');
        }, 1500);
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
                                        <button className="btn btn-primary" onClick={handleUpdate}>Update Now</button>
                                        <button className="btn btn-ghost" onClick={handleLater}>Later</button>
                                    </div>
                                </>
                            )}

                            {status === 'downloading' && (
                                <>
                                    <p>Opening System Installer...</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
