// Global game and AI instances
let game;
let ai;

function setupEventListeners() {
    // --- KEYBOARD INPUT FOR MANUAL PLAY (FIXED) ---
    // Listen for keydown events on the whole document
    document.addEventListener('keydown', (event) => {
        let moved = false;
        let acted = false;
        
        // Check if the game is over before allowing moves
        if (game.gameOver) return;

        switch (event.key) {
            case 'ArrowUp': game.movePlayer(0); moved = true; break;
            case 'ArrowRight': game.movePlayer(1); moved = true; break;
            case 'ArrowDown': game.movePlayer(2); moved = true; break;
            case 'ArrowLeft': game.movePlayer(3); moved = true; break;
            case 'Enter': game.performAction(); acted = true; break;
            case 'f':
            case 'F': game.toggleFog(); break;
            default: return; // Stop if it's not a handled key
        }

        if (moved || acted) {
            // Prevent default browser behavior (like scrolling)
            event.preventDefault(); 
            game.moves++;
            game.updateStats();
            game.checkGameConditions();
            game.draw();
        }
    });

    // --- AI Button Click Listener (Simplified) ---
    // This is now only responsible for starting the AI
    document.getElementById('aiButton').addEventListener('click', () => {
        ai.startAI();
        // The AI will handle subsequent game drawing and updates
    });

    // Dark Mode Toggle Logic
    const darkModeToggle = document.getElementById('darkModeToggle');
    const modeLabel = document.querySelector('.mode-label');

    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        darkModeToggle.checked = true;
        modeLabel.textContent = 'Dark Mode';
    } else {
        document.body.classList.remove('dark-mode'); 
        darkModeToggle.checked = false;
        modeLabel.textContent = 'Light Mode';
    }

    darkModeToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            document.body.classList.add('dark-mode');
            modeLabel.textContent = 'Dark Mode';
            localStorage.setItem('darkMode', 'true');
        } else {
            document.body.classList.remove('dark-mode');
            modeLabel.textContent = 'Light Mode';
            localStorage.setItem('darkMode', 'false');
        }
        game.draw();
    });
}

function handleRestart() {
    // Stop AI cleanly before restart
    ai.stopAI();

    // Stop any remaining confetti animation
    game.particles = [];
    if (game.confettiCtx) {
        game.confettiCtx.clearRect(0, 0, game.confettiCanvas.width, game.confettiCanvas.height);
    }
    
    // Restart logic from Game class
    game.score = 0;
    game.goldCollected = 0;
    game.moves = 0;
    game.gameOver = false;
    game.won = false;
    game.showFog = true;
    
    document.getElementById('winModal').style.display = 'none';
    document.getElementById('loseModal').style.display = 'none';
    
    game.setupMap(); 
    game.resetState();
    game.draw();
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function initGame() {
    game = new Game();
    ai = new AI(game); // Pass the game instance to the AI

    // Attach global functions to the window/document for HTML buttons
    window.game = {
        startAI: () => ai.startAI(),
        restart: handleRestart,
        toggleFog: () => game.toggleFog(),
        closeModal: closeModal
    };

    game.setupMap();
    game.resetState();
    game.draw();
    setupEventListeners();
}

window.onload = initGame;