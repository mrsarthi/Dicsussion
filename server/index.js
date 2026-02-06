// DecentraChat Signaling Server
// Handles: WebRTC signaling, presence, offline message store-and-forward
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for development
        methods: ["GET", "POST"]
    }
});

// In-memory stores (use Redis/SQLite for production persistence)
const users = new Map(); // address -> { socketId, publicKey, online, username }
const usernames = new Map(); // username -> address (for lookup)
const offlineMessages = new Map(); // address -> [messages]
const messageHistory = new Map(); // conversationId -> [messages]
const peerConnections = new Map(); // peerId -> { from, to }

// Helper: Get conversation ID (consistent ordering)
function getConversationId(addr1, addr2) {
    const sorted = [addr1.toLowerCase(), addr2.toLowerCase()].sort();
    return `${sorted[0]}_${sorted[1]}`;
}

// Helper: Store message in history
function storeMessage(msg) {
    const convId = getConversationId(msg.from, msg.to);
    const history = messageHistory.get(convId) || [];
    // Avoid duplicates
    if (!history.some(m => m.id === msg.id)) {
        history.push(msg);
        // Keep last 100 messages per conversation
        if (history.length > 100) {
            history.shift();
        }
        messageHistory.set(convId, history);
    }
}

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'DecentraChat Signaling Server',
        users: users.size,
        conversations: messageHistory.size,
        pendingMessages: [...offlineMessages.values()].flat().length
    });
});

io.on('connection', (socket) => {
    console.log(`[+] Client connected: ${socket.id}`);

    // User registration with wallet address
    socket.on('register', ({ address, publicKey, username }) => {
        const normalizedAddress = address.toLowerCase();

        // Get existing username for this user if any
        const existingUser = users.get(normalizedAddress);
        const existingUsername = existingUser?.username || username;

        // Store user info
        users.set(normalizedAddress, {
            socketId: socket.id,
            publicKey,
            online: true,
            lastSeen: Date.now(),
            username: existingUsername
        });

        // Also add to usernames lookup map if username exists
        if (existingUsername) {
            usernames.set(existingUsername.toLowerCase(), normalizedAddress);
        }

        socket.address = normalizedAddress;
        socket.join(normalizedAddress);

        console.log(`[✓] Registered: ${normalizedAddress.slice(0, 10)}...${existingUsername ? ` (@${existingUsername})` : ''}`);

        // Deliver any offline messages
        const pending = offlineMessages.get(normalizedAddress) || [];
        if (pending.length > 0) {
            console.log(`[→] Delivering ${pending.length} offline messages to ${normalizedAddress.slice(0, 10)}...`);
            pending.forEach(msg => {
                socket.emit('message', msg);
            });
            offlineMessages.delete(normalizedAddress);
        }

        // Notify sender about successful registration
        socket.emit('registered', {
            address: normalizedAddress,
            publicKey,
            username: existingUsername
        });

        // Broadcast online status to everyone else
        socket.broadcast.emit('userStatus', {
            address: normalizedAddress,
            online: true,
            lastSeen: Date.now()
        });
    });

    // Set username for a user
    socket.on('setUsername', ({ username }, callback) => {
        if (!socket.address) {
            callback({ success: false, error: 'Not registered' });
            return;
        }

        const normalizedUsername = username.toLowerCase().trim();

        // Validate username
        if (normalizedUsername.length < 3 || normalizedUsername.length > 20) {
            callback({ success: false, error: 'Username must be 3-20 characters' });
            return;
        }
        if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
            callback({ success: false, error: 'Username can only contain letters, numbers, and underscores' });
            return;
        }

        // Check if username is taken (by someone else)
        const existingAddress = usernames.get(normalizedUsername);
        if (existingAddress && existingAddress !== socket.address) {
            callback({ success: false, error: 'Username already taken' });
            return;
        }

        // Remove old username mapping if user had one
        const user = users.get(socket.address);
        if (user?.username) {
            usernames.delete(user.username.toLowerCase());
        }

        // Set new username
        usernames.set(normalizedUsername, socket.address);
        user.username = username; // Keep original casing
        users.set(socket.address, user);

        console.log(`[@] Username set: ${socket.address.slice(0, 10)}... -> @${username}`);
        callback({ success: true, username });
    });

    // Lookup user by username
    socket.on('lookupByUsername', ({ username }, callback) => {
        const normalizedUsername = username.toLowerCase().trim().replace('@', '');
        const address = usernames.get(normalizedUsername);

        if (address) {
            const user = users.get(address);
            callback({
                address,
                username: user?.username,
                publicKey: user?.publicKey,
                online: user?.online
            });
        } else {
            callback(null);
        }
    });

    // Get user's public key
    socket.on('getPublicKey', ({ address }, callback) => {
        const user = users.get(address.toLowerCase());
        callback(user ? { publicKey: user.publicKey, online: user.online } : null);
    });

    // WebRTC Signaling: Offer
    socket.on('signal', ({ to, signal }) => {
        const toAddress = to.toLowerCase();
        const recipient = users.get(toAddress);

        if (recipient && recipient.online) {
            io.to(recipient.socketId).emit('signal', {
                from: socket.address,
                signal
            });
        }
    });

    // Send encrypted message
    socket.on('sendMessage', (messageData) => {
        const { to, ...rest } = messageData;
        const toAddress = to.toLowerCase();
        const recipient = users.get(toAddress);

        const fullMessage = {
            ...rest,
            to: toAddress,
            from: socket.address,
            timestamp: Date.now(),
            id: rest.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        // Store in history (always, for both parties to fetch later)
        storeMessage(fullMessage);

        if (recipient && recipient.online) {
            // Deliver immediately
            io.to(recipient.socketId).emit('message', fullMessage);
            socket.emit('messageStatus', { id: fullMessage.id, status: 'delivered' });
            console.log(`[→] Message delivered: ${socket.address?.slice(0, 6)} → ${toAddress.slice(0, 6)}`);
        } else {
            // Store for offline delivery
            const pending = offlineMessages.get(toAddress) || [];
            pending.push(fullMessage);
            offlineMessages.set(toAddress, pending);
            socket.emit('messageStatus', { id: fullMessage.id, status: 'stored' });
            console.log(`[📦] Message stored for offline: ${toAddress.slice(0, 6)}`);
        }

        // Send back to sender for confirmation
        socket.emit('messageSent', fullMessage);
    });

    // Check if user is online
    socket.on('checkOnline', ({ address }, callback) => {
        const user = users.get(address.toLowerCase());
        callback(user ? user.online : false);
    });

    // Get status for multiple users
    socket.on('getUsersStatus', ({ addresses }, callback) => {
        const statuses = {};
        if (Array.isArray(addresses)) {
            addresses.forEach(addr => {
                const normalized = addr.toLowerCase();
                const user = users.get(normalized);
                if (user) {
                    statuses[normalized] = {
                        online: user.online,
                        lastSeen: user.lastSeen
                    };
                } else {
                    statuses[normalized] = {
                        online: false,
                        lastSeen: null
                    };
                }
            });
        }
        callback(statuses);
    });

    // Get user info
    socket.on('getUser', ({ address }, callback) => {
        const user = users.get(address.toLowerCase());
        if (user) {
            callback({
                address: address.toLowerCase(),
                publicKey: user.publicKey,
                online: user.online,
                lastSeen: user.lastSeen
            });
        } else {
            callback(null);
        }
    });

    // Get conversation history
    socket.on('getHistory', ({ peerAddress }, callback) => {
        if (!socket.address) {
            callback([]);
            return;
        }
        const convId = getConversationId(socket.address, peerAddress.toLowerCase());
        const history = messageHistory.get(convId) || [];

        // Enrich messages with sender usernames if not already present
        const enrichedHistory = history.map(msg => {
            if (!msg.senderUsername && msg.from) {
                const sender = users.get(msg.from.toLowerCase());
                if (sender?.username) {
                    return { ...msg, senderUsername: sender.username };
                }
            }
            return msg;
        });

        console.log(`[📜] Returning ${enrichedHistory.length} messages for conversation`);
        callback(enrichedHistory);
    });

    // Handle message receipts (delivered/read)
    socket.on('messageReceipt', ({ messageId, to, type }) => {
        const toAddress = to.toLowerCase();
        const recipient = users.get(toAddress);

        // Update message in history
        for (const [convId, messages] of messageHistory.entries()) {
            const msg = messages.find(m => m.id === messageId);
            if (msg) {
                msg.status = type; // 'delivered' or 'read'
                break;
            }
        }

        // Relay receipt to sender
        if (recipient && recipient.online) {
            io.to(recipient.socketId).emit('messageReceipt', {
                messageId,
                type,
                from: socket.address
            });
            console.log(`[✓] ${type} receipt: ${messageId.slice(0, 15)}... to ${toAddress.slice(0, 6)}`);
        }
    });

    // Disconnect handling
    socket.on('disconnect', () => {
        const address = socket.address;

        if (address) {
            const user = users.get(address);
            if (user && user.socketId === socket.id) {
                // Only mark offline if this was the active socket
                user.online = false;
                user.lastSeen = Date.now();
                users.set(address, user);

                // Broadcast offline status
                socket.broadcast.emit('userStatus', {
                    address: address,
                    online: false,
                    lastSeen: user.lastSeen
                });
                console.log(`[-] Disconnected (User Offline): ${address.slice(0, 10)}...`);
            } else {
                console.log(`[-] Disconnected (Stale Socket or Replaced): ${address.slice(0, 10)}...`);
            }
        } else {
            console.log(`[-] Disconnected (Unregistered Socket): ${socket.id}`);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 DecentraChat Signaling Server                        ║
║                                                           ║
║   Local:  http://localhost:${PORT}                         ║
║   Status: Ready for connections                           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
