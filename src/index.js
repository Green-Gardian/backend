const express = require("express");
const app = express();
const authRouter = require("./routes/authRoutes");
const vehicleRouter = require("./routes/vehicleRoutes")
const { verifyToken } = require("./middlewares/authMiddleware")
const { initDb } = require("./config/db")
require("dotenv").config();
const cors = require('cors');


const PORT = process.env.PORT || 3001;

initDb();
app.use(cors());

app.use(express.json());
app.use("/auth", authRouter);
app.use('/vehicle', verifyToken, vehicleRouter);

app.listen(PORT, () => {
    console.log(`Server is running on PORT:${PORT}`)
})