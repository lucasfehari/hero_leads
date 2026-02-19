const fs = require('fs');
const path = require('path');

// We use JSONL (JSON Lines) for performance. 
// Instead of rewriting a huge JSON file every time, we just append a line.
const DB_PATH = path.join(__dirname, '..', 'db', 'history.jsonl');

// Ensure DB directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

// In-Memory Set for O(1) Lookup (Instant)
const visitedUsers = new Set();

// Load History on Startup
if (fs.existsSync(DB_PATH)) {
    try {
        const fileContent = fs.readFileSync(DB_PATH, 'utf8');
        const lines = fileContent.split('\n');
        for (const line of lines) {
            if (line.trim()) {
                try {
                    const record = JSON.parse(line);
                    if (record.username) {
                        visitedUsers.add(record.username.toLowerCase());
                    }
                } catch (e) { }
            }
        }
        console.log(`[Database] Loaded ${visitedUsers.size} visited profiles.`);
    } catch (e) {
        console.error("Failed to load history DB:", e);
    }
}

const hasInteracted = (username) => {
    if (!username) return false;
    return visitedUsers.has(username.toLowerCase());
};

const recordInteraction = (username, actions = []) => {
    if (!username) return;
    const userLower = username.toLowerCase();

    // Prevent duplicates in memory
    if (visitedUsers.has(userLower)) return;

    visitedUsers.add(userLower);

    // Append to file (Instant, no matter how big the file is)
    const record = {
        username: userLower,
        date: new Date().toISOString(),
        actions: actions
    };

    try {
        fs.appendFileSync(DB_PATH, JSON.stringify(record) + '\n');
    } catch (e) {
        console.error("Failed to append to history:", e);
    }
};

module.exports = { hasInteracted, recordInteraction };
