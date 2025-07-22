const express = require("express");
const app = express();
const authRouter = require("./routes/authRoutes");
const vehicleRouter = require("./routes/vehicleRoutes")
const societyRouter = require("./routes/societyRoutes");
const licenseRouter = require("./routes/licenseRoutes");
const { verifyToken } = require("./middlewares/authMiddleware")
const { initDb } = require("./config/db")
require("dotenv").config();
const cors = require('cors');
const morgan = require('morgan');

const PORT = process.env.PORT || 3001;


initDb();

app.use(cors());
app.use(morgan('dev'));

app.use(express.json());
app.use("/auth", authRouter);
app.use('/vehicle', verifyToken, vehicleRouter);
app.use('/society', verifyToken, societyRouter);
app.use('/license', verifyToken, licenseRouter);

app.listen(PORT, () => {
    console.log(`Server is running on PORT:${PORT}`)
})