const jwt = require("jsonwebtoken")

const { pool } = require("../config/db")

function initSocket(io) {
  io.on("connection", (socket) => {
    try {
      const token = socket.handshake.auth?.token

      if (!token) {
        console.log(" No token provided, disconnecting socket")
        socket.disconnect()
        return
      }

      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
      socket.user = { id: decoded.id, username: decoded.username }

      console.log("User connected:", socket.user.id)
    } catch (err) {
      console.error("Invalid token:", err.message)
      socket.disconnect()
      return
    }

    socket.on("joinRoom", ({ chatId, userId }) => {
      console.log(`joining room with chat id : ${chatId}`)

      const rooms = Array.from(socket.rooms)
      rooms.forEach((room) => {
        if (room !== socket.id) {
          socket.leave(room)
          console.log(`User ${userId} left room ${room}`)
        }
      })

      socket.join(chatId)
      console.log(`User ${userId} joined room ${chatId}`)
    })

    socket.on("message", async ({ chatId, content }) => {
      try {
        const senderId = socket.user.id
        const sender_name = socket.user.username

        console.log("sender Id from the user stored in the socket : ", senderId)
        console.log("sender name from the user stored in the socket : ", sender_name)

        await pool.query(
          `INSERT INTO message (chat_id, content, sender_id, sender_name)
           VALUES ($1, $2, $3, $4)`,
          [chatId, content, senderId, sender_name],
        )

        await pool.query(`UPDATE chat SET lastmessage = $1 WHERE id = $2`, [content, chatId])

        const messageData = {
          chatId,
          content,
          senderId,
          sender_name,
          created_at: new Date(),
        }

        io.to(chatId).emit("receiveMessage", messageData)

        socket.emit("messageSent", { success: true, messageData })
      } catch (err) {
        console.error("DB error:", err.message)
        socket.emit("messageSent", { success: false, error: err.message })
      }
    })

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id)
    })
  })
}

module.exports = { initSocket }
