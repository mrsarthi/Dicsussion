// Message Service - High-level messaging API with hybrid P2P/Relay transport
import { encryptMessage, decryptMessage } from '../crypto/crypto';
import { getStoredKeys } from '../crypto/keyManager';
import * as socketService from './socketService';
import * as webrtcService from './webrtcService';


// Track sent message IDs for deduplication
const sentMessageIds = new Set();

/**
 * Initialize messaging services
 */
export function initMessaging() {
    // Initialize WebRTC service (sets up signal listener)
    webrtcService.init();
}

/**
 * Register user with the messaging network
 * @param {string} address - Wallet address
 * @param {string} publicKey - Encryption public key
 */
export async function registerUser(address, publicKey) {
    socketService.initSocket();
    await socketService.register(address, publicKey);

    localStorage.setItem('decentrachat_address', address);
}

/**
 * Send an encrypted message to a recipient
 * Uses P2P if connected, falls back to server relay
 * @param {string} senderAddress - Sender's wallet address
 * @param {string} recipientAddress - Recipient's wallet address
 * @param {string} plainText - The message content
 * @returns {Promise<Object>} The sent message object
 */
export async function sendEncryptedMessage(senderAddress, recipientAddress, plainText) {
    // Get our keys
    const myKeys = await getStoredKeys();
    if (!myKeys) {
        throw new Error('No encryption keys found. Please reconnect your wallet.');
    }

    // Get recipient's public key from server (Primary)
    let recipientPubKey = await socketService.getPublicKey(recipientAddress);





    if (!recipientPubKey) {
        throw new Error('Recipient not found. They need to connect to DecentraChat first.');
    }

    // Encrypt the message
    const encryptedData = encryptMessage(plainText, recipientPubKey, myKeys.secretKey);

    // Get sender's username from localStorage
    const senderUsername = localStorage.getItem('decentrachat_username') || null;

    // Build message payload
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const payload = {
        id: messageId,
        encrypted: encryptedData.encrypted,
        nonce: encryptedData.nonce,
        senderPublicKey: myKeys.publicKey,
        senderUsername: senderUsername, // Include username in message
        timestamp: Date.now(),
    };

    // Track for deduplication
    sentMessageIds.add(messageId);

    // Try P2P first
    const p2pSent = webrtcService.sendToPeer(recipientAddress, {
        ...payload,
        from: senderAddress,
        to: recipientAddress,
    });

    if (!p2pSent) {
        // Hybrid: Use Relay
        // Prefer Server Relay if connected
        if (socketService.isConnected()) {
            console.log('📡 Using server relay for message delivery');
            socketService.sendMessage(recipientAddress, payload);
        } else {
            console.warn('⚠️ Server unreachable and P2P failed. Message could not be sent.');
            throw new Error('Server unreachable. Cannot send message via relay.');
        }
    }

    return {
        id: messageId,
        from: senderAddress,
        to: recipientAddress,
        content: plainText,
        encrypted: encryptedData.encrypted,
        nonce: encryptedData.nonce,
        senderPublicKey: myKeys.publicKey,
        senderUsername: senderUsername,
        timestamp: Date.now(),
        status: 'sent',
        transport: p2pSent ? 'p2p' : 'relay',
    };
}

/**
 * Decrypt a received message
 * @param {Object} encryptedMessage - Message object
 * @param {Object} cachedKeys - Optional cached keys
 * @param {string} myAddress - Optional current user's address for sender detection
 * @returns {Promise<Object>} Decrypted message object
 */
export async function decryptReceivedMessage(encryptedMessage, cachedKeys = null, myAddress = null) {
    if (!encryptedMessage) return null;

    const myKeys = cachedKeys || await getStoredKeys();
    if (!myKeys) {
        throw new Error('No encryption keys found.');
    }

    // Handle status-only updates
    if (!encryptedMessage.encrypted && encryptedMessage.status) {
        return {
            ...encryptedMessage,
            decryptionFailed: false
        };
    }

    // Determine if I'm the sender - use passed address or keys.address
    const walletAddress = myAddress || myKeys.address;
    const iAmSender = walletAddress &&
        encryptedMessage.from?.toLowerCase() === walletAddress.toLowerCase();

    // Get the appropriate public key for decryption
    let otherPartyPublicKey = encryptedMessage.senderPublicKey;

    // If I'm the sender, I need recipient's public key to decrypt
    if (iAmSender) {
        otherPartyPublicKey = await socketService.getPublicKey(encryptedMessage.to);
    }

    if (!otherPartyPublicKey) {
        return {
            ...encryptedMessage,
            content: '[Unable to decrypt: key not found]',
            decryptionFailed: true
        };
    }

    try {
        const decryptedContent = decryptMessage(
            encryptedMessage.encrypted,
            encryptedMessage.nonce,
            otherPartyPublicKey,
            myKeys.secretKey
        );

        return {
            ...encryptedMessage,
            content: decryptedContent,
            decryptionFailed: false
        };
    } catch (err) {
        console.error('Decryption failed:', err);
        return {
            ...encryptedMessage,
            content: '[Decryption Failed]',
            decryptionFailed: true
        };
    }
}

/**
 * Subscribe to incoming messages (P2P + Server relay)
 * @param {Function} onMessage - Callback for new messages
 * @param {Object} myKeys - User's keys for decryption
 */
export function subscribeToMessages(onMessage, myKeys) {
    const processedIds = new Set();

    const handleMessage = async (msg) => {
        // Skip if we sent this message
        if (sentMessageIds.has(msg.id)) return;

        // Skip duplicates
        if (processedIds.has(msg.id)) return;
        processedIds.add(msg.id);

        const decrypted = await decryptReceivedMessage(msg, myKeys);
        onMessage(decrypted);
    };

    // Listen to server relay
    socketService.onMessage(handleMessage);

    // Listen to P2P
    webrtcService.onData((msg) => {
        handleMessage(msg);
    });
}

/**
 * Try to establish P2P connection with a user
 * @param {string} theirAddress
 */
export async function connectToPeer(theirAddress) {
    return await webrtcService.connectToPeer(theirAddress);
}

/**
 * Get connection type with a peer
 * @param {string} peerAddress
 * @returns {'p2p' | 'relay' | 'offline'}
 */
export function getConnectionType(peerAddress) {
    return webrtcService.getConnectionType(peerAddress);
}

/**
 * Search for a user by address or username
 * @param {string} query - Address (0x...) or username (@username or username)
 * @returns {Promise<Object|null>}
 */
export async function searchUser(query) {
    const trimmed = query.trim();

    // Search by address
    if (trimmed.startsWith('0x') && trimmed.length === 42) {
        return await socketService.getUser(trimmed);
    }

    // Search by username
    if (trimmed.length >= 3) {
        const username = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;

        // 1. Try Socket
        const socketUser = await socketService.lookupByUsername(username);
        if (socketUser) return socketUser;
    }

    return null;
}

/**
 * Get conversation history with a peer
 * @param {string} peerAddress
 * @returns {Promise<Array>}
 */
export async function getHistory(peerAddress) {
    return await socketService.getHistory(peerAddress);
}

/**
 * Send a delivery receipt
 * @param {string} senderAddress - Original sender's address
 * @param {string} messageId
 */
export function sendDeliveryReceipt(senderAddress, messageId) {
    socketService.sendReceipt(messageId, senderAddress, 'delivered');
}

/**
 * Send a read receipt
 * @param {string} senderAddress - Original sender's address
 * @param {string} messageId
 */
export function sendReadReceipt(senderAddress, messageId) {
    socketService.sendReceipt(messageId, senderAddress, 'read');
}

/**
 * Subscribe to message receipts
 * @param {Function} callback - Called with { messageId, type, from }
 */
export function onMessageReceipt(callback) {
    socketService.onReceipt(callback);
}

/**
 * Subscribe to connection status changes
 * @param {Function} callback 
 */
export function onConnectionChange(callback) {
    socketService.onConnectionChange(callback);
}
