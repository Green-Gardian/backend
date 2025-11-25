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
const societyRouter = require("./routes/societyRoutes");
const licenseRouter = require("./routes/licenseRoutes");
const driverRouter = require("./routes/driverRoutes");
const alertRouter = require("./routes/alertRoutes");
const serviceRouter = require("./routes/residentServiceRoutes");
const chatRouter = require("./routes/chatRoutes");

const PORT = process.env.PORT || 3001;
const app = express();
const server = http.createServer(app);

// Initialize unified WebSocket service (handles both alerts and chat)
websocketService.initialize(server);

// Middleware
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Routes
app.use("/auth", authRouter);
app.use("/vehicle", verifyToken, vehicleRouter);
app.use("/society", verifyToken, societyRouter);
app.use("/license", verifyToken, licenseRouter);
app.use("/driver", verifyToken, driverRouter);
app.use("/alerts", verifyToken, alertRouter);
app.use("/services", verifyToken, serviceRouter);
app.use("/chat", verifyToken, chatRouter);


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
server.listen(PORT, () => {
  console.log(`Server is running on PORT:${PORT}`);
});