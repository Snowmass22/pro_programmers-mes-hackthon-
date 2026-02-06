const mongoose=require('mongoose');
const admin = require('./admin');

const userSchema=new mongoose.Schema({
    name:String,
    email:String,
    password:String,
    admin:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'admin'
    }

})
module.exports=mongoose.model('user',userSchema);