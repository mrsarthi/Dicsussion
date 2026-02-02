// Message Service - High-level messaging API
import { encryptMessage, decryptMessage } from '../crypto/crypto';
import { getStoredKeys } from '../crypto/keyManager';
import * as gunService from './gunService';

/**
 * Send an encrypted message to a recipient
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

    // Get recipient's public key
    const recipient = await gunService.getUser(recipientAddress);
    if (!recipient || !recipient.publicKey) {
        throw new Error('Recipient not found or has no public key registered.');
    }

    // Encrypt the message
    const encryptedData = encryptMessage(plainText, recipient.publicKey, myKeys.secretKey);

    // Send via GunDB
    const messageId = gunService.sendMessage(senderAddress, recipientAddress, encryptedData);

    return {
        id: messageId,
        from: senderAddress,
        to: recipientAddress,
        content: plainText, // Keep plaintext for sender's view
        encrypted: encryptedData.encrypted, // Include for debug view
        nonce: encryptedData.nonce, // Include for debug view
        timestamp: Date.now(),
        status: 'sent',
    };
}

/**
 * Decrypt a received message
 * @param {Object} encryptedMessage - Message object from GunDB
 * @returns {Promise<Object>} Decrypted message object
 */
export async function decryptReceivedMessage(encryptedMessage) {
    const myKeys = await getStoredKeys();
    if (!myKeys) {
        throw new Error('No encryption keys found.');
    }

    // Get sender's public key
    const sender = await gunService.getUser(encryptedMessage.from);
    if (!sender || !sender.publicKey) {
        return {
            ...encryptedMessage,
            content: '[Unable to decrypt: sender unknown]',
            decryptionFailed: true,
        };
    }

    // Decrypt
    const plainText = decryptMessage(
        encryptedMessage.encrypted,
        encryptedMessage.nonce,
        sender.publicKey,
        myKeys.secretKey
    );

    if (plainText === null) {
        return {
            ...encryptedMessage,
            content: '[Decryption failed]',
            decryptionFailed: true,
        };
    }

    return {
        ...encryptedMessage,
        content: plainText,
        decryptionFailed: false,
    };
}

/**
 * Start a conversation with a new user
 * @param {string} myAddress 
 * @param {string} theirAddress 
 * @param {Function} onMessage - Callback for new messages
 * @returns {Object} Conversation controller
 */
export async function startConversation(myAddress, theirAddress, onMessage) {
    // Check if the user exists
    const theirInfo = await gunService.getUser(theirAddress);
    if (!theirInfo) {
        throw new Error('User not found on the network.');
    }

    // Load existing messages
    const existingMessages = await gunService.getConversationMessages(myAddress, theirAddress);
    const decryptedMessages = [];

    for (const msg of existingMessages) {
        const decrypted = await decryptReceivedMessage(msg);
        decryptedMessages.push(decrypted);
    }

    // Track seen message IDs
    const seenIds = new Set(decryptedMessages.map(m => m.id));

    // Subscribe to new messages
    const subscription = gunService.subscribeToConversation(myAddress, theirAddress, async (msg) => {
        if (!seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            const decrypted = await decryptReceivedMessage(msg);
            onMessage(decrypted);
        }
    });

    return {
        existingMessages: decryptedMessages,
        theirInfo,
        unsubscribe: () => subscription.off(),
    };
}

/**
 * Search for a user by address or username
 * @param {string} query - Address or username
 * @returns {Promise<Object|null>}
 */
export async function searchUser(query) {
    // Check if it's an address
    if (query.startsWith('0x') && query.length === 42) {
        return await gunService.getUser(query);
    }

    // Try as username
    const address = await gunService.getAddressByUsername(query);
    if (address) {
        return await gunService.getUser(address);
    }

    return null;
}
