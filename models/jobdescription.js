const mongoose=require('mongoose');
const admin = require('./admin');

const jobSchema= new mongoose.Schema({
    jobtitle:String,
    department:String,
    location:String,
    salary:String,
    description:String,
    requirement:String,
    admin:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'admin'
    }
    
})
module.exports=mongoose.model('job',jobSchema);