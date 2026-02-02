// useChat Hook - Manage chat conversations
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    sendEncryptedMessage,
    startConversation,
    searchUser,
    markMessageAsRead,
    markMessageAsDelivered
} from '../services/messageService';
import { updatePresence, subscribeToUserChats } from '../services/gunService';

export function useChat(myAddress) {
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [contacts, setContacts] = useState([]);
    const subscriptionRef = useRef(null);

    const backgroundSubs = useRef({});

    // Request notification permission on mount
    useEffect(() => {
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
        return () => {
            // Cleanup background subs
            Object.values(backgroundSubs.current).forEach(sub => sub.unsubscribe());
        };
    }, []);

    // Manage background subscriptions for consistent delivery receipts/notifications
    useEffect(() => {
        if (!myAddress) return;

        contacts.forEach(async (contact) => {
            // Skip if this is the active chat (handled by openChat)
            if (activeChat && activeChat.address.toLowerCase() === contact.address.toLowerCase()) {
                if (backgroundSubs.current[contact.address]) {
                    backgroundSubs.current[contact.address].unsubscribe();
                    delete backgroundSubs.current[contact.address];
                }
                return;
            }

            // Skip if already subscribed in background
            if (backgroundSubs.current[contact.address]) return;

            // Subscribe
            try {
                const sub = await startConversation(myAddress, contact.address, (msg) => {
                    // Handle background message
                    if (msg.from.toLowerCase() !== myAddress.toLowerCase()) {
                        // Mark as delivered automatically
                        markMessageAsDelivered(msg.from, myAddress, msg.id);

                        // Notify if window hidden OR if we are in another chat
                        if (document.hidden || (activeChat && activeChat.address.toLowerCase() !== msg.from.toLowerCase())) {
                            if (Notification.permission === 'granted') {
                                new Notification(`Message from ${contact.username || 'User'}`, {
                                    body: msg.content,
                                    icon: '/icon.png'
                                });
                                // Flash taskbar if in Electron
                                if (window.electronAPI?.flashFrame) {
                                    window.electronAPI.flashFrame(true);
                                }
                            }
                        }
                    }
                });
                backgroundSubs.current[contact.address] = sub;
            } catch (e) {
                console.error('Failed to subscribe in background', e);
            }
        });
    }, [contacts, activeChat, myAddress]);

    // Stop flashing on focus
    useEffect(() => {
        const handleFocus = () => {
            if (window.electronAPI?.flashFrame) {
                window.electronAPI.flashFrame(false);
            }
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    // Update presence and subscribe to chats periodically
    useEffect(() => {
        if (myAddress) {
            updatePresence(myAddress);

            // Subscribe to my chat list
            const chatsSub = subscribeToUserChats(myAddress, async (chatInfo) => {
                const alreadyExists = contacts.some(c => c.address.toLowerCase() === chatInfo.with.toLowerCase());

                if (!alreadyExists) {
                    // Fetch user info for this chat
                    const userInfo = await searchUser(chatInfo.with);
                    setContacts(prev => {
                        if (prev.some(c => c.address.toLowerCase() === chatInfo.with.toLowerCase())) return prev;
                        return [...prev, { address: chatInfo.with, ...userInfo }];
                    });

                    // Notification for new conversation
                    if (document.hidden && Notification.permission === 'granted') {
                        new Notification('New Conversation', {
                            body: `New chat with ${userInfo?.username || chatInfo.with}`,
                        });
                    }
                }
            });

            const interval = setInterval(() => {
                updatePresence(myAddress);
            }, 30000);

            return () => {
                clearInterval(interval);
                chatsSub.off();
            };
        }
    }, [myAddress]);

    // Cleanup subscription on unmount or chat change
    useEffect(() => {
        return () => {
            if (subscriptionRef.current) {
                subscriptionRef.current.unsubscribe();
            }
        };
    }, [activeChat]);

    const openChat = useCallback(async (recipientAddress) => {
        if (!myAddress) {
            setError('Please connect your wallet first');
            return;
        }

        setIsLoading(true);
        setError(null);

        // Cleanup previous subscription
        if (subscriptionRef.current) {
            subscriptionRef.current.unsubscribe();
        }

        try {
            const conversation = await startConversation(
                myAddress,
                recipientAddress,
                (newMessage) => {
                    setMessages(prev => {
                        const exists = prev.some(m => m.id === newMessage.id);
                        if (exists) {
                            // Update existing message (e.g. status change)
                            return prev.map(m => m.id === newMessage.id ? newMessage : m);
                        }

                        // Handle new incoming message
                        if (newMessage.from.toLowerCase() !== myAddress.toLowerCase()) {
                            // Mark as read immediately if chat is open
                            markMessageAsRead(newMessage.from, myAddress, newMessage.id);

                            // System Notification
                            if (document.hidden && Notification.permission === 'granted') {
                                new Notification('New Message', {
                                    body: newMessage.content,
                                    icon: '/icon.png' // Optional
                                });
                                // Flash taskbar if in Electron
                                if (window.electronAPI?.flashFrame) {
                                    window.electronAPI.flashFrame(true);
                                }
                            }
                        }

                        return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
                    });
                }
            );

            setActiveChat({
                address: recipientAddress,
                info: conversation.theirInfo,
            });

            // Initial load - mark all unread as read (optional, keeping simple for now)
            setMessages(conversation.existingMessages);
            subscriptionRef.current = conversation;

            // Add to contacts if not already there
            setContacts(prev => {
                if (!prev.some(c => c.address.toLowerCase() === recipientAddress.toLowerCase())) {
                    return [...prev, { address: recipientAddress, ...conversation.theirInfo }];
                }
                return prev;
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [myAddress]);

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
        if (subscriptionRef.current) {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
        }
        setActiveChat(null);
        setMessages([]);
    }, []);

    return {
        activeChat,
        messages,
        contacts,
        isLoading,
        error,
        openChat,
        closeChat,
        sendMessage,
        searchAndAddContact,
        clearError: () => setError(null),
    };
}
