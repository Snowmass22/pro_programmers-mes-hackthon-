const mongoose=require('mongoose');

const candidateSchema= new mongoose.Schema({
    resumeText: String,
    jd: String,
    questions: [String],
    answers: [{ question: String, answer: String }],
    score: Number,
    feedback: String
})
module.exports=mongoose.model('candidate',candidateSchema);