// WalletContext - Shared wallet state across the app
// Supports both browser (MetaMask) and Electron (hybrid) authentication
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
    connectWallet as browserConnectWallet,
    getConnectedAddress,
    signMessage,
    formatAddress,
    onAccountChange,
    isWeb3Available,
} from '../blockchain/web3Provider';
import { getOrCreateKeys, clearKeys, getStoredKeys, storeKeysFromSignature } from '../crypto/keyManager';
import { register as registerUser } from '../services/socketService';

const WalletContext = createContext(null);

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

export function WalletProvider({ children }) {
    const [address, setAddress] = useState(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    const [keys, setKeys] = useState(null);
    const [isWeb3Detected, setIsWeb3Detected] = useState(false);
    const [authMode, setAuthMode] = useState(isElectron ? 'electron' : 'browser');

    // Check for existing connection on mount
    useEffect(() => {
        if (isElectron) {
            // In Electron, check stored auth
            setIsWeb3Detected(true); // Always show connect button in Electron

            // Listen for auth from browser
            window.electronAPI.onWalletAuth(async (data) => {
                console.log('Received wallet auth:', data.address);
                await handleElectronAuth(data);
            });

            // Check for existing stored keys
            checkStoredKeys();
        } else {
            // In browser, check MetaMask
            setIsWeb3Detected(isWeb3Available());
            checkBrowserConnection();

            onAccountChange((newAddress) => {
                if (newAddress !== address) {
                    setAddress(newAddress);
                    if (!newAddress) {
                        setIsConnected(false);
                        setKeys(null);
                    }
                }
            });
        }
    }, []);

    const checkStoredKeys = async () => {
        const storedKeys = await getStoredKeys();
        if (storedKeys) {
            setKeys(storedKeys);
            setAddress(storedKeys.address);
            setIsConnected(true);

            // Force presence re-registration on sync
            // This ensures our public key is broadcast to the new relay
            registerUser(storedKeys.address, storedKeys.publicKey);
            console.log('🔄 Re-registered presence for:', storedKeys.address);
        }
    };

    const checkBrowserConnection = async () => {
        const existingAddress = await getConnectedAddress();
        if (existingAddress) {
            setAddress(existingAddress);
            const storedKeys = await getStoredKeys();
            if (storedKeys) {
                setKeys(storedKeys);
                setIsConnected(true);

                // Force presence re-registration in browser too
                registerUser(existingAddress, storedKeys.publicKey);
                console.log('🔄 Re-registered presence for:', existingAddress);
            }
        }
    };

    const handleElectronAuth = async (data) => {
        try {
            // Derive keys from the signature
            const encryptionKeys = await storeKeysFromSignature(data.address, data.signature);
            setKeys(encryptionKeys);
            setAddress(data.address);

            // Register on P2P network
            registerUser(data.address, encryptionKeys.publicKey);

            setIsConnected(true);
            setIsConnecting(false);
        } catch (err) {
            setError(err.message);
            setIsConnecting(false);
        }
    };

    const connect = useCallback(async () => {
        setIsConnecting(true);
        setError(null);

        try {
            if (isElectron) {
                // Open browser for MetaMask auth
                const authResult = await window.electronAPI.openAuthBrowser();
                if (authResult) {
                    await handleElectronAuth(authResult);
                } else {
                    setError('Authentication timed out. Please try again.');
                    setIsConnecting(false);
                }
            } else {
                // Standard browser MetaMask flow
                const { address: walletAddress } = await browserConnectWallet();
                setAddress(walletAddress);

                const encryptionKeys = await getOrCreateKeys(walletAddress, signMessage);
                setKeys(encryptionKeys);

                registerUser(walletAddress, encryptionKeys.publicKey);
                console.log('✅ User registered:', walletAddress);
                console.log('📢 Public key:', encryptionKeys.publicKey.slice(0, 20) + '...');

                setIsConnected(true);
                setIsConnecting(false);
            }
        } catch (err) {
            setError(err.message);
            console.error('Wallet connection failed:', err);
            setIsConnecting(false);
        }
    }, []);

    const disconnect = useCallback(async () => {
        await clearKeys();
        setAddress(null);
        setKeys(null);
        setIsConnected(false);
    }, []);

    const value = {
        address,
        formattedAddress: formatAddress(address),
        isConnecting,
        isConnected,
        error,
        keys,
        isWeb3Detected,
        authMode,
        isElectron,
        connect,
        disconnect,
    };

    return (
        <WalletContext.Provider value={value}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet() {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
}
