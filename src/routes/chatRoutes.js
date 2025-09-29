const express = require("express");
const router = express.Router();
const {
  verifyToken,
  verifyAdminOrSuperAdmin,
} = require("../middlewares/authMiddleware");

const {
  getChatMessages,
  getChatGroup,
  addUserToChat,
  removeUserFromChat,
} = require("../controllers/chatController");

// Get messages between two users
router.get("/get-chat-messages/:chatId", verifyToken, getChatMessages);

// Get messages for a society
router.get("/get-chat-groups", verifyToken, getChatGroup);

//Add user to a chat
router.post(
  "/add-user-to-chat",
  verifyToken,
  verifyAdminOrSuperAdmin,
  addUserToChat
);

//Remove user from a chat
router.post(
  "/remove-user-from-chat",
  verifyToken,
  verifyAdminOrSuperAdmin,
  removeUserFromChat
);

module.exports = router;
