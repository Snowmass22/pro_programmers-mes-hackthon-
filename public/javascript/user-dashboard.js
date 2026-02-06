/* Candidate interface and interview logic
   - Reads Job Description from localStorage (key: 'job_description')
   - Accepts resume text (or file upload for UI)
   - Compares resume vs JD to compute skill match %
   - If match >= threshold -> start AI Interview (5 questions)
   - Questions are "generated" via a mock fetch call using API key placeholder;
     if remote call fails, fallback to locally generated questions.
   - Provides Text-to-Speech (TTS) for each question and optional Speech-to-Text (STT)
   - Stores interview results into localStorage key 'interview_results'
*/

/* ----------------------------
   Utility functions + state
   ---------------------------- */
const THRESHOLD = 70; // percent threshold to proceed to interview
const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 5;

function lsGet(key, fallback = null){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch(e){ return fallback; }
}
function lsSet(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); } catch(e){ console.error(e); }
}

function genId(){ return 'id_' + Math.random().toString(36).slice(2,9); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

let state = {
  job: null,
  resume: '',
  name: '',
  apiKey: '',
  questions: [],
  answers: [],
  currentQ: 0,
  listening: false // Tracks if recognition is active
};

/* ----------------------------
   DOM references
   ---------------------------- */
const jdContent = document.getElementById('jdContent');
const candNameInput = document.getElementById('candName');
const resumeText = document.getElementById('resumeText');
const fileUpload = document.getElementById('fileUpload');
const apiKeyInput = document.getElementById('apiKey');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn');
const statusMsg = document.getElementById('statusMsg');
const interviewArea = document.getElementById('interviewArea');
const questionText = document.getElementById('questionText');
const qIndex = document.getElementById('qIndex');
const answerText = document.getElementById('answerText');
const micBtn = document.getElementById('micBtn');
const speakBtn = document.getElementById('speakBtn');
const nextBtn = document.getElementById('nextBtn');
const sttInfo = document.getElementById('sttInfo');
const resultArea = document.getElementById('resultArea');
const resultSummary = document.getElementById('resultSummary');
const saveResultBtn = document.getElementById('saveResult');
const restartBtn = document.getElementById('restart');

/* ----------------------------
   Initialization
   ---------------------------- */
(function init(){
  // Load job description from localStorage
  const jd = window.serverJob || lsGet('job_description', null);
  state.job = jd;
  renderJD(jd);

  // Seed UI: sample resume file upload reads as text for preview (optional)
  fileUpload.addEventListener('change', (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    
    // Handle .txt files
    if(f.type === 'text/plain' || f.name.endsWith('.txt')){
      const reader = new FileReader();
      reader.onload = function(ev){
        resumeText.value = ev.target.result.slice ? ev.target.result.slice(0,1500) : String(ev.target.result);
        statusMsg.textContent = `✓ Resume loaded. Click "Analyze vs Job Description" to proceed.`;
      }
      reader.onerror = ()=> alert('Unable to read file. Please paste your resume text directly in the textarea.');
      reader.readAsText(f);
    } 
    // Handle PDF files
    else if(f.type === 'application/pdf' || f.name.endsWith('.pdf')){
      const reader = new FileReader();
      reader.onload = function(ev){
        extractPdfText(ev.target.result);
      }
      reader.onerror = ()=> alert('Unable to read PDF file. Please paste your resume text directly in the textarea.');
      reader.readAsArrayBuffer(f);
    }
    // For other file types
    else {
      statusMsg.textContent = `✓ File "${f.name}" received. Please copy the content and paste it into the resume textarea.`;
    }
  });

  // Function to extract text from PDF
  async function extractPdfText(pdfData){
    try {
      statusMsg.textContent = 'Reading PDF...';
      const pdf = await pdfjsLib.getDocument({data: pdfData}).promise;
      let fullText = '';
      
      for(let i = 1; i <= pdf.numPages; i++){
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }
      
      resumeText.value = fullText.trim().slice(0, 1500);
      statusMsg.textContent = `✓ PDF resume extracted. Click "Analyze vs Job Description" to proceed.`;
    } catch(err) {
      console.error('PDF extraction error:', err);
      statusMsg.textContent = 'Error reading PDF. Please paste your resume text manually.';
    }
  }
      

  analyzeBtn.addEventListener('click', handleAnalyze);
  clearBtn.addEventListener('click', handleClear);
  micBtn.addEventListener('click', toggleMic);
  speakBtn.addEventListener('click', speakQuestion);
  nextBtn.addEventListener('click', nextQuestion);
  saveResultBtn.addEventListener('click', saveResultToAdmin);
  restartBtn.addEventListener('click', restartInterview);

})();

/* ----------------------------
   Render job description preview
   ---------------------------- */
function renderJD(jd){
  if(!jd){
    jdContent.innerHTML = '<div class="small">No Job Description available. Ask Admin to create one.</div>';
    return;
  }
  jdContent.innerHTML = `
    <div style="font-weight:700">${escapeHtml(jd.title)}</div>
    <div class="small">Skills: ${escapeHtml(jd.skills)}</div>
    <div class="small">Experience: ${escapeHtml(jd.experience)}</div>
    <div style="margin-top:.5rem;color:var(--muted)">${escapeHtml(jd.description)}</div>
  `;
}

/* ----------------------------
   Analyze resume vs JD
   ---------------------------- */
function handleAnalyze(){
  state.name = (candNameInput.value || '').trim();
  state.resume = (resumeText.value || '').trim();
  state.apiKey = (apiKeyInput.value || '').trim();

  if(!state.resume){
    alert('Please paste your resume text in the textarea.');
    return;
  }
  if(!state.job){
    alert('No Job Description found. Please ask Admin to add one first.');
    return;
  }

  // Compute a simple skill-based match %
  const jdSkills = (state.job.skills || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  
  // Debug: log skills being compared
  console.log('JD Skills:', jdSkills);
  console.log('Resume text length:', state.resume.length);
  
  if(jdSkills.length === 0){
    alert('Job Description has no skills defined. Please ask Admin to add skills.');
    statusMsg.textContent = 'Error: No skills in Job Description.';
    return;
  }
  
  const resumeLower = state.resume.toLowerCase();

  // Count matched skills with improved matching
  let matched = 0;
  const strengths = [];
  const weaknesses = [];
  
  jdSkills.forEach(sk=>{
    if(!sk) return;
    
    // Try multiple matching strategies:
    // 1. Exact phrase match
    // 2. First word match
    // 3. Word boundary matches (look for whole word)
    const skillWords = sk.split(/\s+/);
    const firstWord = skillWords[0];
    
    let isMatched = false;
    
    // Strategy 1: Full skill phrase match
    if(resumeLower.includes(sk)){
      isMatched = true;
    }
    // Strategy 2: First word of skill
    else if(resumeLower.includes(firstWord) && firstWord.length > 2){
      isMatched = true;
    }
    // Strategy 3: Match with word boundaries (handle variations like "java" vs "javascript")
    else if(skillWords.length > 1){
      // For multi-word skills, try to match at least one word
      const foundWords = skillWords.filter(word => resumeLower.includes(word));
      if(foundWords.length > 0){
        isMatched = true;
      }
    }
    
    if(isMatched){
      matched++;
      strengths.push(sk);
      console.log('✓ Matched:', sk);
    } else {
      weaknesses.push(sk);
      console.log('✗ Not matched:', sk);
    }
  });

  const skillPercent = jdSkills.length > 0 ? Math.round((matched / jdSkills.length) * 100) : 0;

  // Update UI status with detailed info
  statusMsg.textContent = `Skill match: ${skillPercent}%. Matched: ${matched}/${jdSkills.length} (${strengths.join(', ') || 'none'}). Threshold: ${THRESHOLD}%`;

  // Store an analysis snapshot in state for later reporting
  state.analysis = {
    matched, total: jdSkills.length, percent: skillPercent,
    strengths, weaknesses
  };

  // Decide whether to start interview
  if(skillPercent >= THRESHOLD){
    // Show match percentage clearly before starting
    statusMsg.textContent = `✓ Profile Matched! ${skillPercent}% match. Starting interview...`;
    statusMsg.style.color = 'green';
    statusMsg.style.fontWeight = 'bold';
    
    // Brief delay so user sees the match message
    setTimeout(() => {
      startInterviewFlow();
    }, 1500);
  } else {
    // Show friendly not matching message
    statusMsg.textContent = `✗ Match: ${skillPercent}% (Need ${THRESHOLD}% to proceed)`;
    statusMsg.style.color = 'red';
    statusMsg.style.fontWeight = 'bold';
    
    alert(`Profile not matching enough for this role (match ${skillPercent}%). You can still proceed to interview, but results may be limited.\n\nMatched: ${strengths.join(', ') || 'None'}\nMissing: ${weaknesses.join(', ')}`);
    // Optionally still allow starting interview manually
    const ok = confirm('Would you like to start the interview anyway?');
    if(ok) startInterviewFlow();
  }
}

/* ----------------------------
   Mock AI call to generate questions
   - Uses fetch with API key placeholder, but will fallback to local generation.
   ---------------------------- */
async function requestAIQuestions(job, resume, apiKey){
  // Compose a prompt payload (simulated)
  const payload = {
    prompt: `Generate ${MIN_QUESTIONS}-${MAX_QUESTIONS} interview questions tailored to this job and candidate:\n\nJOB: ${job.title}\nSKILLS: ${job.skills}\nDESCRIPTION: ${job.description}\n\nRESUME: ${resume}\n\nReturn a JSON array of question strings.`,
    max_questions: MAX_QUESTIONS
  };

  // Attempt to call a placeholder API endpoint to demonstrate usage of fetch and API key header.
  // NOTE: This is a mock/demo: we don't expect a real response; we catch errors and fallback.
  try{
    const resp = await fetch('https://api.mock-openai.local/generate-questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (apiKey || 'REPLACE_WITH_YOUR_KEY')
      },
      body: JSON.stringify(payload),
      // keep short timeout semantics
    });

    // If remote returns a valid JSON array of questions, use it
    if(resp.ok){
      const data = await resp.json();
      if(Array.isArray(data.questions)) return data.questions;
      // If the response is a plain array
      if(Array.isArray(data)) return data;
    }
  } catch (e){
    // Expected in this prototype - remote endpoint doesn't exist or blocked.
    console.warn('Mock AI fetch failed, falling back to local generator.', e);
  }

  // Fallback: locally generate questions based on JD and resume
  return generateQuestionsLocally(job, resume);
}

/* ----------------------------
   Local question generator (fallback)
   - Create questions from skills + resume bullet points
   ---------------------------- */
function generateQuestionsLocally(job, resume){
  const skills = (job.skills || '').split(',').map(s=>s.trim()).filter(Boolean);
  const jsent = [];
  // For each skill, generate 1-2 targeted questions
  skills.forEach(skill=>{
    const s = skill || 'a relevant skill';
    jsent.push(`Can you describe a project where you used ${s}? What challenges did you face?`);
    jsent.push(`How do you approach learning and improving your ${s} skills? Give a concrete example.`);
  });

  // Add behavioral and context questions from job title and resume
  const title = job.title || 'this role';
  jsent.push(`Why are you interested in the ${title} position at our company?`);
  jsent.push(`Tell me about a time you resolved a difficult problem in a project.`);
  jsent.push(`How do you ensure your work is accessible and performant?`);

  // Extract a couple of lines from resume (split by sentences) to create personalized questions
  const resumeSentences = resume.split(/[\.\n]+/).map(s=>s.trim()).filter(Boolean);
  const sample = resumeSentences.slice(0,3);
  sample.forEach((s,i)=>{
    jsent.push(`You mentioned: "${s}". Could you expand on that experience?`);
  });

  // Trim/crop to required number of questions
  const count = Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, Math.floor(jsent.length)));
  // Shuffle lightly and pick 'count'
  const shuffled = jsent.sort(()=>0.5 - Math.random());
  return shuffled.slice(0, count);
}

/* ----------------------------
   Interview flow
   ---------------------------- */
async function startInterviewFlow(){
  // Generate questions (simulate remote call)
  statusMsg.textContent = 'Generating interview questions (via mock AI)...';
  interviewArea.hidden = true;
  resultArea.hidden = true;

  const questions = await requestAIQuestions(state.job, state.resume, state.apiKey);
  if(!Array.isArray(questions) || questions.length === 0){
    alert('Unable to generate interview questions. Try again later.');
    statusMsg.textContent = 'Question generation failed.';
    return;
  }

  // Initialize interview state
  state.questions = questions;
  state.answers = Array(questions.length).fill('');
  state.currentQ = 0;

  // Show first question
  statusMsg.textContent = `Starting interview: ${questions.length} questions.`;
  interviewArea.hidden = false;
  renderCurrentQuestion();
}

/* Render current question to UI */
function renderCurrentQuestion(){
  const idx = state.currentQ;
  const q = state.questions[idx];
  const isLastQuestion = idx === state.questions.length - 1;
  
  qIndex.textContent = `Question ${idx + 1} of ${state.questions.length}`;
  questionText.textContent = q;
  answerText.value = state.answers[idx] || '';
  sttInfo.textContent = state.recognition ? '🎤 Speech recognition ready - click mic to start' : 'Speech recognition not available';
  
  // Change button text based on whether this is the last question
  nextBtn.textContent = isLastQuestion ? '✓ Finish Interview' : 'Next';
}

/* Move to next question or finish */
function nextQuestion(){
  // Get current answer
  const currentAnswer = answerText.value.trim();
  
  // Validate answer quality
  const minLength = 20; // Minimum 20 characters
  const minWords = 5;   // Minimum 5 words
  
  if(!currentAnswer){
    alert('Please provide an answer before proceeding.');
    return;
  }
  
  const wordCount = currentAnswer.split(/\s+/).filter(Boolean).length;
  
  if(currentAnswer.length < minLength || wordCount < minWords){
    const response = confirm(`Your answer seems too brief (${wordCount} words, ${currentAnswer.length} chars). Please provide a more detailed response.\n\nClick OK to continue anyway, or Cancel to expand your answer.`);
    if(!response){
      return; // User wants to add more detail
    }
  }
  
  // Save current answer
  state.answers[state.currentQ] = currentAnswer;

  const isLastQuestion = state.currentQ === state.questions.length - 1;

  if(isLastQuestion){
    // Last question - finish interview
    speechSynthesis.cancel(); // Stop any playing audio
    finishInterview();
  } else {
    // Move to next question
    state.currentQ++;
    renderCurrentQuestion();
    // Optionally speak question automatically
    speakQuestion();
  }
}

/* Finish interview: compute result summary */
function finishInterview(){
  // Stop any playing audio
  speechSynthesis.cancel();
  if(window.currentRecognition) window.currentRecognition.stop();
  
  // Get baseline analysis from resume
  const anal = state.analysis || { percent: 0, strengths: [], weaknesses: [] };
  const strengths = anal.strengths || [];
  const weaknesses = anal.weaknesses || [];
  
  // Evaluate each answer for quality and relevance
  const answerScores = [];
  let totalAnswerScore = 0;
  
  state.answers.forEach((ans, idx) => {
    const ansLower = (ans || '').toLowerCase();
    const wordCount = ans.split(/\s+/).filter(Boolean).length;
    
    // Grade this answer (0-100)
    let score = 0;
    const feedback = [];
    
    // 1. Length/Detail score (30 points)
    if(wordCount >= 50) {
      score += 30;
      feedback.push('✓ Excellent detail');
    } else if(wordCount >= 30) {
      score += 20;
      feedback.push('• Good detail');
    } else if(wordCount >= 15) {
      score += 10;
      feedback.push('• Moderate detail');
    } else {
      score += 5;
      feedback.push('◦ Brief answer');
    }
    
    // 2. Skill relevance score (35 points)
    let skillMatches = 0;
    const mentionedSkills = [];
    strengths.forEach(skill => {
      if(ansLower.includes(skill.toLowerCase())) {
        skillMatches++;
        mentionedSkills.push(skill);
      }
    });
    
    if(skillMatches >= 3) {
      score += 35;
      feedback.push('✓ Highly relevant to role');
    } else if(skillMatches === 2) {
      score += 28;
      feedback.push('✓ Relevant to role');
    } else if(skillMatches === 1) {
      score += 18;
      feedback.push('• Some relevance');
    } else {
      // Check if it mentions ANY technical term
      const hasContent = ansLower.match(/\b(experience|project|built|developed|created|implemented|designed|managed|learned|skilled|proficient)\b/i);
      score += hasContent ? 8 : 0;
      feedback.push(hasContent ? '• Generic but relevant' : '◦ Limited relevance');
    }
    
    // 3. Confidence/Specificity score (35 points)
    const hasMetrics = ansLower.match(/\b(\d+\s*(years?|months?|projects?|users?|%))/i);
    const hasExamples = ansLower.match(/\b(built|created|developed|implemented|successfully|achieved|led|managed)\b/i);
    const specificity = (hasMetrics ? 1 : 0) + (hasExamples ? 1 : 0);
    
    if(specificity === 2) {
      score += 35;
      feedback.push('✓ Specific & measured');
    } else if(specificity === 1) {
      score += 20;
      feedback.push('• Some specificity');
    } else {
      score += 10;
      feedback.push('◦ Could be more specific');
    }
    
    // Cap score at 100
    score = Math.min(100, score);
    
    answerScores.push({
      question: state.questions[idx],
      answer: ans,
      score: score,
      wordCount: wordCount,
      skillsMatched: mentionedSkills,
      feedback: feedback.join(' | ')
    });
    
    totalAnswerScore += score;
  });
  
  // Calculate interview performance score
  const avgAnswerScore = Math.round(totalAnswerScore / state.answers.length);
  
  // Combined score: 60% resume match, 40% answer quality
  const combined = Math.round((anal.percent * 0.6) + (avgAnswerScore * 0.4));
  
  // Detect strengths/weaknesses from answers
  const detectedStrengths = new Set(anal.strengths || []);
  const detectedWeaknesses = new Set(anal.weaknesses || []);
  
  // If answers address weakness skills, move them to strengths
  (anal.weaknesses || []).forEach(wk=>{
    state.answers.forEach(a=>{
      if((a||'').toLowerCase().includes(wk.toLowerCase())) {
        detectedStrengths.add(wk);
        detectedWeaknesses.delete(wk);
      }
    });
  });

  const result = {
    id: genId(),
    name: state.name || ('Candidate ' + new Date().toLocaleString()),
    resumeMatch: anal.percent,
    answerQuality: avgAnswerScore,
    match: combined,
    strengths: Array.from(detectedStrengths),
    weaknesses: Array.from(detectedWeaknesses),
    answers: state.answers,
    answerScores: answerScores,
    questions: state.questions,
    timestamp: new Date().toISOString(),
    status: combined > 70 ? 'Selected' : 'Rejected'
  };

  // Show result summary in UI with detailed breakdown
  interviewArea.hidden = true;
  resultArea.hidden = false;
  
  const answerDetailsHtml = answerScores.map((as, idx) => `
    <div style="margin-top: 1rem; padding: 0.8rem; background: #f5f5f5; border-left: 4px solid ${as.score >= 75 ? '#4CAF50' : as.score >= 50 ? '#FFC107' : '#f44336'}; border-radius: 4px;">
      <div style="font-weight: bold; color: #333;">Q${idx + 1}: ${as.score}% Quality</div>
      <div style="font-size: 0.9rem; color: #666; margin: 0.3rem 0;">${as.feedback}</div>
      <div style="font-size: 0.85rem; color: #888; margin-top: 0.3rem;">
        ${as.wordCount} words 
        ${as.skillsMatched.length > 0 ? `| Skills: ${as.skillsMatched.join(', ')}` : ''}
      </div>
    </div>
  `).join('');
  
  resultSummary.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
      <div style="padding: 1rem; background: #E3F2FD; border-radius: 4px; text-align: center;">
        <div style="font-size: 0.9rem; color: #1976D2;">Resume Match</div>
        <div style="font-size: 2rem; font-weight: bold; color: #1976D2;">${result.resumeMatch}%</div>
      </div>
      <div style="padding: 1rem; background: #F3E5F5; border-radius: 4px; text-align: center;">
        <div style="font-size: 0.9rem; color: #7B1FA2;">Answer Quality</div>
        <div style="font-size: 2rem; font-weight: bold; color: #7B1FA2;">${result.answerQuality}%</div>
      </div>
      <div style="padding: 1rem; background: ${result.match > 70 ? '#C8E6C9' : '#FFCDD2'}; border-radius: 4px; text-align: center;">
        <div style="font-size: 0.9rem; color: #333;">Overall Match</div>
        <div style="font-size: 2rem; font-weight: bold; color: ${result.match > 70 ? '#2E7D32' : '#C62828'};">${result.match}%</div>
      </div>
    </div>
    
    <div style="margin: 1rem 0; padding: 1rem; background: ${result.status === 'Selected' ? '#E8F5E9' : '#FFEBEE'}; border-radius: 4px;">
      <strong>Status: ${result.status}</strong>
    </div>
    
    <div style="margin: 1rem 0;">
      <strong>Strengths:</strong> ${escapeHtml(result.strengths.join(', ') || '—')}
    </div>
    <div>
      <strong>Areas to Improve:</strong> ${escapeHtml(result.weaknesses.join(', ') || '—')}
    </div>
    
    <div style="margin-top: 1rem;">
      <strong>Answer Quality Breakdown:</strong>
      ${answerDetailsHtml}
    </div>
    
    <div style="margin-top:1rem;color:var(--muted);font-size:0.9rem;"><em>Your answers are saved and can be reviewed by Admin.</em></div>
  `;

  // Keep result in state so Save button can persist
  state.latestResult = result;
  statusMsg.textContent = 'Interview complete. Results ready for review.';
}

/* Save interview result to localStorage (Admin can view it) */
function saveResultToAdmin(){
  if(!state.latestResult) return alert('No result to save.');
  
  fetch('/save-score', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ score: state.latestResult.match })
  })
  .then(response => {
    if(response.ok) alert('Interview result saved to database.');
    else alert('Error saving result.');
  })
  .catch(err => console.error(err));
}

/* Restart interview (clear state) */
function restartInterview(){
  state.questions = [];
  state.answers = [];
  state.currentQ = 0;
  state.latestResult = null;
  interviewArea.hidden = true;
  resultArea.hidden = true;
  statusMsg.textContent = 'Awaiting resume analysis...';
}

/* ----------------------------
   Speech: TTS & STT
   ---------------------------- */
function speakQuestion(){
  const q = state.questions[state.currentQ];
  if(!q) return;
  // Simple TTS using Web Speech API
  try{
    const u = new SpeechSynthesisUtterance(q);
    u.lang = 'en-US';
    speechSynthesis.cancel(); // cancel any current
    speechSynthesis.speak(u);
  } catch (e){
    console.warn('TTS not available', e);
    alert('Text-to-Speech is not available in your browser.');
  }
}

function toggleMic(){
  // If listening, stop the current recognition instance
  if (state.listening && window.currentRecognition) {
    window.currentRecognition.stop();
    return;
  }

  // Check for browser support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition){
    sttInfo.textContent = '❌ Speech recognition not available in this browser.';
    return alert('Speech recognition not available. Try Chrome, Edge, or Safari.');
  }
  
  // Create a new recognition object for this session for robustness
  const rec = new SpeechRecognition();
  window.currentRecognition = rec; // Make it accessible globally

  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = ()=> { 
    state.listening = true; 
    micBtn.textContent = '⏹️ Stop Mic'; 
    sttInfo.textContent = '🎤 Mic activated, waiting for speech...'; 
  };

  rec.onaudiostart = () => {
    sttInfo.textContent = '🎤 Audio detected, speak now...';
  };
  
  rec.onend = ()=> { 
    state.listening = false; 
    micBtn.textContent = '🎙️ Start Mic'; 
    sttInfo.textContent = 'Mic stopped. Click to record again.'; 
    window.currentRecognition = null; // Clean up
  };
  
  rec.onerror = (ev)=> {
    console.warn('STT error', ev);
    const errorMsg = {
      'network': 'Network error. Check internet connection.',
      'no-speech': 'No speech detected. Please try again.',
      'audio-capture': 'Microphone problem. Check browser permissions & system settings.',
      'not-allowed': 'Microphone access denied. Please allow microphone in browser settings.'
    }[ev.error] || 'Speech recognition error: ' + (ev.error || 'unknown');
    
    sttInfo.textContent = errorMsg;
    // onend will fire automatically after an error, resetting the state.
  };

  rec.onresult = (e) => {
    let interim_transcript = '';
    let final_transcript_chunk = '';

    // Process all new results since the last event
    for (let i = e.resultIndex; i < e.results.length; ++i) {
      const transcript = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        final_transcript_chunk += transcript;
      } else {
        interim_transcript += transcript;
      }
    }

    // Append any newly finalized text to the main textarea
    if (final_transcript_chunk.trim()) {
      const currentText = answerText.value.trim();
      const newText = final_transcript_chunk.trim();
      answerText.value = currentText ? currentText + ' ' + newText : newText;
      sttInfo.textContent = `✓ Captured: "${newText}"`;
    }
    
    // Display the current in-progress text for real-time feedback
    if (interim_transcript.trim()) {
      sttInfo.textContent = `Listening: ${interim_transcript.trim()}`;
    }
  };

  try {
    speechSynthesis.cancel(); // Stop any TTS
    answerText.focus();
    rec.start();
  } catch (e) {
    console.warn('STT start error', e);
    sttInfo.textContent = 'Error starting microphone.';
  }
}

/* ----------------------------
   Helpers for clearing UI
   ---------------------------- */
function handleClear(){
  candNameInput.value = '';
  resumeText.value = '';
  apiKeyInput.value = '';
  statusMsg.textContent = 'Awaiting resume analysis...';
  interviewArea.hidden = true;
  resultArea.hidden = true;
}

/* ----------------------------
   Restart / Page-level helpers
   ---------------------------- */
function restartInterview(){
  state.questions = [];
  state.answers = [];
  state.currentQ = 0;
  state.latestResult = null;
  interviewArea.hidden = true;
  resultArea.hidden = true;
  statusMsg.textContent = 'Awaiting resume analysis...';
}

/* ----------------------------
   Expose some functions for debug (optional)
   ---------------------------- */
window._AI_PROTO_DEBUG = {
  requestAIQuestions,
  generateQuestionsLocally,
};