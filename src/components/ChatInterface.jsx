// ChatInterface - Main chat UI component
import { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { formatAddress } from '../blockchain/web3Provider';
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
        openChat,
        closeChat,
        sendMessage,
        searchAndAddContact,
        clearError,
    } = useChat(walletAddress);

    const [newMessage, setNewMessage] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || isLoading) return;

        const messageText = newMessage;
        setNewMessage('');

        try {
            await sendMessage(messageText);
        } catch (err) {
            setNewMessage(messageText); // Restore message on error
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        const user = await searchAndAddContact(searchQuery);
        setIsSearching(false);

        if (user) {
            openChat(user.address, user); // Pass user info with username
            setSearchQuery('');
        }
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="chat-container">
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
                        placeholder="Enter address or username..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
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
                                Enter an address above to start chatting
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
                                        {contact.address.slice(2, 4).toUpperCase()}
                                    </div>
                                    <div className="contact-info">
                                        <span className="contact-name">
                                            {contact.username ? `@${contact.username}` : formatAddress(contact.address)}
                                        </span>
                                        {contact.username && (
                                            <span className="text-xs text-muted">
                                                {formatAddress(contact.address)}
                                            </span>
                                        )}
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
                                Select a conversation or start a new one by entering an Ethereum address
                            </p>
                            <div className="features-grid">
                                <div className="feature-card glass-card">
                                    <span className="feature-emoji">🔒</span>
                                    <span>End-to-End Encrypted</span>
                                </div>
                                <div className="feature-card glass-card">
                                    <span className="feature-emoji">⛓️</span>
                                    <span>Blockchain Identity</span>
                                </div>
                                <div className="feature-card glass-card">
                                    <span className="feature-emoji">🌐</span>
                                    <span>Decentralized</span>
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
                        {/* Chat Header */}
                        <header className="chat-header">
                            <button className="btn btn-ghost back-btn" onClick={closeChat}>
                                ←
                            </button>
                            <div className="chat-header-info">
                                <div className="avatar">
                                    {activeChat.address.slice(2, 4).toUpperCase()}
                                </div>
                                <div className="chat-header-details">
                                    <span className="chat-header-name">
                                        {activeChat.info?.username ? `@${activeChat.info.username}` : formatAddress(activeChat.address)}
                                    </span>
                                    {activeChat.info?.username && (
                                        <span className="text-xs text-muted">
                                            {formatAddress(activeChat.address)}
                                        </span>
                                    )}
                                    <span className="encrypted-badge">
                                        🔒 End-to-End Encrypted
                                    </span>
                                </div>
                            </div>
                            <span className={`connection-badge ${connectionType}`}>
                                {connectionType === 'p2p' ? '⚡ Direct P2P' : connectionType === 'relay' ? '🌐 Via Relay' : '📴 Offline'}
                            </span>
                            <button
                                className={`btn btn-ghost debug-btn ${showDebug ? 'active' : ''}`}
                                onClick={() => setShowDebug(!showDebug)}
                                title="Toggle debug mode to see encrypted data"
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
                                        <div className="message-bubble">
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
                            <input
                                type="text"
                                className="input message-input"
                                placeholder="Type a message..."
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
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
