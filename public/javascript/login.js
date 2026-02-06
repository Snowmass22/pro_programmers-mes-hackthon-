document.addEventListener('DOMContentLoaded', () => {
    const userTab = document.getElementById('userTab');
    const adminTab = document.getElementById('adminTab');
    const submitBtn = document.getElementById('submitBtn');
    const loginForm = document.getElementById('loginForm');
    
    let currentRole = 'user';

    // Switch to User View
    userTab.addEventListener('click', () => {
        currentRole = 'user';
        userTab.classList.add('active');
        adminTab.classList.remove('active');
        submitBtn.innerText = 'Login as Candidate';
    });

    // Switch to Admin View
    adminTab.addEventListener('click', () => {
        currentRole = 'admin';
        adminTab.classList.add('active');
        userTab.classList.remove('active');
        submitBtn.innerText = 'Login as Recruiter';
    });

    // Form Submission
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        // Basic check for hackathon demo
        if (email && password) {
            console.log(`Logging in as ${currentRole}`);
            
            if (currentRole === 'user') {
                window.location.href = 'upload.html'; // Path to your 2nd page
            } else {
                window.location.href = 'dashboard.html'; // Path to your 4th page
            }
        }
    });
});