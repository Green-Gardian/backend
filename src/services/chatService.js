const { pool } = require("../config/db");

class ChatService {
    /**
     * Create or get an existing chat
     * @param {number} societyId 
     * @param {string[]} participantIds - Array of user IDs (as strings or numbers)
     * @param {string} title - Chat Title (e.g., "Customer Support", "Task #123")
     * @returns {Promise<Object>} The chat object
     */
    async createChat(societyId, participantIds, title) {
        try {
            const participants = participantIds.map(String);

            const existingChat = await pool.query(
                `SELECT * FROM chat
         WHERE society_id = $1
         AND chatparticipants @> $2::text[]
         AND chatparticipants <@ $2::text[]
         AND chattitle = $3
         LIMIT 1`,
                [societyId, participants, title]
            );

            if (existingChat.rows.length > 0) {
                console.log(`[Chat] Found existing chat #${existingChat.rows[0].id} "${title}" for society ${societyId}`);
                return existingChat.rows[0];
            }

            const result = await pool.query(
                `INSERT INTO chat (society_id, chatparticipants, chattitle, lastmessage, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING *`,
                [societyId, participants, title, null]
            );

            console.log(`[Chat] Created new chat #${result.rows[0].id} "${title}" for society ${societyId} with participants [${participants.join(', ')}]`);
            return result.rows[0];
        } catch (error) {
            console.error("[Chat] Error in createChat:", error);
            throw error;
        }
    }

    /**
     * Find admin of a society
     * @param {number} societyId 
     * @returns {Promise<number|null>} Admin User ID
     */
    async findSocietyAdmin(societyId) {
        try {
            const result = await pool.query(
                `SELECT id FROM users WHERE society_id = $1 AND role = 'admin' LIMIT 1`,
                [societyId]
            );
            return result.rows[0]?.id || null;
        } catch (error) {
            console.error("Error finding society admin:", error);
            return null;
        }
    }
}

module.exports = new ChatService();
