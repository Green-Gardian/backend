const express = require("express");
const app = express();
const http = require("http");
const authRouter = require("./routes/authRoutes");
const vehicleRouter = require("./routes/vehicleRoutes");
const societyRouter = require("./routes/societyRoutes");
const licenseRouter = require("./routes/licenseRoutes");
const driverRouter = require("./routes/driverRoutes");
const alertRouter = require("./routes/alertRoutes");
const { verifyToken } = require("./middlewares/authMiddleware");
// const db = require("./config/db");
const serviceRouter = require("./routes/residentServiceRoutes");
const websocketService = require("./services/websocketService");
require("dotenv").config();
const cors = require("cors");
const morgan = require("morgan");


const PORT = process.env.PORT || 3001;

const server = http.createServer(app);

websocketService.initialize(server);

app.use(cors());
app.use(morgan("dev"));

app.use(express.json());
app.use("/auth", authRouter);
app.use("/vehicle", verifyToken, vehicleRouter);
app.use("/society", verifyToken, societyRouter);
app.use("/license", verifyToken, licenseRouter);
app.use("/driver", verifyToken, driverRouter);
app.use("/alerts", alertRouter);
app.use("/services", verifyToken, serviceRouter);

// Health check endpoint

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    websocket: websocketService.healthCheck(),
  });
});

// WebSocket connection stats (admin only)
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


server.listen(PORT, () => {
  console.log(`Server is running on PORT:${PORT}`);
  console.log("WebSocket server is ready for connections");
});


