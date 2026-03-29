const express = require("express");
const router = express.Router();
const { handleStripeWebhook } = require("../controllers/duesController");

router.post("/stripe", handleStripeWebhook);

module.exports = router;
