const mongoose=require('mongoose');

const adminSchema=new mongoose.Schema({
    name:String,
    email:String,
    password:String,
    job:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'job'
    },
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'user'
    }

})
module.exports=mongoose.model('admin',adminSchema);