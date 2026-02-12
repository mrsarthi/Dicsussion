import { useState, useEffect, useRef, useCallback } from 'react';
import {
    initMessaging,
    sendEncryptedMessage,
    subscribeToMessages,
    registerUser,
    sendDeliveryReceipt,
    sendReadReceipt,
    onMessageReceipt,
    getHistory,
    sendTypingStatus,
    onTypingStatus
} from '../services/messageService';
import { getStoredKeys } from '../crypto/keyManager';
import {
    onConnectionChange,
    onUserStatus,
    getUser
} from '../services/socketService';
import {
    saveMessage,
    getLocalHistory,
    saveMessagesBulk,
    saveContacts,
    getSavedContacts
} from '../services/storageService';

export function useChat(myAddress) {
    const [messages, setMessages] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [connectionType, setConnectionType] = useState('offline');
    const [serverConnected, setServerConnected] = useState(false);

    const activeChatRef = useRef(null);
    const keysRef = useRef(null);
    const initializedRef = useRef(false);
    const statusUnsubscribeRef = useRef(null);

    // Keep activeChatRef in sync
    useEffect(() => {
        activeChatRef.current = activeChat;
    }, [activeChat]);

    const [typingStatus, setTypingStatus] = useState({}); // { [chatId]: { [userAddress]: timestamp } }
    const typingTimeoutRef = useRef({});

    // Cleanup typing timeouts
    useEffect(() => {
        return () => {
            Object.values(typingTimeoutRef.current).forEach(timeout => clearTimeout(timeout));
        };
    }, []);

    // Persist contacts whenever they change
    useEffect(() => {
        if (contacts.length > 0) {
            saveContacts(contacts);
        }
    }, [contacts]);

    const createGroup = useCallback(async (groupName, memberAddresses) => {
        const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const groupContact = {
            address: groupId, // Use groupId as the address key
            username: groupName,
            isGroup: true,
            members: [...new Set([myAddress, ...memberAddresses])], // Ensure I am in the list
            admins: [myAddress],
            lastMessageTime: Date.now(),
            unreadCount: 0,
            online: true
        };

        setContacts(prev => [groupContact, ...prev]);
        setActiveChat({ address: groupId, info: groupContact, isGroup: true });
        return groupContact;
    }, [myAddress]);

    const sendTyping = useCallback((isTyping) => {
        if (!activeChat || !myAddress) return;

        if (activeChat.isGroup) {
            // Send to all members except me
            activeChat.members?.forEach(memberAddr => {
                if (memberAddr.toLowerCase() !== myAddress.toLowerCase()) {
                    sendTypingStatus(memberAddr, isTyping, activeChat.address);
                }
            });
        } else {
            sendTypingStatus(activeChat.address, isTyping);
        }
    }, [activeChat, myAddress]);

    // Cleanup existing connection listeners before re-binding
    useEffect(() => {
        if (!myAddress || initializedRef.current) return;

        let mounted = true;

        (async () => {
            // ... (Init logic remains same, but we hook into onTypingStatus too)
            await initMessaging();

            // Load persist contacts immediately
            const cachedContacts = await getSavedContacts();
            if (mounted && cachedContacts.length > 0) {
                setContacts(cachedContacts);
            }

            const keys = await getStoredKeys();
            if (!keys || !mounted) return;
            keysRef.current = keys;
            await registerUser(myAddress, keys.publicKey);
            if (!mounted) return;

            // Subscribe to typing status
            onTypingStatus(({ from, isTyping, groupId }) => {
                const chatId = groupId || from; // If groupId exists, it's a group chat event. Else it's 1-on-1 from sender.

                setTypingStatus(prev => {
                    const chatStatus = prev[chatId] || {};

                    if (!isTyping) {
                        const newStatus = { ...chatStatus };
                        delete newStatus[from];
                        return { ...prev, [chatId]: newStatus };
                    }

                    return {
                        ...prev,
                        [chatId]: {
                            ...chatStatus,
                            [from]: Date.now()
                        }
                    };
                });

                // Auto-clear after 3 seconds (safety net)
                const timeoutKey = `${chatId}_${from}`;
                if (typingTimeoutRef.current[timeoutKey]) clearTimeout(typingTimeoutRef.current[timeoutKey]);

                if (isTyping) {
                    typingTimeoutRef.current[timeoutKey] = setTimeout(() => {
                        setTypingStatus(prev => {
                            const chatStatus = prev[chatId];
                            if (!chatStatus) return prev;
                            const newStatus = { ...chatStatus };
                            delete newStatus[from];
                            return { ...prev, [chatId]: newStatus };
                        });
                    }, 5000);
                }
            });

            subscribeToMessages(async (msg) => {
                const contactId = msg.groupId || msg.from;
                console.log('📨 Received message:', {
                    id: msg.id,
                    from: msg.from,
                    to: msg.to,
                    groupId: msg.groupId,
                    contactId,
                    content: msg.content?.slice(0, 20)
                });

                // Save to local storage immediately
                try {
                    await saveMessage(contactId, msg);
                    console.log(`💾 Persisted incoming message from ${contactId}`);
                } catch (err) {
                    console.error('❌ Failed to persist incoming message:', err);
                }

                // Send delivery receipt (only for DMs or if logic allows - for groups simpler to skip or handle carefully)
                // For now, send receipt only if DM to avoid storm
                if (!msg.groupId && msg.from && msg.from.toLowerCase() !== myAddress.toLowerCase()) {
                    sendDeliveryReceipt(msg.from, msg.id);
                    if (activeChatRef.current?.address?.toLowerCase() === msg.from.toLowerCase()) {
                        sendReadReceipt(msg.from, msg.id);
                    }
                }

                // Handle incoming message
                setMessages(prev => {
                    const exists = prev.some(m => m.id === msg.id);
                    if (exists) return prev.map(m => m.id === msg.id ? msg : m);

                    // Filter: Only add if it belongs to current active chat
                    const activeAddress = activeChatRef.current?.address?.toLowerCase();
                    if (!activeAddress) return prev;

                    const isActiveGroup = activeChatRef.current?.isGroup;
                    let isRelevant = false;

                    if (isActiveGroup) {
                        // Active chat is Group. Msg must match group ID.
                        isRelevant = msg.groupId === activeAddress;
                    } else {
                        // Active chat is DM. Msg must be DM (no groupId) and match contact address.
                        // Either from contact OR sent by me to contact
                        if (!msg.groupId) {
                            isRelevant = (msg.from?.toLowerCase() === activeAddress) ||
                                (msg.to?.toLowerCase() === activeAddress);
                        }
                    }

                    // Note: We usually add all messages to state? No, standard pattern here 
                    // seems to be determining if we should show it. 
                    // Actually, the original code loaded history on open. 
                    // `messages` state IS only for the active chat.

                    if (isRelevant) {
                        return [...prev, msg].sort((a, b) => a.timestamp - b.timestamp);
                    }
                    return prev;
                });

                // Update contacts / Create Group if needed
                if (msg.from && msg.from.toLowerCase() !== myAddress.toLowerCase()) {
                    setContacts(prev => {
                        // Determine the "Contact ID" (User ID or Group ID)
                        const contactId = msg.groupId || msg.from;
                        const isGroup = !!msg.groupId;

                        const existingIndex = prev.findIndex(c => c.address.toLowerCase() === contactId.toLowerCase());
                        const isCurrentChat = activeChatRef.current?.address?.toLowerCase() === contactId.toLowerCase();

                        if (existingIndex === -1) {
                            if (isGroup) {
                                // NEW GROUP DISCOVERED
                                return [{
                                    address: msg.groupId,
                                    username: msg.groupName || 'Unknown Group',
                                    isGroup: true,
                                    members: msg.members || [myAddress, msg.from], // Fallback
                                    lastMessageTime: msg.timestamp,
                                    unreadCount: isCurrentChat ? 0 : 1,
                                    online: true
                                }, ...prev];
                            } else {
                                // NEW DM
                                return [{
                                    address: msg.from,
                                    username: msg.senderUsername,
                                    lastMessageTime: msg.timestamp,
                                    unreadCount: isCurrentChat ? 0 : 1,
                                    online: true,
                                    lastSeen: Date.now()
                                }, ...prev];
                            }
                        } else {
                            // Update existing
                            const updated = [...prev];
                            const existing = updated[existingIndex];

                            updated[existingIndex] = {
                                ...existing,
                                lastMessageTime: msg.timestamp,
                                unreadCount: isCurrentChat ? 0 : (existing.unreadCount || 0) + 1,
                                online: true,
                                lastSeen: Date.now()
                            };

                            // Update group metadata if provided
                            if (isGroup && msg.members) {
                                updated[existingIndex].members = msg.members;
                            }
                            // Update dm username if provided
                            if (!isGroup && msg.senderUsername) {
                                updated[existingIndex].username = msg.senderUsername;
                            }

                            // Move to top
                            updated.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
                            return updated;
                        }
                    });
                }
            }, keys);

            // ... (rest of init - receipts, connection, status) ...
            // Copying existing receipt/connection logic...
            onMessageReceipt(({ messageId, type }) => {
                setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: type } : m));
            });

            onConnectionChange(async (isConnected) => {
                setServerConnected(isConnected);
                if (!isConnected) setConnectionType('offline');
                // ... sync status logic ...
            });

            statusUnsubscribeRef.current = onUserStatus(({ address, online, lastSeen }) => {
                // Update contacts ...
                setContacts(prev => prev.map(c => {
                    // For groups, we might want to track individual user status, but complex.
                    // For now, only update DM contacts.
                    if (!c.isGroup && c.address.toLowerCase() === address.toLowerCase()) {
                        return { ...c, online, lastSeen };
                    }
                    return c;
                }));
                if (activeChatRef.current?.address?.toLowerCase() === address.toLowerCase()) {
                    setActiveChat(prev => ({ ...prev, info: { ...prev.info, online, lastSeen } }));
                }
            });

            initializedRef.current = true;
        })();

        return () => {
            mounted = false;
            if (statusUnsubscribeRef.current) statusUnsubscribeRef.current();
            // Clear typing timeouts
            Object.values(typingTimeoutRef.current).forEach(t => clearTimeout(t));
        };
    }, [myAddress]);

    // ... (UseEffect for updates remains similar) ...

    const sendMessage = useCallback(async (content, replyTo = null, type = 'text') => {
        if (!activeChat || !myAddress) {
            setError('No active chat');
            return;
        }

        try {
            if (activeChat.isGroup) {
                // Fan-out to all members
                const start = Date.now();
                const promises = activeChat.members
                    .filter(m => m.toLowerCase() !== myAddress.toLowerCase())
                    .map(memberAddr => sendEncryptedMessage(
                        myAddress,
                        memberAddr,
                        content,
                        replyTo,
                        {
                            groupId: activeChat.address,
                            groupName: activeChat.info?.username || 'Group',
                            members: activeChat.members, // Propagate members list
                            type: type
                        }
                    ));

                await Promise.all(promises);

                // Add to local state
                const sentMessage = {
                    id: `msg_${start}_${myAddress}`, // Pseudo ID
                    from: myAddress,
                    content,
                    timestamp: start,
                    status: 'sent',
                    groupId: activeChat.address,
                    isGroup: true,
                    type: type
                };

                await saveMessage(activeChat.address, sentMessage); // Persist

                setMessages(prev => [...prev, sentMessage]);
                return sentMessage;
            } else {
                // DM
                const sentMessage = await sendEncryptedMessage(
                    myAddress,
                    activeChat.address,
                    content,
                    replyTo,
                    { type: type }
                );
                await saveMessage(activeChat.address, sentMessage); // Persist
                setMessages(prev => [...prev, sentMessage]);
                return sentMessage;
            }
        } catch (err) {
            setError(err.message);
            throw err;
        }
    }, [activeChat, myAddress]);

    const openChat = useCallback(async (address, userInfo = null) => {
        // If clicking same chat, do nothing
        if (activeChatRef.current?.address?.toLowerCase() === address.toLowerCase()) return;

        // Find contact info
        let contact = contacts.find(c => c.address.toLowerCase() === address.toLowerCase());

        // If not in contacts but we have userInfo (from search), use it
        if (!contact && userInfo) {
            contact = {
                address: userInfo.address,
                username: userInfo.username,
                lastMessageTime: Date.now(),
                unreadCount: 0,
                online: false
            };
            setContacts(prev => [contact, ...prev]);
        }

        if (contact) {
            // Mark as read
            const updatedContacts = contacts.map(c =>
                c.address.toLowerCase() === address.toLowerCase()
                    ? { ...c, unreadCount: 0 }
                    : c
            );
            setContacts(updatedContacts);
        }

        // Set active
        setActiveChat({
            address,
            info: contact || userInfo || { address },
            isGroup: contact?.isGroup || false,
            members: contact?.members || []
        });

        // Load messages for this chat
        setMessages([]);
        setIsLoading(true);

        try {
            // 1. Load Local History
            const localHistory = await getLocalHistory(address);
            console.debug(`📖 openChat: Loaded ${localHistory?.length} local messages for ${address}`);
            let merged = [...(localHistory || [])];

            // 2. Fetch Server History (if available)
            try {
                const serverHistory = await getHistory(myAddress, address);
                // Merge and deduplicate
                const existingIds = new Set(merged.map(m => m.id));
                const newServerMsgs = serverHistory.filter(m => !existingIds.has(m.id));
                merged = [...merged, ...newServerMsgs].sort((a, b) => a.timestamp - b.timestamp);

                // Save new messages to local for next time
                if (newServerMsgs.length > 0) {
                    saveMessagesBulk(address, newServerMsgs);
                }
            } catch (e) {
                // Ignore if no server history
            }

            setMessages(merged.map(m => ({
                ...m,
                status: 'read'
            })));
        } catch (err) {
            console.error('Error loading chat:', err);
        } finally {
            setIsLoading(false);
        }

        setConnectionType('p2p'); // Default assumption, will update on connect

        // If it's a DM, try to connect/status
        if (!contact?.isGroup) {
            // connection logic handled by effect
        }
    }, [contacts, myAddress]);

    const searchAndAddContact = useCallback(async (query) => {
        try {
            // Check if it's an address
            if (query.startsWith('0x') && query.length === 42) {
                // It's an address
                const keys = await getUser(query);
                if (keys) {
                    // Check if already exists
                    const exists = contacts.find(c => c.address.toLowerCase() === query.toLowerCase());
                    if (!exists) {
                        const newContact = {
                            address: query,
                            username: null, // We might not know it yet
                            lastMessageTime: Date.now(),
                            unreadCount: 0,
                            online: false
                        };
                        setContacts(prev => [newContact, ...prev]);
                        return newContact;
                    }
                    return exists;
                }
            }
            return null;
        } catch (err) {
            console.error('Search failed:', err);
            return null;
        }
    }, [contacts]);

    const closeChat = useCallback(() => {
        setActiveChat(null);
        setMessages([]);
        setConnectionType('offline');
        setTypingStatus({});
    }, []);


    return {
        activeChat,
        messages,
        contacts,
        isLoading,
        error,
        connectionType,
        serverConnected,
        typingStatus, // Export new state
        openChat,
        closeChat,
        sendMessage,
        sendTyping, // Export new function
        createGroup, // Export new function
        searchAndAddContact,
        clearError: () => setError(null),
    };
}

