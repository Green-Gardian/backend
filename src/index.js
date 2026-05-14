const express = require("express");
const http = require("http");
const cors = require("cors");
const morgan = require("morgan");
const bodyParser = require('body-parser');

// Load environment variables
require("dotenv").config();

// Import services and config
const websocketService = require("./services/websocketService");

// Import middleware
const { verifyToken } = require("./middlewares/authMiddleware");

// Import routes
const authRouter = require("./routes/authRoutes");
const vehicleRouter = require("./routes/vehicleRoutes");
const superAdminVehicleRouter = require("./routes/superAdminVehicleRoutes");
const societyRouter = require("./routes/societyRoutes");
const licenseRouter = require("./routes/licenseRoutes");
const driverRouter = require("./routes/driverRoutes");
const alertRouter = require("./routes/alertRoutes");
const serviceRouter = require("./routes/residentServiceRoutes");
const chatRouter = require("./routes/chatRoutes");
const analyticsRouter = require("./routes/analyticsRoutes");
const subAdminRouter = require("./routes/subAdminRoutes");
const systemFeedbackRouter = require("./routes/systemFeedbackRoutes");
const sentimentAnalyticsRouter = require("./routes/sentimentAnalyticsRoutes");
const binRouter = require("./routes/binRoutes");
const binSimulator = require("./services/binSimulator");
const mockRouter = require("./routes/mockRoutes");
const webhookRouter = require("./routes/webhookRoutes");
const duesSchedulerService = require("./services/duesSchedulerService");

const PORT = process.env.PORT || 3001;
const app = express();
const server = http.createServer(app);

// Stripe webhook must receive raw body for signature verification.
app.use("/webhooks", express.raw({ type: "application/json" }), webhookRouter);

// Initialize unified WebSocket service (handles both alerts and chat)
websocketService.initialize(server);

// CORS Configuration
const allowedOrigins = [
  process.env.FRONTEND_URL?.replace(/\/$/, ''), // Remove trailing slash
  'http://localhost:3000',
  'http://localhost:8081',
  'https://greenguardian.gzz.io',
  'https://frontend-nu-azure-85.vercel.app'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return callback(null, true);
    }
    
    // Allow all origins in development
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(morgan("dev"));
app.use(express.json());


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Routes
app.use("/auth", authRouter);
app.use("/vehicle", verifyToken, vehicleRouter);
app.use("/super-admin/vehicle", verifyToken, superAdminVehicleRouter);
app.use("/society", verifyToken, societyRouter);
app.use("/license", verifyToken, licenseRouter);
app.use("/driver", verifyToken, driverRouter);
app.use("/alerts", verifyToken, alertRouter);
app.use("/services", verifyToken, serviceRouter);
app.use("/chat", verifyToken, chatRouter);
app.use("/analytics", verifyToken, analyticsRouter);
app.use("/sub-admin", verifyToken, subAdminRouter);
app.use("/feedback/system", verifyToken, systemFeedbackRouter);
app.use("/analytics/sentiment", verifyToken, sentimentAnalyticsRouter);

const taskRouter = require("./routes/taskRoutes");
const logRouter = require("./routes/logRoutes");

// ...

// Bins routes (requires authentication)
app.use("/bins", verifyToken, binRouter);

// Mock routes — no auth, for development/testing only
app.use("/mock", mockRouter);
app.use("/tasks", verifyToken, taskRouter);
app.use("/logs", verifyToken, logRouter);


// Mobile payment redirect — called by the user's browser after Stripe checkout.
// Bounces from an http:// URL back to the app's deep link.
app.get("/payment/redirect", (req, res) => {
  const { return_url, payment, session_id } = req.query;

  if (!return_url) {
    return res.status(400).send("Missing return_url");
  }

  let deepLink;
  try {
    deepLink = decodeURIComponent(return_url);
  } catch {
    return res.status(400).send("Invalid return_url");
  }

  const sep = deepLink.includes("?") ? "&" : "?";
  deepLink += `${sep}payment=${encodeURIComponent(payment || "unknown")}`;
  if (session_id) {
    deepLink += `&session_id=${encodeURIComponent(session_id)}`;
  }

  const safeLink = deepLink
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Redirecting...</title>
</head>
<body>
<script>window.location.replace(${JSON.stringify(deepLink)});</script>
<meta http-equiv="refresh" content="0;url=${safeLink}">
<noscript><p><a href="${safeLink}">Return to app</a></p></noscript>
</body>
</html>`);
});

// Health endpoints
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    websocket: websocketService.healthCheck(),
  });
});

app.get("/websocket/stats", verifyToken, (req, res) => {
  if (req.user.role !== "super_admin" || req.user.role !== "admin" || req.user.role !== "sub_admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  const stats = websocketService.getConnectionStats();
  res.json({
    success: true,
    data: stats,
  });
});

// Start server
server.listen(PORT, async () => {
  console.log(`Server is running on PORT:${PORT}`);
  // start bin simulator
  try {
    binSimulator.start();
  } catch (err) {
    console.error('Failed to start bin simulator', err);
  }

  try {
    duesSchedulerService.start();
  } catch (err) {
    console.error("Failed to start dues scheduler", err);
  }

  // Backfill missing sentiment analysis for existing feedback on startup
  try {
    const sentimentController = require('./controllers/sentimentAnalyticsController');
    const { pool } = require('./config/db');
    const sentimentService = require('./services/sentimentAnalysisService');
    const unanalyzed = await pool.query(
      `SELECT id, overall_rating, timeliness_rating, professionalism_rating,
              cleanliness_rating, comments, suggestions
       FROM service_feedback
       WHERE sentiment_label IS NULL OR sentiment_score IS NULL`
    );
    if (unanalyzed.rows.length > 0) {
      console.log(`[sentiment-backfill] ${unanalyzed.rows.length} records missing sentiment, running backfill`);
      let updated = 0;
      for (const row of unanalyzed.rows) {
        try {
          const analysis = await sentimentService.analyzeFeedback(
            row.comments || null, row.suggestions || null,
            { overall_rating: row.overall_rating, timeliness_rating: row.timeliness_rating,
              professionalism_rating: row.professionalism_rating, cleanliness_rating: row.cleanliness_rating }
          );
          await pool.query(
            `UPDATE service_feedback SET sentiment_score=$1, sentiment_label=$2, key_themes=$3,
             requires_urgent_attention=$4, sentiment_summary=$5, updated_at=CURRENT_TIMESTAMP WHERE id=$6`,
            [analysis.sentiment_score, analysis.sentiment_label, JSON.stringify(analysis.key_themes || []),
             analysis.requires_urgent_attention, analysis.summary || null, row.id]
          );
          updated++;
        } catch (err) {
          console.error(`[sentiment-backfill] Failed for feedback #${row.id}:`, err.message);
        }
      }
      console.log(`[sentiment-backfill] done, updated ${updated}/${unanalyzed.rows.length}`);
    }
  } catch (err) {
    console.error('[sentiment-backfill] Startup backfill error:', err.message);
  }
});