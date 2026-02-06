// ChatInterface - Main chat UI component
import { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { formatAddress } from '../blockchain/web3Provider';
import { CreateGroupModal } from './CreateGroupModal';
import { GroupDetailsModal } from './GroupDetailsModal';
import './ChatInterface.css';

export function ChatInterface({ walletAddress }) {
    const {
        activeChat,
        messages,
        contacts,
        isLoading,
        error,
        connectionType,
        serverConnected,
        typingStatus,
        openChat,
        closeChat,
        sendMessage,
        sendTyping,
        createGroup,
        searchAndAddContact,
        clearError,
    } = useChat(walletAddress);

    const [newMessage, setNewMessage] = useState('');
    const [replyingTo, setReplyingTo] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [showGroupDetails, setShowGroupDetails] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const typingTimeoutRef = useRef(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || isLoading) return;

        const messageText = newMessage;
        const replyContext = replyingTo ? {
            id: replyingTo.id,
            content: replyingTo.content,
            senderUsername: replyingTo.senderUsername || replyingTo.from
        } : null;

        setNewMessage('');
        setReplyingTo(null);
        sendTyping(false); // Stop typing indicator

        try {
            await sendMessage(messageText, replyContext);
        } catch (err) {
            setNewMessage(messageText); // Restore message on error
            if (replyContext) setReplyingTo(replyingTo); // Restore reply context
        }
    };

    const handleInput = (e) => {
        setNewMessage(e.target.value);

        // Typing indicator logic
        sendTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            sendTyping(false);
        }, 2000);
    };

    const handleReply = (msg) => {
        setReplyingTo(msg);
        inputRef.current?.focus();
    };

    const cancelReply = () => {
        setReplyingTo(null);
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        const user = await searchAndAddContact(searchQuery);
        setIsSearching(false);

        if (user) {
            openChat(user.address, user);
            setSearchQuery('');
        }
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Get typing users for active chat
    const getTypingText = () => {
        if (!activeChat) return null;
        const chatStatus = typingStatus[activeChat.address] || {};
        const typingUsers = Object.keys(chatStatus);

        if (typingUsers.length === 0) return null;

        if (activeChat.isGroup) {
            // Map addresses to names if possible
            const names = typingUsers.slice(0, 3).map(addr => {
                // Try to find in contacts to get name
                // Note: contacts list might not have full details for everyone if they are just group members
                // But for now we just fallback to address
                const contact = contacts.find(c => c.address.toLowerCase() === addr.toLowerCase());
                return contact?.username || formatAddress(addr);
            });

            if (names.length === 1) return `${names[0]} is typing...`;
            if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
            return `${names.join(', ')}... are typing`;
        } else {
            return `Typing...`;
        }
    };

    const typingText = getTypingText();

    return (
        <div className="chat-container">
            {showGroupModal && (
                <CreateGroupModal
                    contacts={contacts}
                    onClose={() => setShowGroupModal(false)}
                    onCreate={createGroup}
                />
            )}

            {/* Sidebar */}
            <aside className="sidebar glass-card">
                <div className="sidebar-header">
                    <h2>Chats</h2>
                    {!serverConnected && (
                        <div className="connection-status-banner offline">
                            ⚠️ Disconnected
                        </div>
                    )}
                </div>

                {/* Search / New Chat */}
                <form className="search-form" onSubmit={handleSearch}>
                    <input
                        type="text"
                        className="input"
                        placeholder="Addr, @user..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowGroupModal(true)}
                        title="Create Group"
                    >
                        👥
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isSearching || !searchQuery.trim()}
                    >
                        {isSearching ? '...' : '+'}
                    </button>
                </form>

                {/* Contacts List */}
                <div className="contacts-list">
                    {contacts.length === 0 ? (
                        <div className="empty-contacts">
                            <p className="text-muted">No conversations yet</p>
                            <p className="text-xs text-muted">
                                Search above or create a group
                            </p>
                        </div>
                    ) : (
                        [...contacts]
                            .sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0))
                            .map((contact) => (
                                <div
                                    key={contact.address}
                                    className={`contact-item ${activeChat?.address === contact.address ? 'active' : ''}`}
                                    onClick={() => openChat(contact.address)}
                                >
                                    <div className="avatar">
                                        {contact.isGroup ? '👥' : contact.address.slice(2, 4).toUpperCase()}
                                    </div>
                                    <div className="contact-info">
                                        <span className="contact-name">
                                            {contact.username ? (contact.username.startsWith('@') || contact.isGroup ? contact.username : `@${contact.username}`) : formatAddress(contact.address)}
                                        </span>
                                        <div className="contact-status-row">
                                            {contact.username && !contact.isGroup && (
                                                <span className="text-xs text-muted">
                                                    {formatAddress(contact.address)}
                                                </span>
                                            )}
                                            {contact.isGroup && (
                                                <span className="text-xs text-muted">
                                                    {contact.members?.length || 0} members
                                                </span>
                                            )}
                                            {contact.online && <span className="status-indicator online small" title="Online"></span>}
                                        </div>
                                    </div>
                                    {contact.unreadCount > 0 && (
                                        <span className="unread-badge">{contact.unreadCount}</span>
                                    )}
                                </div>
                            ))
                    )}
                </div>
            </aside>

            {/* Main Chat Area */}
            <main className="chat-main">
                {!activeChat ? (
                    <div className="no-chat-selected">
                        <div className="no-chat-content animate-fadeIn">
                            <div className="no-chat-icon">💬</div>
                            <h2>Welcome to DecentraChat</h2>
                            <p className="text-secondary">
                                Select a conversation or start a new one
                            </p>
                            <div className="features-grid">
                                <div className="feature-card glass-card">
                                    <span className="feature-emoji">👥</span>
                                    <span>Group Chats</span>
                                </div>
                                <div className="feature-card glass-card">
                                    <span className="feature-emoji">🔒</span>
                                    <span>End-to-End Encrypted</span>
                                </div>
                                <div className="feature-card glass-card">
                                    <span className="feature-emoji">⌨️</span>
                                    <span>Typing Indicators</span>
                                </div>
                                <div className="feature-card glass-card">
                                    <span className="feature-emoji">🚫</span>
                                    <span>No Central Server</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {showGroupDetails && (
                            <GroupDetailsModal
                                group={activeChat.isGroup ? activeChat.info : null}
                                onClose={() => setShowGroupDetails(false)}
                                myAddress={walletAddress}
                            />
                        )}

                        {/* Chat Header */}
                        <header className="chat-header">
                            <button className="btn btn-ghost back-btn" onClick={closeChat}>
                                ←
                            </button>
                            <div
                                className={`chat-header-info ${activeChat.isGroup ? 'clickable' : ''}`}
                                onClick={() => activeChat.isGroup && setShowGroupDetails(true)}
                                title={activeChat.isGroup ? "View Group Details" : ""}
                            >
                                <div className="avatar">
                                    {activeChat.isGroup ? '👥' : activeChat.address.slice(2, 4).toUpperCase()}
                                </div>
                                <div className="chat-header-details">
                                    <span className="chat-header-name">
                                        {activeChat.info?.username || (activeChat.isGroup ? 'Unnamed Group' : formatAddress(activeChat.address))}
                                    </span>

                                    {typingText ? (
                                        <span className="text-xs text-primary animate-pulse font-medium">
                                            {typingText}
                                        </span>
                                    ) : (
                                        <div className="chat-status-line">
                                            <span className={`status-indicator ${activeChat.info?.online ? 'online' : 'offline'}`}></span>
                                            <span className="status-text">
                                                {activeChat.isGroup
                                                    ? `${activeChat.info?.members?.length || 0} members`
                                                    : (activeChat.info?.online ? 'Online' : 'Away')
                                                }
                                            </span>
                                            <span className="encrypted-badge">
                                                🔒 Encrypted
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span className={`connection-badge ${connectionType}`}>
                                {connectionType === 'p2p' ? '⚡ Direct P2P' : connectionType === 'relay' ? '🌐 Server Relay' : '📴 Offline'}
                            </span>
                            <button
                                className={`btn btn-ghost debug-btn ${showDebug ? 'active' : ''}`}
                                onClick={() => setShowDebug(!showDebug)}
                                title="Toggle debug mode"
                            >
                                {showDebug ? '🔓 Hide Raw' : '🔍 Show Raw'}
                            </button>
                        </header>

                        {/* Messages Area */}
                        <div className="messages-container">
                            {isLoading && messages.length === 0 ? (
                                <div className="loading-messages">
                                    <div className="spinner"></div>
                                    <span>Loading messages...</span>
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="no-messages">
                                    <p className="text-muted">
                                        No messages yet. Say hello! 👋
                                    </p>
                                </div>
                            ) : (
                                messages.map((msg, index) => (
                                    <div
                                        key={msg.id || index}
                                        className={`message animate-fadeIn ${msg.from?.toLowerCase() === walletAddress?.toLowerCase()
                                            ? 'sent'
                                            : 'received'
                                            } ${msg.decryptionFailed ? 'failed' : ''}`}
                                    >
                                        <div
                                            className="message-bubble"
                                            onDoubleClick={() => handleReply(msg)}
                                        >
                                            {/* Show sender name in group chats if received */}
                                            {activeChat.isGroup && msg.from?.toLowerCase() !== walletAddress?.toLowerCase() && (
                                                <div className="text-xs opacity-75 font-bold mb-1" style={{ color: 'var(--accent-secondary)' }}>
                                                    {msg.senderUsername || formatAddress(msg.from)}
                                                </div>
                                            )}

                                            {msg.replyTo && (
                                                <div className="message-reply-context">
                                                    <div className="reply-bar-line"></div>
                                                    <div className="reply-content">
                                                        <span className="reply-sender">
                                                            {msg.replyTo.senderUsername || 'User'}
                                                        </span>
                                                        <span className="reply-text">
                                                            {msg.replyTo.content?.length > 50
                                                                ? msg.replyTo.content.substring(0, 50) + '...'
                                                                : msg.replyTo.content}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                            <p className="message-content">{msg.content}</p>
                                            {showDebug && msg.encrypted && (
                                                <div className="debug-panel">
                                                    <div className="debug-label">🔐 Raw Encrypted Data:</div>
                                                    <code className="debug-data">{msg.encrypted.slice(0, 50)}...</code>
                                                    <div className="debug-label">🔑 Nonce:</div>
                                                    <code className="debug-data">{msg.nonce}</code>
                                                </div>
                                            )}
                                            <div className="message-meta">
                                                <span className="message-time">
                                                    {formatTime(msg.timestamp)}
                                                </span>
                                                {!msg.decryptionFailed && (
                                                    <span className="message-encrypted" title="Encrypted">
                                                        🔒
                                                    </span>
                                                )}
                                                {msg.from?.toLowerCase() === walletAddress?.toLowerCase() && (
                                                    <span className={`message-status ${msg.status || 'sent'}`} title={msg.status}>
                                                        {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Message Input */}
                        <form className="message-input-form" onSubmit={handleSend}>
                            {replyingTo && (
                                <div className="reply-preview-bar animate-fadeIn">
                                    <div className="reply-preview-content">
                                        <span className="reply-to-label">Replying to <span className="font-bold">{replyingTo.senderUsername || 'User'}</span></span>
                                        <span className="reply-preview-text">
                                            {replyingTo.content?.length > 60
                                                ? replyingTo.content.substring(0, 60) + '...'
                                                : replyingTo.content}
                                        </span>
                                    </div>
                                    <button type="button" className="close-reply-btn" onClick={cancelReply}>×</button>
                                </div>
                            )}
                            <input
                                ref={inputRef}
                                type="text"
                                className="input message-input"
                                placeholder={activeChat.isGroup ? `Message ${activeChat.info?.username || 'group'}...` : "Type a message..."}
                                value={newMessage}
                                onChange={handleInput}
                                autoFocus
                            />
                            <button
                                type="submit"
                                className="btn btn-primary send-btn"
                                disabled={!newMessage.trim() || isLoading}
                            >
                                <span className="send-icon">➤</span>
                            </button>
                        </form>
                    </>
                )}

                {/* Error Toast */}
                {error && (
                    <div className="error-toast animate-fadeIn" onClick={clearError}>
                        <span className="error-icon">⚠️</span>
                        <span>{error}</span>
                        <button className="close-btn">×</button>
                    </div>
                )}
            </main>
        </div>
    );
}

