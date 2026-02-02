// useChat Hook - Manage chat conversations
import { useState, useEffect, useCallback, useRef } from 'react';
import { sendEncryptedMessage, startConversation, searchUser } from '../services/messageService';
import { updatePresence } from '../services/gunService';

export function useChat(myAddress) {
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [contacts, setContacts] = useState([]);
    const subscriptionRef = useRef(null);

    // Update presence periodically
    useEffect(() => {
        if (myAddress) {
            updatePresence(myAddress);
            const interval = setInterval(() => {
                updatePresence(myAddress);
            }, 30000);
            return () => clearInterval(interval);
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
                        // Avoid duplicates
                        if (prev.some(m => m.id === newMessage.id)) {
                            return prev;
                        }
                        return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
                    });
                }
            );

            setActiveChat({
                address: recipientAddress,
                info: conversation.theirInfo,
            });
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
