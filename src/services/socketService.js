// Socket.IO Service - Connection to signaling server
import { io } from 'socket.io-client';

// Server URL - change this after deploying to Render
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

let socket = null;
let messageCallback = null;
let signalCallback = null;
let receiptCallback = null;

/**
 * Initialize socket connection
 */
export function initSocket() {
    if (socket?.connected) return socket;

    socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
        console.log('🔌 Connected to signaling server');
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from signaling server');
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error.message);
    });

    // Handle incoming messages
    socket.on('message', (msg) => {
        console.log('📩 Received message via server');
        if (messageCallback) {
            messageCallback(msg);
        }
    });

    // Handle WebRTC signals
    socket.on('signal', (data) => {
        console.log('📡 Received WebRTC signal from:', data.from?.slice(0, 10));
        if (signalCallback) {
            signalCallback(data);
        }
    });

    // Handle message sent confirmation
    socket.on('messageSent', (msg) => {
        console.log('✓ Message sent confirmed:', msg.id);
    });

    // Handle message status updates
    socket.on('messageStatus', ({ id, status }) => {
        console.log(`📝 Message ${id} status: ${status}`);
    });

    // Handle message receipts (delivered/read)
    socket.on('messageReceipt', (data) => {
        console.log(`✓ Receipt: ${data.type} for ${data.messageId?.slice(0, 15)}`);
        if (receiptCallback) {
            receiptCallback(data);
        }
    });

    return socket;
}

/**
 * Register user with the server
 * @param {string} address - Wallet address
 * @param {string} publicKey - Encryption public key
 * @param {string} username - Optional username
 */
export function register(address, publicKey, username = null) {
    if (!socket) initSocket();

    return new Promise((resolve) => {
        socket.emit('register', { address, publicKey, username });
        socket.once('registered', (data) => {
            console.log('✓ Registered with server:', data.address?.slice(0, 10), data.username ? `(@${data.username})` : '');
            resolve(data);
        });
    });
}

/**
 * Set username for the current user
 * @param {string} username
 * @returns {Promise<{success: boolean, username?: string, error?: string}>}
 */
export function setUsername(username) {
    if (!socket?.connected) {
        return Promise.resolve({ success: false, error: 'Not connected' });
    }

    return new Promise((resolve) => {
        socket.emit('setUsername', { username }, (response) => {
            resolve(response);
        });
    });
}

/**
 * Lookup user by username
 * @param {string} username
 * @returns {Promise<{address, username, publicKey, online} | null>}
 */
export function lookupByUsername(username) {
    if (!socket?.connected) {
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        socket.emit('lookupByUsername', { username }, (response) => {
            resolve(response);
        });
    });
}

/**
 * Send an encrypted message
 * @param {string} to - Recipient address
 * @param {Object} messageData - Encrypted message data
 */
export function sendMessage(to, messageData) {
    if (!socket?.connected) {
        throw new Error('Not connected to server');
    }

    socket.emit('sendMessage', {
        to,
        ...messageData
    });
}

/**
 * Subscribe to incoming messages
 * @param {Function} callback
 */
export function onMessage(callback) {
    messageCallback = callback;
}

/**
 * Subscribe to WebRTC signals
 * @param {Function} callback
 */
export function onSignal(callback) {
    signalCallback = callback;
}

/**
 * Subscribe to message receipts (delivered/read)
 * @param {Function} callback
 */
export function onReceipt(callback) {
    receiptCallback = callback;
}

/**
 * Send a message receipt (delivered or read)
 * @param {string} messageId - The message ID
 * @param {string} to - Original sender's address
 * @param {'delivered' | 'read'} type - Receipt type
 */
export function sendReceipt(messageId, to, type) {
    if (!socket?.connected) return;
    socket.emit('messageReceipt', { messageId, to, type });
}

/**
 * Send WebRTC signal to peer
 * @param {string} to - Peer address
 * @param {Object} signal - WebRTC signal data
 */
export function sendSignal(to, signal) {
    if (!socket?.connected) return;
    socket.emit('signal', { to, signal });
}

/**
 * Get user info from server
 * @param {string} address
 */
export function getUser(address) {
    return new Promise((resolve) => {
        if (!socket?.connected) {
            resolve(null);
            return;
        }
        socket.emit('getUser', { address }, (user) => {
            resolve(user);
        });
    });
}

/**
 * Check if user is online
 * @param {string} address
 */
export function checkOnline(address) {
    return new Promise((resolve) => {
        if (!socket?.connected) {
            resolve(false);
            return;
        }
        socket.emit('checkOnline', { address }, (online) => {
            resolve(online);
        });
    });
}

/**
 * Get user's public key
 * @param {string} address
 */
export function getPublicKey(address) {
    return new Promise((resolve) => {
        if (!socket?.connected) {
            resolve(null);
            return;
        }
        socket.emit('getPublicKey', { address }, (result) => {
            resolve(result?.publicKey || null);
        });
    });
}

/**
 * Get conversation history with a peer
 * @param {string} peerAddress
 * @returns {Promise<Array>}
 */
export function getHistory(peerAddress) {
    return new Promise((resolve) => {
        if (!socket?.connected) {
            resolve([]);
            return;
        }
        socket.emit('getHistory', { peerAddress }, (history) => {
            console.log(`📜 Received ${history.length} historical messages`);
            resolve(history || []);
        });
    });
}

/**
 * Disconnect from server
 */
export function disconnect() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

/**
 * Check if connected
 */
export function isConnected() {
    return socket?.connected || false;
}

/**
 * Get socket instance
 */
export function getSocket() {
    return socket;
}
