const { pool } = require("../config/db");

function initSocket(io) {
  io.on("connection", (socket) => {
    console.log("New user connected:", socket.id);


    socket.on("message", async ({ chatId, content, senderId, sender_name }) => {
      try {
        await pool.query(
          `INSERT INTO message (chat_id,content, sender_id,sender_name)
                     VALUES ($1, $2, $3, $4)`,
          [chatId, content, senderId, sender_name]
        );

        const result = await pool.query(
          `SELECT chatParticipants FROM chat WHERE id = $1`,
          [chatId]
        );

        const participants = result.rows[0].chatparticipants;

        participants.forEach((participantId) => {
          if (participantId !== senderId) {
            io.to(`user_${participantId}`).emit("receiveMessage", {
              senderId,
              content,
              chatId,
              created_at: new Date(),
            });
          }
        });

        socket.emit("recieveMessage", { msg: "ok" });

      } catch (err) {
        console.error("DB error:", err.message);
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });
}

module.exports = { initSocket };
