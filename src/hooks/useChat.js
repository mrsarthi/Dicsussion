// useChat Hook - Manage chat conversations with hybrid P2P/Relay
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    sendEncryptedMessage,
    decryptReceivedMessage,
    subscribeToMessages,
    searchUser,
    registerUser,
    initMessaging,
    connectToPeer,
    getConnectionType,
    getHistory,
    sendDeliveryReceipt,
    sendReadReceipt,
    onMessageReceipt,
    onConnectionChange,
} from '../services/messageService';
import { getStoredKeys } from '../crypto/keyManager';

export function useChat(myAddress) {
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    // Load contacts from localStorage on init
    const [contacts, setContacts] = useState(() => {
        try {
            const saved = localStorage.getItem('decentrachat_contacts');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });
    const [connectionType, setConnectionType] = useState('offline');
    const [serverConnected, setServerConnected] = useState(false);
    const keysRef = useRef(null);
    const initializedRef = useRef(false);
    const activeChatRef = useRef(null);

    // Save contacts to localStorage whenever they change
    useEffect(() => {
        if (contacts.length > 0) {
            localStorage.setItem('decentrachat_contacts', JSON.stringify(contacts));
        }
    }, [contacts]);

    // Keep activeChatRef in sync with activeChat state
    useEffect(() => {
        activeChatRef.current = activeChat;
    }, [activeChat]);

    // Initialize messaging and subscribe to incoming messages
    useEffect(() => {
        if (!myAddress || initializedRef.current) return;

        let mounted = true;

        (async () => {
            // Initialize messaging (loads SimplePeer)
            await initMessaging();

            // Get stored keys
            const keys = await getStoredKeys();
            if (!keys || !mounted) return;

            keysRef.current = keys;

            // Register with server
            await registerUser(myAddress, keys.publicKey);

            if (!mounted) return;

            // Subscribe to incoming messages AFTER keys are loaded
            subscribeToMessages((msg) => {
                console.log('📨 Received message in hook:', msg.id, msg.content?.slice(0, 20));

                // Send delivery receipt back to sender
                if (msg.from && msg.from.toLowerCase() !== myAddress.toLowerCase()) {
                    sendDeliveryReceipt(msg.from, msg.id);

                    // If this chat is currently open, also send read receipt immediately
                    if (activeChatRef.current?.address?.toLowerCase() === msg.from.toLowerCase()) {
                        sendReadReceipt(msg.from, msg.id);
                    }
                }

                // Handle incoming message
                setMessages(prev => {
                    const exists = prev.some(m => m.id === msg.id);
                    if (exists) {
                        // Update existing message
                        return prev.map(m => m.id === msg.id ? msg : m);
                    }
                    return [...prev, msg].sort((a, b) => a.timestamp - b.timestamp);
                });

                // Add sender to contacts if not exists, use username from message
                // Also update lastMessageTime and unreadCount
                if (msg.from && msg.from.toLowerCase() !== myAddress.toLowerCase()) {
                    setContacts(prev => {
                        const existingIndex = prev.findIndex(c => c.address.toLowerCase() === msg.from.toLowerCase());
                        const isCurrentChat = activeChatRef.current?.address?.toLowerCase() === msg.from.toLowerCase();

                        if (existingIndex === -1) {
                            // New contact - add with username, timestamp, and unread count
                            return [...prev, {
                                address: msg.from,
                                username: msg.senderUsername,
                                lastMessageTime: msg.timestamp,
                                unreadCount: isCurrentChat ? 0 : 1
                            }];
                        } else {
                            // Update existing contact
                            const updated = [...prev];
                            updated[existingIndex] = {
                                ...updated[existingIndex],
                                username: msg.senderUsername || updated[existingIndex].username,
                                lastMessageTime: msg.timestamp,
                                unreadCount: isCurrentChat ? 0 : (updated[existingIndex].unreadCount || 0) + 1
                            };
                            return updated;
                        }
                    });
                }
            }, keys);

            // Subscribe to message receipts (delivered/read)
            onMessageReceipt(({ messageId, type }) => {
                console.log(`✓ Receipt received: ${type} for ${messageId}`);
                setMessages(prev => prev.map(m =>
                    m.id === messageId ? { ...m, status: type } : m
                ));
            });

            // Subscribe to connection changes
            onConnectionChange((isConnected) => {
                setServerConnected(isConnected);
                if (!isConnected) {
                    setConnectionType('offline');
                }
            });

            initializedRef.current = true;
            console.log('✓ Messaging initialized and subscribed');
        })();

        return () => {
            mounted = false;
        };
    }, [myAddress]);

    // Update connection type periodically
    useEffect(() => {
        if (!activeChat) {
            setConnectionType('offline');
            return;
        }

        const updateConnectionType = () => {
            setConnectionType(getConnectionType(activeChat.address));
        };

        updateConnectionType();
        const interval = setInterval(updateConnectionType, 2000);
        return () => clearInterval(interval);
    }, [activeChat]);

    const openChat = useCallback(async (recipientAddress, preloadedUserInfo = null) => {
        if (!myAddress) {
            setError('Please connect your wallet first');
            return;
        }

        setIsLoading(true);
        setError(null);
        setMessages([]);

        // Set active chat immediately with preloaded info if available
        const contactInfo = contacts.find(c => c.address.toLowerCase() === recipientAddress.toLowerCase());
        const initialInfo = preloadedUserInfo || contactInfo || { address: recipientAddress };
        setActiveChat({
            address: recipientAddress,
            info: initialInfo
        });

        // Clear unread count for this contact
        setContacts(prev => prev.map(c =>
            c.address.toLowerCase() === recipientAddress.toLowerCase()
                ? { ...c, unreadCount: 0 }
                : c
        ));

        try {
            // Try to establish P2P connection
            await connectToPeer(recipientAddress);

            // Get user info if not preloaded
            const userInfo = preloadedUserInfo || await searchUser(recipientAddress);
            if (userInfo) {
                setActiveChat(prev => ({
                    ...prev,
                    info: userInfo
                }));
            }

            // Fetch message history from server
            const history = await getHistory(recipientAddress);
            let peerUsername = userInfo?.username;

            if (history.length > 0) {
                console.log(`📜 Loading ${history.length} historical messages`);
                const decryptedHistory = [];
                for (const msg of history) {
                    const decrypted = await decryptReceivedMessage(msg, keysRef.current, myAddress);
                    if (decrypted) {
                        decryptedHistory.push(decrypted);
                        // Send read receipt for messages from the other party
                        if (msg.from && msg.from.toLowerCase() !== myAddress.toLowerCase()) {
                            sendReadReceipt(msg.from, msg.id);
                            // Get username from message if not already known
                            if (!peerUsername && msg.senderUsername) {
                                peerUsername = msg.senderUsername;
                            }
                        }
                    }
                }
                setMessages(decryptedHistory.sort((a, b) => a.timestamp - b.timestamp));
            }

            // Add to contacts if not exists, or update existing with userInfo/username
            setContacts(prev => {
                const existingIndex = prev.findIndex(c => c.address.toLowerCase() === recipientAddress.toLowerCase());
                const contactData = {
                    address: recipientAddress,
                    ...userInfo,
                    username: peerUsername || userInfo?.username
                };

                if (existingIndex === -1) {
                    return [...prev, contactData];
                }
                // Update existing contact with latest userInfo
                const updated = [...prev];
                updated[existingIndex] = { ...updated[existingIndex], ...contactData };
                return updated;
            });
        } catch (err) {
            console.error('Error opening chat:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [myAddress, contacts]);

    const sendMessage = useCallback(async (content) => {
        if (!activeChat || !myAddress) {
            setError('No active chat');
            return;
        }

        try {
            const sentMessage = await sendEncryptedMessage(
                myAddress,
                activeChat.address,
                content
            );

            // Add to local messages immediately
            setMessages(prev => [...prev, sentMessage]);

            return sentMessage;
        } catch (err) {
            setError(err.message);
            throw err;
        }
    }, [activeChat, myAddress]);

    const searchAndAddContact = useCallback(async (query) => {
        setIsLoading(true);
        setError(null);

        try {
            // For addresses, we can start a chat without requiring them to be registered
            if (query.startsWith('0x') && query.length === 42) {
                return { address: query.toLowerCase() };
            }

            const user = await searchUser(query);
            if (user) {
                return user;
            } else {
                setError('User not found');
                return null;
            }
        } catch (err) {
            setError(err.message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const closeChat = useCallback(() => {
        setActiveChat(null);
        setMessages([]);
        setConnectionType('offline');
    }, []);

    return {
        activeChat,
        messages,
        contacts,
        isLoading,
        error,
        error,
        connectionType, // 'p2p' | 'relay' | 'offline'
        serverConnected,
        openChat,
        closeChat,
        sendMessage,
        searchAndAddContact,
        clearError: () => setError(null),
    };
}
