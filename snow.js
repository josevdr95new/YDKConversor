function createSnowflake() {
    const snowflake = document.createElement('div');
    snowflake.classList.add('snowflake');
    snowflake.innerHTML = '❄';
    
    // Random starting position
    snowflake.style.left = Math.random() * 100 + 'vw';
    
    // Random size between 10px and 25px
    const size = Math.random() * 15 + 10;
    snowflake.style.fontSize = size + 'px';
    
    // Random animation duration between 5s and 15s
    const animationDuration = Math.random() * 10 + 5;
    snowflake.style.animationDuration = animationDuration + 's';
    
    // Random horizontal wobble
    const wobbleAnimation = `wobble ${Math.random() * 2 + 2}s ease-in-out infinite alternate`;
    snowflake.style.animation = `fall ${animationDuration}s linear forwards, ${wobbleAnimation}`;
    
    document.body.appendChild(snowflake);
    
    // Remove snowflake after animation
    setTimeout(() => {
        snowflake.remove();
    }, animationDuration * 1000);
}

// Create new snowflakes periodically
function startSnowfall() {
    // Create initial batch of snowflakes
    for(let i = 0; i < 20; i++) {
        setTimeout(createSnowflake, Math.random() * 1000);
    }
    
    // Continue creating snowflakes
    setInterval(createSnowflake, 200);
}

// Start the snowfall effect when the page loads
window.addEventListener('load', startSnowfall);