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
        throw new Error('Waiting for recipient to come online. Their public key is not yet synced. They need to connect to DecentraChat first.');
    }

    // Encrypt the message
    const encryptedData = encryptMessage(plainText, recipient.publicKey, myKeys.secretKey);

    // Send via GunDB with sender's public key attached
    const payload = {
        ...encryptedData,
        senderPublicKey: myKeys.publicKey // Attach identity proof
    };

    const messageId = gunService.sendMessage(senderAddress, recipientAddress, payload);

    return {
        id: messageId,
        from: senderAddress,
        to: recipientAddress,
        content: plainText, // Keep plaintext for sender's view
        encrypted: encryptedData.encrypted, // Include for debug view
        nonce: encryptedData.nonce, // Include for debug view
        senderPublicKey: myKeys.publicKey,
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

    // Try to get public key from message itself first (new protocol)
    let senderPublicKey = encryptedMessage.senderPublicKey;

    if (!senderPublicKey) {
        const sender = await gunService.getUser(encryptedMessage.from);
        if (sender) senderPublicKey = sender.publicKey;
    }

    // SPECIAL CASE: If I am the sender, I need to use the RECIPIENT'S public key 
    // to derive the shared secret.
    if (encryptedMessage.from.toLowerCase() === myKeys.address.toLowerCase()) {
        const recipient = await gunService.getUser(encryptedMessage.to);
        if (recipient) {
            senderPublicKey = recipient.publicKey;
        }
    }

    // HANDLE PARTIAL UPDATES (Status changes)
    // If message has no encrypted content (just status update), return as is
    if (!encryptedMessage.encrypted && encryptedMessage.status) {
        return {
            ...encryptedMessage,
            decryptionFailed: false // It's just a status update
        };
    }

    if (!senderPublicKey) {
        return {
            ...encryptedMessage,
            content: '[Unable to decrypt: sender unknown]',
            decryptionFailed: true
        };
    }

    try {
        const decryptedContent = decryptMessage(
            encryptedMessage.encrypted,
            encryptedMessage.nonce,
            senderPublicKey,
            myKeys.secretKey
        );

        return {
            ...encryptedMessage,
            content: decryptedContent,
            decryptionFailed: false
        };
    } catch (err) {
        // If decryption fails for self-message, it might be because we don't have the right key pair anymore
        // or the message was strictly encrypted for the recipient only (if ephemeral keys used)
        // But with standard Nacl Box, it should work.
        console.error('Decryption failed:', err);
        return {
            ...encryptedMessage,
            content: '[Decryption Failed]',
            decryptionFailed: true
        };
    }
}

/**
 * Start a conversation with a new user
 * @param {string} myAddress 
 * @param {string} theirAddress 
 * @param {Function} onMessage - Callback for new messages
 * @returns {Object} Conversation controller
 */
export async function startConversation(myAddress, theirAddress, onMessage) {
    // Try to get their info, but don't require it
    // They might not be registered yet, but we can still start a chat
    const theirInfo = await gunService.getUser(theirAddress);

    // If not found, we'll create a placeholder - messages will sync when they join

    // Load existing messages
    const existingMessages = await gunService.getConversationMessages(myAddress, theirAddress);
    const decryptedMessages = [];

    for (const msg of existingMessages) {
        const decrypted = await decryptReceivedMessage(msg);
        decryptedMessages.push(decrypted);
    }

    // Track seen message IDs to distinguish NEW messages from duplicates
    // But we MUST allow updates to seen messages (e.g. status changes)
    const seenIds = new Set(decryptedMessages.map(m => m.id));

    // Subscribe to new messages
    const subscription = gunService.subscribeToConversation(myAddress, theirAddress, async (msg) => {
        // If it's a NEW message
        if (!seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            const decrypted = await decryptReceivedMessage(msg);
            onMessage(decrypted);
        } else {
            // It's an UPDATE (e.g. status change)
            // Even if we've seen it, pass it through so UI can update status
            // For updates, we might receive partial data, so decryptReceivedMessage needs to handle that (added above)
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

/**
 * Mark a message as delivered
 * @param {string} senderAddress 
 * @param {string} recipientAddress 
 * @param {string} messageId 
 */
export function markMessageAsDelivered(senderAddress, recipientAddress, messageId) {
    const conversationId = gunService.getConversationId(senderAddress, recipientAddress);
    gunService.updateMessageStatus(conversationId, messageId, 'delivered');
}

/**
 * Mark a message as read
 * @param {string} senderAddress 
 * @param {string} recipientAddress 
 * @param {string} messageId 
 */
export function markMessageAsRead(senderAddress, recipientAddress, messageId) {
    const conversationId = gunService.getConversationId(senderAddress, recipientAddress);
    gunService.updateMessageStatus(conversationId, messageId, 'read');
}
