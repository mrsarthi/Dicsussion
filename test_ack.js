import { io } from 'socket.io-client';

const socket = io('http://localhost:10000');

socket.on('connect', () => {
    console.log('Connected!');

    // Register as B
    const bAddress = '0x123B';
    socket.emit('register', { address: bAddress, publicKey: 'pubB', username: 'UserB' });
});

socket.on('registered', (data) => {
    console.log('Registered as', data.address);
    if (data.address === '0x123b') {
        // Fetch offline messages
        console.log('Fetching offline messages...');
        socket.emit('fetchOfflineMessages');
    }
});

socket.on('message', (msg) => {
    console.log('Received message:', msg);
    console.log('Sending ACK for:', [msg.id]);
    socket.emit('ackOfflineMessages', { messageIds: [msg.id] });
    setTimeout(() => {
        console.log('Sending status request to check pending messages');
        process.exit(0);
    }, 1000);
});
