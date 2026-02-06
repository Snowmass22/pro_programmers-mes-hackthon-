const mongoose=require('mongoose');

const scoreSchema=new mongoose.Schema({
    score:Number,
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'user'
    }
})
module.exports=mongoose.model('score',scoreSchema);