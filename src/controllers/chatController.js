const { pool } = require("../config/db");
const ChatService = require("../services/chatService");

// Fetch chat history between two users in a society
exports.getChatMessages = async (req, res) => {
  const { chatId } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM message 
       WHERE chat_id = $1 
       ORDER BY created_at ASC`,
      [chatId]
    );

    const filteredData = result.rows.map((msg) => ({
      ...msg,
      isMine: msg.sender_id === req.user.id,
    }));

    res.json(filteredData);
  } catch (err) {
    console.error("DB error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getChatGroup = async (req, res) => {
  const userId = req.user.id.toString();
  const { role, society_id: societyId } = req.user;

  try {
    let result;

    // Gets profile picture of the resident/driver participant (not admin staff)
    const nonAdminPictureLateral = `
      LEFT JOIN LATERAL (
        SELECT us.profile_picture
        FROM unnest(c.chatparticipants) AS p(pid)
        JOIN users us ON us.id::text = p.pid::text
        WHERE us.role IN ('resident', 'driver')
        LIMIT 1
      ) op ON true
    `;

    if (role === "super_admin") {
      result = await pool.query(
        `SELECT c.*, op.profile_picture AS participant_profile_picture
         FROM chat c
         ${nonAdminPictureLateral}
         ORDER BY c.updated_at DESC`
      );
    } else if (role === "admin" || role === "sub_admin") {
      // Only show chats where admin is a participant (not driver↔resident chats)
      result = await pool.query(
        `SELECT c.*, op.profile_picture AS participant_profile_picture
         FROM chat c
         ${nonAdminPictureLateral}
         WHERE c.society_id = $1
           AND c.chatparticipants @> ARRAY[$2::text]
         ORDER BY c.updated_at DESC`,
        [societyId, userId]
      );
    } else {
      result = await pool.query(
        `SELECT c.*, op.profile_picture AS participant_profile_picture
         FROM chat c
         ${nonAdminPictureLateral}
         WHERE c.chatparticipants @> $1
         ORDER BY c.updated_at DESC`,
        [[userId]]
      );
    }

    res.json(result.rows);
  } catch (err) {
    console.error("DB error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

//Add user to a chat
exports.addUserToChat = async (req, res) => {
  const { chatId, userId } = req.body;

  console.log("Adding user to chat:", { chatId, userId });


  try {
    const result = await pool.query(
      `
      UPDATE chat
      SET chatparticipants = array_append(chatparticipants, $1)
      WHERE id = $2 AND NOT chatparticipants @> ARRAY[$1]
      RETURNING *
      `,
      [userId, chatId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Chat not found or user already added" });
    }
    console.log("User added to chat:", result.rows[0]);
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error adding user to chat:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

//Renove user to a chat
exports.removeUserFromChat = async (req, res) => {
  const { chatId, userId } = req.body;

  console.log("Adding user to chat:", { chatId, userId });


  try {
    const result = await pool.query(
      `
      UPDATE chat
      SET chatparticipants = array_remove(chatparticipants, $1)
      WHERE id = $2 AND chatparticipants @> ARRAY[$1]
      RETURNING *
      `,
      [userId, chatId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Chat not found or user not in chat" });
    }

    res.status(200).json({ message: "User removed from chat", chat: result.rows[0] });
  } catch (error) {
    console.error("Error removing user from chat:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
// Initiate or Get Support Chat
exports.initiateSupportChat = async (req, res) => {
  const userId = req.user.id;
  const societyId = req.user.society_id;

  if (!societyId) {
    return res.status(400).json({ error: "User is not associated with a society" });
  }

  try {
    const userResult = await pool.query(
      `SELECT first_name, last_name FROM users WHERE id = $1`,
      [userId]
    );
    const userRow = userResult.rows[0];
    const chatTitle = userRow
      ? `${userRow.first_name || ""} ${userRow.last_name || ""}`.trim() || req.user.username
      : req.user.username;

    const adminId = await ChatService.findSocietyAdmin(societyId);
    if (!adminId) {
      return res.status(404).json({ error: "Society admin not found" });
    }

    const participants = [String(userId), String(adminId)];

    // Rename any old "Customer Support" chat for this pair
    console.log(`[Chat] initiateSupportChat — user #${userId} "${chatTitle}" society=${societyId} admin=${adminId}`);

    const oldChat = await pool.query(
      `SELECT id FROM chat
       WHERE society_id = $1
         AND chatparticipants @> $2::text[]
         AND chatparticipants <@ $2::text[]
         AND chattitle = 'Customer Support'
       LIMIT 1`,
      [societyId, participants]
    );

    if (oldChat.rows.length > 0) {
      console.log(`[Chat] Renaming legacy "Customer Support" chat #${oldChat.rows[0].id} → "${chatTitle}"`);
      const updated = await pool.query(
        `UPDATE chat SET chattitle = $1, updated_at = now() WHERE id = $2 RETURNING *`,
        [chatTitle, oldChat.rows[0].id]
      );
      return res.json(updated.rows[0]);
    }

    const chat = await ChatService.createChat(societyId, [userId, adminId], chatTitle);
    res.json(chat);
  } catch (err) {
    console.error("Error initiating support chat:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
