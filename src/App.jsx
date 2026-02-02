// App.jsx - Main Application Component
import { WalletProvider, useWallet } from './context/WalletContext';
import { WalletConnect } from './components/WalletConnect';
import { ChatInterface } from './components/ChatInterface';
import './styles/index.css';

function AppContent() {
  const { address, isConnected } = useWallet();

  return (
    <div className="app">
      {!isConnected ? (
        <WalletConnect />
      ) : (
        <>
          <WalletConnect />
          <ChatInterface walletAddress={address} />
        </>
      )}
    </div>
  );
}

function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}

export default App;
