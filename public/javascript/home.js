document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.querySelector('.btn-primary');
    const startBtn = document.querySelector('.btn-primary-large');
    const navLinks = document.querySelectorAll('.nav-links a');

    // 1. Navigation to Login Page
    const goToLogin = () => {
        window.location.href = 'login.html';
    };

    loginBtn.addEventListener('click', goToLogin);
    startBtn.addEventListener('click', goToLogin);

    // 2. Smooth Scroll for "Learn More" / Features
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('href');
            if (targetId.startsWith('#')) {
                e.preventDefault();
                document.querySelector(targetId).scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // 3. Dynamic Voice Wave Effect (Hackathon "Wow" Factor)
    // Randomizes wave heights slightly to look like active audio
    const waveSpans = document.querySelectorAll('.voice-wave span');
    setInterval(() => {
        waveSpans.forEach(span => {
            const randomHeight = Math.floor(Math.random() * (150 - 60 + 1)) + 60;
            span.style.height = `${randomHeight}px`;
        });
    }, 200);
});