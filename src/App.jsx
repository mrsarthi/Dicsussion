// App.jsx - Main Application Component
import { useState, useEffect } from 'react';
import { WalletProvider, useWallet } from './context/WalletContext';
import { WalletConnect } from './components/WalletConnect';
import { ChatInterface } from './components/ChatInterface';
import { UsernameSetup } from './components/UsernameSetup';
import { initSocket, register } from './services/socketService';
import { getStoredKeys } from './crypto/keyManager';
import { UpdateManager } from './components/UpdateManager';
import './styles/index.css';

function AppContent() {
  const { address, isConnected } = useWallet();
  const [username, setUsername] = useState(() => {
    return localStorage.getItem('decentrachat_username') || null;
  });
  const [showUsernameSetup, setShowUsernameSetup] = useState(false);
  const [isSocketReady, setIsSocketReady] = useState(false);

  // Initialize socket and register when wallet connects

  useEffect(() => {
    if (!isConnected || !address) return;

    let mounted = true;

    (async () => {
      try {
        // Initialize socket
        initSocket();

        // Get encryption keys
        const keys = await getStoredKeys();
        if (!keys || !mounted) return;

        // Register with server
        const storedUsername = localStorage.getItem('decentrachat_username');
        await register(address, keys.publicKey, storedUsername);

        if (mounted) {
          setIsSocketReady(true);

          // Check if we need to show username setup
          if (!storedUsername) {
            const hasSkipped = localStorage.getItem('decentrachat_username_skipped');
            if (!hasSkipped) {
              setShowUsernameSetup(true);
            }
          }
        }
      } catch (err) {
        console.error('Failed to initialize:', err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isConnected, address]);

  const handleUsernameComplete = (newUsername) => {
    setUsername(newUsername);
    setShowUsernameSetup(false);
  };

  const handleUsernameSkip = () => {
    localStorage.setItem('decentrachat_username_skipped', 'true');
    setShowUsernameSetup(false);
  };

  if (!isConnected) {
    return <WalletConnect />;
  }

  // Wait for socket to be ready before showing username setup
  if (!isSocketReady) {
    return (
      <div className="wallet-connect-container">
        <div className="wallet-card glass-card animate-fadeIn">
          <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto' }}></div>
          <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Connecting to network...</p>
        </div>
      </div>
    );
  }

  if (showUsernameSetup) {
    return <UsernameSetup onComplete={handleUsernameComplete} onSkip={handleUsernameSkip} />;
  }

  return (
    <div className="app">
      <WalletConnect username={username} />
      <ChatInterface walletAddress={address} username={username} />
    </div>
  );
}

function App() {
  return (
    <WalletProvider>
      <UpdateManager />
      <AppContent />
    </WalletProvider>
  );
}

export default App;
