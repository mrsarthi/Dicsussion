import { useState, useRef, useEffect } from 'react';
import './AppMenu.css';

export function AppMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const menuRef = useRef(null);

    const toggleMenu = () => setIsOpen(!isOpen);

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleCheckUpdate = () => {
        setIsOpen(false);
        if (window.electronAPI && window.electronAPI.checkForUpdates) {
            window.electronAPI.checkForUpdates();
        }
    };

    const handleExitClick = () => {
        setIsOpen(false);
        setShowExitConfirm(true);
    };

    const confirmExit = () => {
        if (window.electronAPI && window.electronAPI.appExit) {
            window.electronAPI.appExit();
        } else {
            // Fallback for web/dev
            console.log("App Exit Triggered (Mock)");
            setShowExitConfirm(false);
        }
    };

    const cancelExit = () => {
        setShowExitConfirm(false);
    };

    const appVersion = localStorage.getItem('appVersion') || '1.2.0';

    return (
        <>
            <div className="app-menu-container" ref={menuRef}>
                <button className="menu-toggle-btn" onClick={toggleMenu} title="Menu">
                    ☰
                </button>

                {isOpen && (
                    <div className="menu-dropdown glass-card">
                        <div className="menu-item" onClick={handleCheckUpdate}>
                            <span>Check for Updates</span>
                            <span className="menu-version">v{appVersion}</span>
                        </div>
                        <div className="menu-separator"></div>
                        <div className="menu-item danger" onClick={handleExitClick}>
                            <span>Exit</span>
                        </div>
                    </div>
                )}
            </div>

            {showExitConfirm && (
                <div className="exit-confirm-overlay">
                    <div className="glass-card confirm-card animate-fadeIn">
                        <h3>Exit Application?</h3>
                        <p>Are you sure you want to close DecentraChat?</p>
                        <div className="confirm-actions">
                            <button className="btn btn-ghost" onClick={cancelExit}>Cancel</button>
                            <button className="btn btn-danger" onClick={confirmExit}>Exit</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
