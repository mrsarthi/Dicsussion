// useWallet Hook - Manage wallet connection state
import { useState, useEffect, useCallback } from 'react';
import {
    connectWallet,
    getConnectedAddress,
    signMessage,
    formatAddress,
    onAccountChange,
    isWeb3Available,
} from '../blockchain/web3Provider';
import { getOrCreateKeys, clearKeys, getStoredKeys } from '../crypto/keyManager';
import { registerUser } from '../services/gunService';

export function useWallet() {
    const [address, setAddress] = useState(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    const [keys, setKeys] = useState(null);
    const [isWeb3Detected, setIsWeb3Detected] = useState(false);

    // Check for existing connection on mount
    useEffect(() => {
        setIsWeb3Detected(isWeb3Available());

        const checkConnection = async () => {
            const existingAddress = await getConnectedAddress();
            if (existingAddress) {
                setAddress(existingAddress);
                const storedKeys = await getStoredKeys();
                if (storedKeys) {
                    setKeys(storedKeys);
                    setIsConnected(true);
                }
            }
        };

        checkConnection();

        // Listen for account changes
        onAccountChange((newAddress) => {
            if (newAddress !== address) {
                setAddress(newAddress);
                if (!newAddress) {
                    setIsConnected(false);
                    setKeys(null);
                }
            }
        });
    }, []);

    const connect = useCallback(async () => {
        setIsConnecting(true);
        setError(null);

        try {
            const { address: walletAddress } = await connectWallet();
            setAddress(walletAddress);

            // Get or create encryption keys
            const encryptionKeys = await getOrCreateKeys(walletAddress, signMessage);
            setKeys(encryptionKeys);

            // Register on the P2P network
            registerUser(walletAddress, encryptionKeys.publicKey);

            setIsConnected(true);
        } catch (err) {
            setError(err.message);
            console.error('Wallet connection failed:', err);
        } finally {
            setIsConnecting(false);
        }
    }, []);

    const disconnect = useCallback(async () => {
        await clearKeys();
        setAddress(null);
        setKeys(null);
        setIsConnected(false);
    }, []);

    return {
        address,
        formattedAddress: formatAddress(address),
        isConnecting,
        isConnected,
        error,
        keys,
        isWeb3Detected,
        connect,
        disconnect,
    };
}
