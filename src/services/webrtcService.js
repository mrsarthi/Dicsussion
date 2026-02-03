// WebRTC Service - P2P peer connection management
import * as socketService from './socketService';
import * as gunService from './gunService';

// SimplePeer will be loaded dynamically
let SimplePeer = null;

// Active peer connections
const peers = new Map(); // address -> SimplePeer instance
const connectionStates = new Map(); // address -> 'connecting' | 'connected' | 'disconnected'

// Callbacks
let dataCallback = null;
let initialized = false;

// STUN servers for NAT traversal (free Google servers)
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
];

/**
 * Initialize WebRTC service
 */
export async function init() {
    if (initialized) return;

    // Dynamically import SimplePeer to avoid SSR/initialization issues
    try {
        const module = await import('simple-peer');
        SimplePeer = module.default || module;
        console.log('✓ SimplePeer loaded');
    } catch (err) {
        console.error('Failed to load SimplePeer:', err);
        return;
    }

    // Listen for incoming signals from socket service
    // Listen for incoming signals from GunDB (fallback/primary now that server is down)
    // We need my address to subscribe
    const myAddress = localStorage.getItem('decentrachat_address');
    if (myAddress) {
        gunService.subscribeToSignals(myAddress, ({ from, signal }) => {
            handleIncomingSignal(from, signal);
        });
    }

    // Still listen to socket just in case it comes back up
    socketService.onSignal(({ from, signal }) => {
        handleIncomingSignal(from, signal);
    });

    initialized = true;
}

/**
 * Handle incoming WebRTC signal
 */
function handleIncomingSignal(fromAddress, signal) {
    let peer = peers.get(fromAddress);

    // If no peer exists, create one (we're receiving a call)
    if (!peer) {
        peer = createPeer(fromAddress, false);
    }

    // Apply the signal (only if peer was created successfully)
    if (peer) {
        peer.signal(signal);
    }
}

/**
 * Create a peer connection
 * @param {string} peerAddress - Address of the peer
 * @param {boolean} initiator - Whether we're initiating the connection
 */
function createPeer(peerAddress, initiator) {
    if (!SimplePeer) {
        console.error('SimplePeer not loaded yet');
        return null;
    }

    console.log(`🔗 Creating peer connection to ${peerAddress.slice(0, 10)}... (initiator: ${initiator})`);

    connectionStates.set(peerAddress, 'connecting');

    const peer = new SimplePeer({
        initiator,
        trickle: true,
        config: {
            iceServers: ICE_SERVERS
        }
    });

    // Send signals to the other peer via signaling server
    // Send signals to the other peer via GunDB (Relay)
    peer.on('signal', (signal) => {
        // We need 'from' address. Assuming it's stored in localStorage
        const myAddress = localStorage.getItem('decentrachat_address');
        if (myAddress) {
            gunService.sendSignalV2(myAddress, peerAddress, signal);
        }
        // Also try socket if connected
        if (socketService.isConnected()) {
            socketService.sendSignal(peerAddress, signal);
        }
    });

    // Connection established
    peer.on('connect', () => {
        console.log(`⚡ P2P connected to ${peerAddress.slice(0, 10)}!`);
        connectionStates.set(peerAddress, 'connected');
    });

    // Receive data from peer
    peer.on('data', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log(`📩 Received P2P message from ${peerAddress.slice(0, 10)}`);
            if (dataCallback) {
                dataCallback(message, peerAddress);
            }
        } catch (err) {
            console.error('Failed to parse P2P message:', err);
        }
    });

    // Connection closed
    peer.on('close', () => {
        console.log(`🔌 P2P connection closed with ${peerAddress.slice(0, 10)}`);
        connectionStates.set(peerAddress, 'disconnected');
        peers.delete(peerAddress);
    });

    // Error handling
    peer.on('error', (err) => {
        console.error(`P2P error with ${peerAddress.slice(0, 10)}:`, err.message);
        connectionStates.set(peerAddress, 'disconnected');
        peers.delete(peerAddress);
    });

    peers.set(peerAddress, peer);
    return peer;
}

/**
 * Connect to a peer
 * @param {string} peerAddress
 */
export async function connectToPeer(peerAddress) {
    // Check if already connected
    const existingPeer = peers.get(peerAddress);
    if (existingPeer && !existingPeer.destroyed) {
        return existingPeer;
    }

    // Check if peer is online
    const isOnline = await socketService.checkOnline(peerAddress);
    if (!isOnline) {
        console.log(`Peer ${peerAddress.slice(0, 10)} is offline, using relay`);
        return null;
    }

    // Create new connection as initiator
    return createPeer(peerAddress, true);
}

/**
 * Send data to a peer via P2P
 * @param {string} peerAddress
 * @param {Object} data
 * @returns {boolean} Success
 */
export function sendToPeer(peerAddress, data) {
    const peer = peers.get(peerAddress);

    if (peer && peer.connected && !peer.destroyed) {
        try {
            peer.send(JSON.stringify(data));
            console.log(`⚡ Sent P2P message to ${peerAddress.slice(0, 10)}`);
            return true;
        } catch (err) {
            console.error('P2P send failed:', err);
            return false;
        }
    }

    return false;
}

/**
 * Subscribe to incoming P2P data
 * @param {Function} callback
 */
export function onData(callback) {
    dataCallback = callback;
}

/**
 * Get connection type for a peer
 * @param {string} peerAddress
 * @returns {'p2p' | 'relay' | 'offline'}
 */
export function getConnectionType(peerAddress) {
    const state = connectionStates.get(peerAddress);
    if (state === 'connected') return 'p2p';

    // Check if online via relay
    const peer = peers.get(peerAddress);
    if (!peer || peer.destroyed) {
        return 'relay'; // Will use server relay
    }

    return state === 'connecting' ? 'relay' : 'offline';
}

/**
 * Check if peer is P2P connected
 * @param {string} peerAddress
 */
export function isPeerConnected(peerAddress) {
    const peer = peers.get(peerAddress);
    return peer && peer.connected && !peer.destroyed;
}

/**
 * Destroy a peer connection
 * @param {string} peerAddress
 */
export function destroyPeer(peerAddress) {
    const peer = peers.get(peerAddress);
    if (peer) {
        peer.destroy();
        peers.delete(peerAddress);
        connectionStates.delete(peerAddress);
    }
}

/**
 * Destroy all peer connections
 */
export function destroyAll() {
    peers.forEach((peer, address) => {
        peer.destroy();
    });
    peers.clear();
    connectionStates.clear();
}
