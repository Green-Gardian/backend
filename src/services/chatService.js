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
            // Ensure all IDs are strings for consistency in TEXT[]
            const participants = participantIds.map(String);

            // Check if a chat with these EXACT participants and title already exists
            // This prevents duplicate "Customer Support" chats, but allows multiple "Task #..." chats if titles differ
            const existingChat = await pool.query(
                `SELECT * FROM chat 
         WHERE society_id = $1 
         AND chatParticipants @> $2::text[] 
         AND chatParticipants <@ $2::text[]
         AND chatTitle = $3
         LIMIT 1`,
                [societyId, participants, title]
            );

            if (existingChat.rows.length > 0) {
                return existingChat.rows[0];
            }

            // Create new chat
            const result = await pool.query(
                `INSERT INTO chat (society_id, chatParticipants, chatTitle, lastMessage, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING *`,
                [societyId, participants, title, null]
            );

            return result.rows[0];
        } catch (error) {
            console.error("Error in ChatService.createChat:", error);
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
