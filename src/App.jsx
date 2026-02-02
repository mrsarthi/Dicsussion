// App.jsx - Main Application Component
import { WalletConnect } from './components/WalletConnect';
import { ChatInterface } from './components/ChatInterface';
import { useWallet } from './hooks/useWallet';
import './styles/index.css';

function App() {
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

export default App;
