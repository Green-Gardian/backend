const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const http = require("http");
const { Server } = require("socket.io");

require("dotenv").config();

// Routes
const authRouter = require("./routes/authRoutes");
const vehicleRouter = require("./routes/vehicleRoutes");
const societyRouter = require("./routes/societyRoutes");
const licenseRouter = require("./routes/licenseRoutes");
const driverRouter = require("./routes/driverRoutes");
const chatRouter = require("./routes/chatRoutes");

// Middleware
const { verifyToken } = require("./middlewares/authMiddleware");

// DB + Socket
const { initDb } = require("./config/db");
const { initSocket } = require("./config/socket");

const app = express();
const server = http.createServer(app); 

// Initialize socket.io
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
app.use("/chat", verifyToken, chatRouter);

const PORT = process.env.PORT || 3001;

// Initialize DB
initDb();

// Start server (http + socket.io)
server.listen(PORT, () => {
  console.log(`Server is running on PORT:${PORT}`);
});
