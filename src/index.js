const express = require("express");
const app = express();
const authRouter = require("./routes/authRoutes");
const {initDb} = require("./config/db")
require("dotenv").config();

const PORT = process.env.PORT || 3001 ;

initDb();
app.use(express.json());
app.use("/auth",authRouter);

app.listen(PORT,()=>{
    console.log(`Server is running on PORT:${PORT}`)
})