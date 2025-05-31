const express = require("express");
const app = express();
const authRouter = require("./routes/authRoutes");
const userRouter = require("./routes/userRoutes");
const {verifyToken} = require("./middlewares/authMiddleware")
const {initDb} = require("./config/db")
const cors = require('cors');


require("dotenv").config();

//alowing all cors
app.use(cors());

const PORT = process.env.PORT || 3001 ;

initDb();

app.use(express.json());
app.use("/auth",authRouter);
app.use("/user",verifyToken,userRouter)

app.listen(PORT,()=>{
    console.log(`Server is running on PORT:${PORT}`)
})