// Key Manager - Secure storage and management of encryption keys
import localforage from 'localforage';
import { generateKeyPair, deriveKeysFromSignature } from './crypto';

// Initialize local storage
const keyStore = localforage.createInstance({
    name: 'decentrachat',
    storeName: 'keys',
});

const KEY_STORAGE_KEY = 'encryption_keys';
const WALLET_ADDRESS_KEY = 'wallet_address';

/**
 * Get or create encryption keys for a wallet
 * @param {string} walletAddress - The Ethereum wallet address
 * @param {Function} signMessageFn - Function to sign a message with wallet
 * @returns {Promise<Object>} { publicKey, secretKey }
 */
export async function getOrCreateKeys(walletAddress, signMessageFn) {
    // Check if we have stored keys for this wallet
    const storedAddress = await keyStore.getItem(WALLET_ADDRESS_KEY);

    if (storedAddress === walletAddress) {
        const storedKeys = await keyStore.getItem(KEY_STORAGE_KEY);
        if (storedKeys) {
            return storedKeys;
        }
    }

    // Need to create new keys
    // Ask user to sign a message to derive deterministic keys
    const message = `DecentraChat Key Generation\n\nThis signature will be used to generate your encryption keys.\nWallet: ${walletAddress}\nTimestamp: ${Date.now()}`;

    const signature = await signMessageFn(message);
    const keys = deriveKeysFromSignature(signature);

    // Store keys locally
    await keyStore.setItem(WALLET_ADDRESS_KEY, walletAddress);
    await keyStore.setItem(KEY_STORAGE_KEY, keys);

    return keys;
}

/**
 * Get stored keys without regenerating
 * @returns {Promise<Object|null>} { publicKey, secretKey } or null
 */
export async function getStoredKeys() {
    return await keyStore.getItem(KEY_STORAGE_KEY);
}

/**
 * Get stored wallet address
 * @returns {Promise<string|null>}
 */
export async function getStoredWalletAddress() {
    return await keyStore.getItem(WALLET_ADDRESS_KEY);
}

/**
 * Clear all stored keys (for logout)
 */
export async function clearKeys() {
    await keyStore.removeItem(KEY_STORAGE_KEY);
    await keyStore.removeItem(WALLET_ADDRESS_KEY);
}

/**
 * Check if keys exist for current session
 * @returns {Promise<boolean>}
 */
export async function hasStoredKeys() {
    const keys = await keyStore.getItem(KEY_STORAGE_KEY);
    return keys !== null;
}

/**
 * Store keys derived from a signature (for Electron hybrid auth)
 * @param {string} walletAddress - The Ethereum wallet address
 * @param {string} signature - The signature from browser auth
 * @returns {Promise<Object>} { publicKey, secretKey, address }
 */
export async function storeKeysFromSignature(walletAddress, signature) {
    const keys = deriveKeysFromSignature(signature);

    // Add address to keys object for later reference
    const keysWithAddress = {
        ...keys,
        address: walletAddress,
    };

    // Store keys locally
    await keyStore.setItem(WALLET_ADDRESS_KEY, walletAddress);
    await keyStore.setItem(KEY_STORAGE_KEY, keysWithAddress);

    return keysWithAddress;
}
