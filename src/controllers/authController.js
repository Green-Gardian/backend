const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const {pool} = require("../config/db")
require("dotenv").config();

const generateTokens = (user) => {
    try{    
        const access_token = jwt.sign({id: user.id , role: "superadmin"},process.env.JWT_SECRET,{
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        });

        const refresh_token = jwt.sign({id: user.id },process.env.REFRESH_JWT_SECRET,{
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        });

        return {access_token,refresh_token}
    }  
    catch(error){
        console.log(`ERROR: Generating access and refresh token: ${error}`)
    }
}

const signUp = async (req,res) => {
    try{
        const {username,email,password} = req.body;
    
        const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if(!username || !email || !password){
            return res.status(400).json({message: "All fields are required"}); 
        }

        if(!regex.test(email)){
            return res.status(400).json({message: "Invalid email address"});
        }

        if(username.length < 5){
            return res.status(400).json({message: "username must be 5 characters"})
        }

        if(password.length < 8){
            return res.status(400).json({message: "password must be 8 characters"})
        }

        const query = {
            text: `SELECT * FROM super_admin WHERE email = $1`,
            values: [email]
        };

        const resultUser = await pool.query(query);

        if(resultUser.rows.length !== 0){
            return res.status(400).json({message: "Email already in use."});
        }

        const saltRounds = 10;

        const hashedPassword = await bcrypt.hash(password,saltRounds);

        let insertQuery = {
            text: `INSERT INTO super_admin (username,email,password) values ($1,$2,$3) RETURNING *`,
            values: [username,email,hashedPassword]
        };

        const createdUser = await pool.query(insertQuery);
        console.log("Created User:",createdUser.rows[0])
        const tokens = generateTokens(createdUser.rows[0]);

        return res.status(200).json({message: `User created successfully`,...tokens})
    }
    catch(error){
        return res.status(500).json({error: "Server Error"})
    }
}

const signIn = async (req,res) =>{
    const {email,password} = req.body;

    try{
        const query = {
            text:  `SELECT * FROM super_admin WHERE email = $1`,
            values: [email]
        }

        const queryRes = await pool.query(query);

        if(queryRes.rows.length === 0){
            return res.status(404).json({message: "Invalid Email"});
        }

        const user = queryRes.rows[0];

        const match = await bcrypt.compare(password,user.password);

        if(!match){
            return res.status(404).json({message: "Invalid Password"});
        }

        const tokens = generateTokens(user);

        return res.status(200).json({message: "User logged in successfully" , ...tokens});
    }
    catch(error){
        return res.status(500).json({message: `Unable to sign in`});
    }
}

const refreshToken = (req,res) => {
    const {refresh_token} = req.body;
    try{
        if (!refresh_token) return res.status(401).json({ msg: 'Refresh token required' });

    
        const decoded = jwt.verify(refresh_token,process.env.REFRESH_JWT_SECRET);

        const access_token = jwt.sign({id: decoded.id , role: "superadmin"},process.env.JWT_SECRET,{
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        });


        return res.status(200).json({access_token})
    }
    catch(err){
        return res.status(500).json({error: err});
    }
}

module.exports = { refreshToken,signIn,signUp };

