// GunDB Service - Decentralized P2P messaging
import Gun from 'gun/gun';
import 'gun/sea';

// Initialize Gun with public relay peers
const gun = Gun({
    peers: [
        'https://gun-manhattan.herokuapp.com/gun',
        'https://gun-us.herokuapp.com/gun',
    ],
    localStorage: true,
});

// Get the root user graph
const users = gun.get('decentrachat_users');
const messages = gun.get('decentrachat_messages');

/**
 * Register a user's public key on the network
 * @param {string} address - Ethereum address
 * @param {string} publicKey - Encryption public key
 * @param {string} username - Optional username
 */
export function registerUser(address, publicKey, username = null) {
    const userData = {
        address: address.toLowerCase(),
        publicKey,
        username: username || null,
        registeredAt: Date.now(),
        lastSeen: Date.now(),
    };

    users.get(address.toLowerCase()).put(userData);

    if (username) {
        gun.get('decentrachat_usernames').get(username.toLowerCase()).put({
            address: address.toLowerCase(),
        });
    }
}

/**
 * Get a user's public key by address
 * @param {string} address - Ethereum address
 * @returns {Promise<Object|null>}
 */
export function getUser(address) {
    return new Promise((resolve) => {
        users.get(address.toLowerCase()).once((data) => {
            resolve(data || null);
        });
    });
}

/**
 * Look up address by username
 * @param {string} username 
 * @returns {Promise<string|null>}
 */
export function getAddressByUsername(username) {
    return new Promise((resolve) => {
        gun.get('decentrachat_usernames').get(username.toLowerCase()).once((data) => {
            resolve(data?.address || null);
        });
    });
}

/**
 * Create a unique conversation ID for two addresses
 * @param {string} addr1 
 * @param {string} addr2 
 * @returns {string}
 */
export function getConversationId(addr1, addr2) {
    const sorted = [addr1.toLowerCase(), addr2.toLowerCase()].sort();
    return `conv_${sorted[0]}_${sorted[1]}`;
}

/**
 * Send an encrypted message
 * @param {string} senderAddress 
 * @param {string} recipientAddress 
 * @param {Object} encryptedData - { encrypted, nonce }
 */
export function sendMessage(senderAddress, recipientAddress, encryptedData) {
    const conversationId = getConversationId(senderAddress, recipientAddress);
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const messageData = {
        id: messageId,
        from: senderAddress.toLowerCase(),
        to: recipientAddress.toLowerCase(),
        encrypted: encryptedData.encrypted,
        nonce: encryptedData.nonce,
        timestamp: Date.now(),
    };

    messages.get(conversationId).get(messageId).put(messageData);

    // Update last seen
    users.get(senderAddress.toLowerCase()).get('lastSeen').put(Date.now());

    return messageId;
}

/**
 * Subscribe to messages in a conversation
 * @param {string} addr1 
 * @param {string} addr2 
 * @param {Function} callback - Called with each message
 * @returns {Object} Subscription that can be .off() to unsubscribe
 */
export function subscribeToConversation(addr1, addr2, callback) {
    const conversationId = getConversationId(addr1, addr2);

    const subscription = messages.get(conversationId).map().on((data, key) => {
        if (data && key !== '_') {
            callback(data);
        }
    });

    return subscription;
}

/**
 * Get all existing messages in a conversation
 * @param {string} addr1 
 * @param {string} addr2 
 * @returns {Promise<Array>}
 */
export function getConversationMessages(addr1, addr2) {
    const conversationId = getConversationId(addr1, addr2);

    return new Promise((resolve) => {
        const allMessages = [];

        messages.get(conversationId).map().once((data, key) => {
            if (data && key !== '_') {
                allMessages.push(data);
            }
        });

        // Give Gun time to collect messages
        setTimeout(() => {
            allMessages.sort((a, b) => a.timestamp - b.timestamp);
            resolve(allMessages);
        }, 1000);
    });
}

/**
 * Update user's online status
 * @param {string} address 
 */
export function updatePresence(address) {
    users.get(address.toLowerCase()).get('lastSeen').put(Date.now());
}

/**
 * Subscribe to a user's presence updates
 * @param {string} address 
 * @param {Function} callback 
 */
export function subscribeToPresence(address, callback) {
    users.get(address.toLowerCase()).get('lastSeen').on((lastSeen) => {
        const isOnline = lastSeen && (Date.now() - lastSeen < 60000); // Online if seen in last minute
        callback(isOnline, lastSeen);
    });
}

/**
 * Get the Gun instance for advanced usage
 */
export function getGun() {
    return gun;
}
