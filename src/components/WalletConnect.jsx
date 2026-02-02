// WalletConnect Component - Premium wallet connection UI
import { useWallet } from '../context/WalletContext';
import './WalletConnect.css';

export function WalletConnect() {
    const {
        address,
        formattedAddress,
        isConnecting,
        isConnected,
        error,
        isWeb3Detected,
        isElectron,
        connect,
        disconnect,
    } = useWallet();

    if (!isWeb3Detected) {
        return (
            <div className="wallet-connect-container">
                <div className="wallet-card glass-card animate-fadeIn">
                    <div className="wallet-icon">🦊</div>
                    <h2>Wallet Required</h2>
                    <p className="text-secondary">
                        Please install MetaMask to use DecentraChat
                    </p>
                    <a
                        href="https://metamask.io/download/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary"
                    >
                        Install MetaMask
                    </a>
                </div>
            </div>
        );
    }

    if (!isConnected) {
        return (
            <div className="wallet-connect-container">
                <div className="wallet-card glass-card animate-fadeIn">
                    <div className="logo-section">
                        <div className="logo-icon">
                            <span className="logo-emoji">🔐</span>
                        </div>
                        <h1 className="gradient-text">DecentraChat</h1>
                        <p className="tagline">Decentralized • Encrypted • Private</p>
                    </div>

                    <div className="features-list">
                        <div className="feature-item">
                            <span className="feature-icon">⛓️</span>
                            <span>Blockchain Identity</span>
                        </div>
                        <div className="feature-item">
                            <span className="feature-icon">🔒</span>
                            <span>End-to-End Encrypted</span>
                        </div>
                        <div className="feature-item">
                            <span className="feature-icon">🌐</span>
                            <span>No Central Server</span>
                        </div>
                    </div>

                    <button
                        className="btn btn-primary connect-btn"
                        onClick={connect}
                        disabled={isConnecting}
                    >
                        {isConnecting ? (
                            <>
                                <span className="spinner"></span>
                                {isElectron ? 'Waiting for browser...' : 'Connecting...'}
                            </>
                        ) : (
                            <>
                                <span>🦊</span>
                                {isElectron ? 'Open Browser to Connect' : 'Connect with MetaMask'}
                            </>
                        )}
                    </button>

                    {error && (
                        <div className="error-message animate-fadeIn">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Connected state - compact header
    return (
        <div className="wallet-connected animate-slideIn">
            <div className="wallet-info">
                <div className="avatar">
                    {address.slice(2, 4).toUpperCase()}
                </div>
                <div className="wallet-details">
                    <span className="wallet-address">{formattedAddress}</span>
                    <span className="encrypted-badge">
                        🔒 E2E Encrypted
                    </span>
                </div>
            </div>
            <button className="btn btn-ghost" onClick={disconnect}>
                Disconnect
            </button>
        </div>
    );
}
