// GunDB Service - Decentralized P2P messaging
import Gun from 'gun/gun';
import 'gun/sea';

// Initialize Gun with custom relay for reliable connectivity
const gun = Gun({
    peers: [
        'https://gun-manhattan.herokuapp.com/gun',
        'https://gun-us.herokuapp.com/gun',
        'https://gun-eu.herokuapp.com/gun'
    ],
    localStorage: true,
    radisk: true, // Enable disk storage
});

// Get the root user graph
const users = gun.get('decentrachat_users_v2'); // Use v2 to avoid stale data
const messages = gun.get('decentrachat_messages_v2');
const signals = gun.get('decentrachat_signals_v2');

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

    // Put data multiple times to ensure sync across peers
    const userRef = users.get(address.toLowerCase());
    userRef.put(userData);

    // Force sync after a delay
    setTimeout(() => {
        userRef.put({ lastSeen: Date.now() });
    }, 1000);

    if (username) {
        gun.get('decentrachat_usernames_v2').get(username.toLowerCase()).put({
            address: address.toLowerCase(),
        });
    }

    console.log('User registered:', address.toLowerCase());
}

/**
 * Get a user's public key by address with retry logic
 * @param {string} address - Ethereum address
 * @returns {Promise<Object|null>}
 */
export function getUser(address) {
    return new Promise((resolve) => {
        const normalizedAddress = address.toLowerCase();
        let resolved = false;
        let attempts = 0;
        const maxAttempts = 3;

        const tryFetch = () => {
            attempts++;
            users.get(normalizedAddress).once((data) => {
                if (!resolved) {
                    if (data && data.publicKey) {
                        resolved = true;
                        console.log('User found:', normalizedAddress);
                        resolve(data);
                    } else if (attempts < maxAttempts) {
                        // Retry after delay
                        setTimeout(tryFetch, 500);
                    } else {
                        resolved = true;
                        console.log('User not found after retries:', normalizedAddress);
                        resolve(null);
                    }
                }
            });
        };

        tryFetch();

        // Timeout fallback
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve(null);
            }
        }, 5000);
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
        senderPublicKey: encryptedData.senderPublicKey,
        timestamp: Date.now(),
    };

    console.log('📤 Sending message to conversation:', conversationId);
    messages.get(conversationId).get(messageId).put(messageData);

    // Update last seen
    users.get(senderAddress.toLowerCase()).get('lastSeen').put(Date.now());

    // Add to both users' chat list with timestamp
    const chatInfo = {
        lastMessageAt: Date.now(),
        with: recipientAddress.toLowerCase()
    };

    // Add to sender's chat list
    gun.get('user_chats_v2').get(senderAddress.toLowerCase()).get(recipientAddress.toLowerCase()).put(chatInfo);

    // Add to recipient's chat list
    const recipientChatInfo = {
        lastMessageAt: Date.now(),
        with: senderAddress.toLowerCase()
    };
    gun.get('user_chats_v2').get(recipientAddress.toLowerCase()).get(senderAddress.toLowerCase()).put(recipientChatInfo);

    return messageId;
}

/**
 * Update message status (delivered/read)
 * @param {string} conversationId 
 * @param {string} messageId 
 * @param {string} status - 'delivered' | 'read'
 */
export function updateMessageStatus(conversationId, messageId, status) {
    if (!conversationId || !messageId) return;
    messages.get(conversationId).get(messageId).get('status').put(status);
}

/**
 * Subscribe to user's active chats list
 * @param {string} myAddress 
 * @param {Function} callback 
 */
export function subscribeToUserChats(myAddress, callback) {
    return gun.get('user_chats_v2').get(myAddress.toLowerCase()).map().on((data, key) => {
        if (data && key !== '_' && data.with) {
            callback(data);
        }
    });
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
    console.log('👂 Subscribing to conversation:', conversationId);

    const subscription = messages.get(conversationId).map().on((data, key) => {
        if (data && key !== '_') {
            console.log('📩 Received message:', data.id, 'from:', data.from?.slice(0, 10));
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

        // Give Gun a moment to collect messages, but much faster
        // Or resolve immediately if map() calls are sync (Gun's usually async)
        // A small delay is still good for initial batching, but 1s is too long.
        // Let's try 100ms - enough to grab local messages
        setTimeout(() => {
            allMessages.sort((a, b) => a.timestamp - b.timestamp);
            resolve(allMessages);
        }, 100);
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
 * Send WebRTC signal via Gun
 * @param {string} toAddress 
 * @param {Object} signal 
 */
export function sendSignal(toAddress, signal) {
    const signalId = `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const myAddress = localStorage.getItem('decentrachat_address'); // or pass it in

    // We can't easily get "myAddress" here without passing it, 
    // but the caller usually knows who they are.
    // Ideally update sendSignal signature to (from, to, signal)
    // For now let's assume the signal object has 'from' or we update signature.
}

/**
 * Send WebRTC signal via Gun (Corrected)
 * @param {string} fromAddress
 * @param {string} toAddress
 * @param {Object} signal
 */
export function sendSignalV2(fromAddress, toAddress, signal) {
    const signalData = {
        signal,
        from: fromAddress.toLowerCase(),
        timestamp: Date.now()
    };

    // Put to the recipient's signal graph
    signals.get(toAddress.toLowerCase()).set(signalData);
}

/**
 * Subscribe to incoming signals
 * @param {string} myAddress
 * @param {Function} callback
 */
export function subscribeToSignals(myAddress, callback) {
    // Only process recent signals (last 10 seconds) to avoid processing old logic
    const startTime = Date.now() - 10000;

    signals.get(myAddress.toLowerCase()).map().on((data, key) => {
        if (data && data.timestamp > startTime) {
            callback(data);
        }
    });
}

/**
 * Get the Gun instance for advanced usage
 */
export function getGun() {
    return gun;
}
