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

export async function clearHistory(chatId) {
    if (!chatId) return;
    await messageStore.removeItem(`chat_${chatId.toLowerCase()}`);
}
