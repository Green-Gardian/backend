const { pool } = require("../config/db");

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

  try {
    const result = await pool.query(
      `SELECT * FROM chat
       WHERE chatparticipants @> $1
       ORDER BY updated_at DESC`,
      [[userId]]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No chats found for this user." });
    }

    const chats = result.rows;

    res.json(chats);
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
