// SettingsModal - In-app settings panel
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

    useEffect(() => {
        document.documentElement.style.fontSize = `${fontSize}px`;
        localStorage.setItem(STORAGE_KEY, fontSize.toString());
    }, [fontSize]);

    const handleCheckUpdate = () => {
        if (window.electronAPI && window.electronAPI.checkForUpdates) {
            window.electronAPI.checkForUpdates();
        }
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

                    {/* Check for Updates */}
                    <div className="settings-section">
                        <div className="settings-section-header">
                            <span className="settings-section-icon">🔄</span>
                            <h3>Updates</h3>
                        </div>
                        <div className="settings-row">
                            <div>
                                <p className="settings-description">Current version: v{__APP_VERSION__}</p>
                            </div>
                            <button className="btn btn-secondary settings-action-btn" onClick={handleCheckUpdate}>
                                Check for Updates
                            </button>
                        </div>
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
