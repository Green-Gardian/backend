const express = require("express");
const http = require("http");
const cors = require("cors");
const morgan = require("morgan");
const { Server } = require("socket.io");

// Load environment variables
require("dotenv").config();

// Import services and config
const websocketService = require("./services/websocketService");
const { initSocket } = require("./config/socket");

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

// Initialize WebSocket service
websocketService.initialize(server);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"],
  },
});

initSocket(io);

// Middleware
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

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
  if (req.user.role !== "super_admin" && req.user.role !== "admin") {
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