const express=require('express');
const mongoose=require('mongoose');
const bcrypt=require('bcrypt');
const jwt=require('jsonwebtoken');
const cookieParser=require('cookie-parser');
const multer=require('multer');
const pdf=require('pdf-parse');
const axios=require('axios');
const fs=require('fs');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const dotenv=require('dotenv');

const path=require('path');
dotenv.config();


const DB_URL=process.env.DB_URL;
mongoose.connect(DB_URL);
const conn=mongoose.connection;
conn.once('open',()=>{
    console.log('Database connected successfully');
});
conn.on('error',(err)=>{
    console.log('Database connection error:',err);
});



const app=express();
const userModel=require('./models/user.js');
const adminModel=require('./models/admin.js');
const jobModel=require('./models/jobdescription.js');
const scoreModel=require('./models/score.js');
 
const Candidate = require('./models/candidate');



app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,'public')));
app.set('view engine','ejs');
app.use(cookieParser());
 


 
app.get('/',(req,res)=>{
    res.render('home');
})

app.get('/login',(req,res)=>{
    res.render('login');
})

app.get('/create',(req,res)=>{
    res.render('create');
})


//middleware for login
function isloggedin(req,res,next){
    if(!req.cookies || !req.cookies.token){
        
         return res.redirect('/login');}
          
    else{
        try {
            let data=jwt.verify(req.cookies.token, process.env.JWT_SECRET || "secretkey");
            req.user=data;
            next();
        } catch (err) {
            res.redirect('/login');
        }

    }
    
   
}

 
app.post('/create',async(req,res)=>{
    let {name,email,password}=req.body;
    let user=await userModel.findOne({email:email});
    if(user){
        return res.send("user already exists");
        return res.redirect('/login');
    }
    bcrypt.genSalt(10,(err,salt)=>{
        bcrypt.hash(password,salt,async(err,hash)=>{
            let newuser= await userModel.create({
                email:email,
                password:hash,
                name:name
            })
            let token = jwt.sign({ email: email, userid: newuser._id }, process.env.JWT_SECRET);
            res.cookie('token', token);
            res.redirect('/dashboard');
        });
    })
})

app.post('/login',async(req,res)=>{
    let {email,password}=req.body;
    let user= await userModel.findOne({email:email});
    if(!user){
        return res.send('No user found with this email');
    }
    bcrypt.compare(password,user.password,(err,result)=>{
        if(result){
            let token=jwt.sign({email:email,userid:user._id},process.env.JWT_SECRET);
            res.cookie('token',token);
            res.redirect('/dashboard');
        }else{
            return res.send('Invalid password');
            res.redirect('/login');
        }
    })
})


app.get('/dashboard', isloggedin, async(req,res)=>{
    let user= await userModel.findOne({_id:req.user.userid});
    let job = await jobModel.find();
    res.render('user-dashboard',{user:user, job:job});
})

//admin login
app.get('/admin-login',(req,res)=>{
    res.render('admin-login');
})
//ADMIN CREATE
app.get('/admin-create',(req,res)=>{
    res.render('admin-create');
});
app.post('/admin-create',async(req,res)=>{
     let {name,email,password}=req.body;
    let user=await adminModel.findOne({email:email});
    if(user){
        return res.send("user already exists");
        return res.redirect('/admin-login');
    }
    bcrypt.genSalt(10,(err,salt)=>{
        bcrypt.hash(password,salt,async(err,hash)=>{
            let newuser= await adminModel.create({
                email:email,
                password:hash,
                name:name
            })
            let token = jwt.sign({ email: email, userid: newuser._id }, process.env.JWT_SECRET);
            res.cookie('token', token);
            res.redirect('/admin-dashboard');
        });
    })
})
app.get('/admin-logout',(req,res)=>{
    res.clearCookie('token');
    res.redirect('/');
})

app.post('/admin-login',async(req,res)=>{
     let {email,password}=req.body;
    let user= await adminModel.findOne({email:email});
    if(!user){
        return res.send('No user found with this email');
    }
    bcrypt.compare(password,user.password,(err,result)=>{
        if(result){
            let token=jwt.sign({email:email,userid:user._id},process.env.JWT_SECRET);
            res.cookie('token',token);
            res.redirect('/admin-dashboard');
        }else{
            return res.send('Invalid password');
        }
    })
})

app.get('/logout',(req,res)=>{
    res.clearCookie('token');
    res.redirect('/');
})

///user authetication and authorization done///


//admin dashboard//
app.get('/admin-dashboard',isloggedin,async(req,res)=>{
    let user= await adminModel.findOne({_id:req.user.userid});
    let jobs = await jobModel.find();
    res.render('admin-dashboard',{user:user, jobs:jobs});
})
app.post('/admin-dashboard',isloggedin,async(req,res)=>{
    let {jobtitle,department,location,salary,description,requirement}=req.body;
    let newjob=await jobModel.create({
        jobtitle:jobtitle,
        department:department,
        location:location,
        salary:salary,
        description:description,
        requirement:requirement
    })
    res.redirect('/admin-dashboard');

})

app.get('/admin-view-users',isloggedin,async(req,res)=>{
    let dbUsers = await userModel.find();
    let scores = await scoreModel.find();

    let users = dbUsers.map(user => {
        let userScores = scores.filter(score => score.user && score.user.toString() === user._id.toString());
        let latestScore = userScores.length > 0 ? userScores[userScores.length - 1].score : 0;
        
        return {
            id: user._id,
            name: user.name,
            email: user.email,
            role: "Candidate",
            score: latestScore,
            status: latestScore > 0 ? "completed" : "pending",
            avatar: user.name ? user.name.substring(0, 2).toUpperCase() : "NA",
            technical: 0,
            communication: 0,
            problemSolving: 0,
            questions: 0,
            duration: "—",
            date: "—"
        };
    });

    res.render('admin-view-users',{users:users});

})
    

//user dashboard//
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => {
        cb(null, 'report-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });
app.get('/user-dashboard',isloggedin,async(req,res)=>{
    let job= await jobModel.find();
    res.render('user-dashboard',{job:job});
})

app.post('/save-score',isloggedin,async(req,res)=>{
    let {score}=req.body;
    await scoreModel.create({
        score:score,
        user:req.user.userid
    })
    res.status(200).send("Score saved successfully");
})

app.listen(8080,(req,res)=>{
    console.log("server is listening on port 8080");
})