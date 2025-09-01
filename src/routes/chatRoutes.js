const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/authMiddleware");

const { getChatMessages, getChatGroup } = require("../controllers/chatController");

// Get messages between two users
router.get("/get-chat-messages/:chatId", verifyToken, getChatMessages);

// Get messages for a society
router.get("/get-chat-groups", verifyToken, getChatGroup);

module.exports = router;
