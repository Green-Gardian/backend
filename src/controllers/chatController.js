const { pool } = require("../config/db");

// Fetch chat history between two users in a society
exports.getChatMessages = async (req, res) => {
  const { chatId } = req.params;


  console.log("Fetching messages for chatId:", chatId);

  try {
    const result = await pool.query(
      `SELECT * FROM MESSAGE
       WHERE chat_id = $1
       ORDER BY created_at ASC`,
      [chatId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("DB error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getChatGroup = async (req, res) => {
  const userId = req.user.id.toString();

  console.log("User ID:", userId);

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

    console.log("Fetched chats:", chats);

    res.json(chats);
  } catch (err) {
    console.error("DB error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
