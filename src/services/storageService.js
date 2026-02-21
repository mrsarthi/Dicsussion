import localforage from 'localforage';

const messageStore = localforage.createInstance({
    name: 'decentrachat',
    storeName: 'messages',
});

// Mutex for atomic operations
class Mutex {
    constructor() {
        this.queue = Promise.resolve();
    }
    lock(callback) {
        const next = this.queue.then(() => callback().catch(console.error));
        this.queue = next; // Chain it
        return next;
    }
}

const storageMutexes = {}; // key -> Mutex

function getMutex(key) {
    if (!storageMutexes[key]) {
        storageMutexes[key] = new Mutex();
    }
    return storageMutexes[key];
}

const MAX_HISTORY_PER_CHAT = 1000;

/**
 * Save a message to local history
 * @param {string} chatId - Address of user or Group ID
 * @param {Object} message - The message object
 */
export async function saveMessage(chatId, message) {
    if (!chatId || !message) {
        console.warn('⚠️ saveMessage skipped: missing chatId or message', { chatId, msgId: message?.id });
        return;
    }
    const key = `chat_${chatId.toLowerCase()}`;

    return getMutex(key).lock(async () => {
        try {
            // console.debug(`💾 (Mutex) Saving message to ${key}:`, message.id);
            const history = (await messageStore.getItem(key)) || [];

            // Deduplicate
            if (history.some(m => m.id === message.id)) {
                console.debug('⚠️ Duplicate message ignored:', message.id);
                return;
            }

            const newHistory = [...history, message]
                .sort((a, b) => a.timestamp - b.timestamp)
                .slice(-MAX_HISTORY_PER_CHAT); // Keep size manageable

            await messageStore.setItem(key, newHistory);
            console.debug(`✅ Message saved to ${key}. Total: ${newHistory.length}`);
        } catch (err) {
            console.error('Failed to save request locally:', err);
        }
    });
}

/**
 * Get local history for a chat
 * @param {string} chatId
 * @returns {Promise<Array>}
 */
export async function getLocalHistory(chatId) {
    if (!chatId) return [];
    try {
        const key = `chat_${chatId.toLowerCase()}`;
        const history = (await messageStore.getItem(key)) || [];
        console.debug(`📂 Loaded ${history.length} messages from ${key}`);
        return history;
    } catch (err) {
        console.error('Failed to load local history:', err);
        return [];
    }
}

/**
 * Save multiple messages (bulk import)
 * @param {string} chatId 
 * @param {Array} messages 
 */
export async function saveMessagesBulk(chatId, messages) {
    if (!chatId || !messages.length) return;
    const key = `chat_${chatId.toLowerCase()}`;

    return getMutex(key).lock(async () => {
        try {
            const history = (await messageStore.getItem(key)) || [];

            // Merge and dedupe
            const existingIds = new Set(history.map(m => m.id));
            const toAdd = messages.filter(m => !existingIds.has(m.id));

            if (toAdd.length === 0) return;

            const newHistory = [...history, ...toAdd]
                .sort((a, b) => a.timestamp - b.timestamp)
                .slice(-MAX_HISTORY_PER_CHAT);

            await messageStore.setItem(key, newHistory);
            console.debug(`✅ Bulk saved ${toAdd.length} msgs to ${key}`);
        } catch (err) {
            console.error('Failed to save bulk messages:', err);
        }
    });
}

// ... existing imports and code ...

/**
 * Get all saved contacts/groups
 */
export async function getSavedContacts() {
    try {
        const contacts = (await messageStore.getItem('visible_contacts')) || [];
        // Deduplicate just in case
        const unique = [];
        const seen = new Set();
        for (const c of contacts) {
            if (!seen.has(c.address.toLowerCase())) {
                seen.add(c.address.toLowerCase());
                unique.push(c);
            }
        }
        console.debug(`👥 Loaded ${unique.length} contacts from storage`);
        return unique;
    } catch (err) {
        console.error('Failed to load contacts:', err);
        return [];
    }
}

/**
 * Save contacts list to storage
 * @param {Array} contacts 
 */
export async function saveContacts(contacts) {
    if (!contacts) return;
    try {
        // Only save what's necessary to rebuild the sidebar
        const minimized = contacts.map(c => ({
            address: c.address,
            username: c.username,
            isGroup: c.isGroup,
            members: c.members, // Crucial for groups
            lastMessageTime: c.lastMessageTime,
            unreadCount: c.unreadCount,
            // Don't save online status, meaningless on reload
        }));
        await messageStore.setItem('visible_contacts', minimized);
    } catch (err) {
        console.error('Failed to save contacts:', err);
    }
}

export async function clearHistory(chatId) {
    if (!chatId) return;
    await messageStore.removeItem(`chat_${chatId.toLowerCase()}`);
}

/**
 * Clear ALL local data (messages, contacts, everything)
 * Used for account deletion
 */
export async function clearAllData() {
    await messageStore.clear();
    console.log('🗑️ All local chat data cleared');
}

// ========== OUTBOX (Pending Message Queue) ==========

const OUTBOX_KEY = 'pending_outbox';

/**
 * Save a message to the outbox for later delivery
 * @param {Object} message - The full message object (encrypted, with to/from/id)
 */
export async function savePendingMessage(message) {
    if (!message?.id) return;
    try {
        const outbox = (await messageStore.getItem(OUTBOX_KEY)) || [];
        // Avoid duplicates
        if (outbox.some(m => m.id === message.id)) return;
        outbox.push({ ...message, queuedAt: Date.now() });
        await messageStore.setItem(OUTBOX_KEY, outbox);
        console.debug(`📤 Queued message ${message.id} in outbox. Total: ${outbox.length}`);
    } catch (err) {
        console.error('Failed to save to outbox:', err);
    }
}

/**
 * Get all pending messages from the outbox
 * @returns {Promise<Array>}
 */
export async function getPendingMessages() {
    try {
        return (await messageStore.getItem(OUTBOX_KEY)) || [];
    } catch (err) {
        console.error('Failed to load outbox:', err);
        return [];
    }
}

/**
 * Remove a message from the outbox after successful send
 * @param {string} messageId
 */
export async function removePendingMessage(messageId) {
    try {
        const outbox = (await messageStore.getItem(OUTBOX_KEY)) || [];
        const filtered = outbox.filter(m => m.id !== messageId);
        await messageStore.setItem(OUTBOX_KEY, filtered);
        console.debug(`✅ Removed ${messageId} from outbox. Remaining: ${filtered.length}`);
    } catch (err) {
        console.error('Failed to remove from outbox:', err);
    }
}

/**
 * Get pending messages for a specific recipient
 * @param {string} address - Recipient address
 * @returns {Promise<Array>}
 */
export async function getPendingMessagesForRecipient(address) {
    const outbox = await getPendingMessages();
    return outbox.filter(m => m.to?.toLowerCase() === address.toLowerCase());
}
