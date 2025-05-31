const express = require("express");
const router  = express.Router();
const {addAdmin,setPassword} = require("../controllers/userController");

router.post("/add-admin",addAdmin);
router.post("/set-password",setPassword)

module.exports = router;