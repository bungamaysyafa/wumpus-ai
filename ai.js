class AI {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.aiRunning = false;
        this.aiInterval = null;
    }

    // Initialize the AI's internal map/knowledge base
    initAIMap() {
        this.game.aiMap = [];
        for (let y = 0; y < this.game.gridHeight; y++) {
            this.game.aiMap[y] = [];
            for (let x = 0; x < this.game.gridWidth; x++) {
                const isStart = this.game.isStartCell(x, y);
                this.game.aiMap[y][x] = {
                    x, y,
                    visited: isStart,
                    safe: isStart,
                    pitProb: isStart ? 0 : 0.2,
                    wumpusProb: isStart ? 0 : 0.05,
                    hasGold: false,
                    hasSword: false,
                    isWumpusNeighbor: false,
                    isPitNeighbor: false,
                };
            }
        }
    }

    // Get percepts for the current cell
    getPercepts(x, y) {
        let hasStench = this.game.wumpus.some(w => !w.slain && this.game.getNeighbors(w.x, w.y).some(n => n.x === x && n.y === y));
        let hasBreeze = this.game.pits.some(p => this.game.getNeighbors(p.x, p.y).some(n => n.x === x && n.y === y));
        let hasGlitter = this.game.gold.some(g => g.x === x && g.y === y);
        let hasShine = this.game.swordLocation && this.game.swordLocation.x === x && this.game.swordLocation.y === y;

        return { hasStench, hasBreeze, hasGlitter, hasShine };
    }

    // Update knowledge based on percepts
    updateKnowledgeBase() {
        const { x, y } = this.game.player;
        const percepts = this.getPercepts(x, y);
        const currentCell = this.game.aiMap[y][x];

        currentCell.visited = true;
        currentCell.safe = true;
        currentCell.pitProb = 0;
        currentCell.wumpusProb = 0;
        currentCell.hasGold = percepts.hasGlitter;
        currentCell.hasSword = percepts.hasShine;

        const neighbors = this.game.getNeighbors(x, y);

        for (const n of neighbors) {
            const neighborCell = this.game.aiMap[n.y][n.x];

            neighborCell.isPitNeighbor = percepts.hasBreeze;
            neighborCell.isWumpusNeighbor = percepts.hasStench;

            if (!neighborCell.visited) {
                if (!percepts.hasBreeze) {
                    neighborCell.pitProb = 0;
                    neighborCell.safe = true;
                }

                if (!percepts.hasStench) {
                    neighborCell.wumpusProb = 0;
                    neighborCell.safe = true;
                }

                if (percepts.hasBreeze && neighborCell.pitProb > 0) {
                    neighborCell.safe = false;
                    neighborCell.pitProb = 0.8;
                }

                if (percepts.hasStench && neighborCell.wumpusProb > 0) {
                    neighborCell.safe = false;
                    neighborCell.wumpusProb = 0.8;
                }
            }
        }
        
        this.game.wumpusTarget = this.findWumpusTarget();
    }

    // Locates the Wumpus target for drawing/AI focus
    findWumpusTarget() {
        // ... Logic for finding Wumpus location ...
        
        // If the AI has the sword, it should target the Wumpus tile directly now
        const liveWumpus = this.game.wumpus.find(w => !w.slain);
        if (liveWumpus && this.game.player.hasSword) {
            return { x: liveWumpus.x, y: liveWumpus.y };
        }
        
        return null;
    }

    // Scoring function for AI moves
    calculateMoveScore(cell) {
        const { x, y } = cell;
        let score = 0;
        
        // NEW: Highest Priority - Slash the Wumpus
        const isWumpusLocation = this.game.wumpus.some(w => w.x === x && w.y === y && !w.slain);
        if (isWumpusLocation && this.game.player.hasSword) {
            return 200; // Force the move
        }

        // Penalty for moving onto a live Wumpus without a sword
        if (isWumpusLocation && !this.game.player.hasSword) {
             return -1000;
        }

        // 🏆 CHANGE FOR EXPLORATION: Increase score for unvisited safe cells from 100 to 150
        // This makes exploring new territory the highest non-combat priority.
        if (!cell.visited && cell.safe) {
            score += 150; 
        }

        // Medium priority: Gold or Sword locations
        if (cell.hasGold && this.game.goldCollected < 3) {
            score += 50;
        }
        if (cell.hasSword && !this.game.player.hasSword) {
            score += 50;
        }
        
        // Low priority: Already visited safe cells
        if (cell.visited && cell.safe) {
            score += 10;
        }

        // 📉 CHANGE FOR EXPLORATION: Reduce the risk penalty multiplier from 50 to 30.
        // This makes the AI more willing to move into cells with minor/default risk (pitProb 0.2).
        if (!cell.safe) {
            score -= (cell.pitProb * 30) + (cell.wumpusProb * 30); 
        }
        
        return score;
    }
    
    // AI logic for determining the next best move
    chooseNextMove() {
        const { x, y } = this.game.player;
        const neighbors = this.game.getNeighbors(x, y);
        const validMoves = [];

        // 1. Look for Gold/Sword (Action)
        const currentCell = this.game.aiMap[y][x];
        if (currentCell.hasGold || (currentCell.hasSword && !this.game.player.hasSword)) {
             return 'ACTION'; 
        }
        
        // 2. Evaluate all neighboring cells
        for (const n of neighbors) {
            const cell = this.game.aiMap[n.y][n.x];

            let dir = -1;
            if (n.x === x && n.y === y - 1) dir = 0;
            else if (n.x === x + 1 && n.y === y) dir = 1;
            else if (n.x === x && n.y === y + 1) dir = 2;
            else if (n.x === x - 1 && n.y === y) dir = 3;

            if (dir !== -1) {
                validMoves.push({
                    x: n.x, y: n.y, dir: dir, 
                    score: this.calculateMoveScore(cell)
                });
            }
        }
        
        // Shuffle to break ties, then sort by Score
        this.shuffleArray(validMoves);
        validMoves.sort((a, b) => b.score - a.score);
        
        if (validMoves.length > 0) {
            const bestMove = validMoves[0];
            
            // FIX: Increase the negative threshold to -500. This allows the AI to 
            // take highly risky moves (max risk is -80) instead of stopping, 
            // but still prevents it from moving to a guaranteed death cell (-1000).
            if (bestMove.score < -500) { 
                 return null;
            }

            return bestMove.dir; 
        } else {
            return null; // Stuck
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // AI main control loop
    startAI() {
        if (this.game.gameOver) return;
        
        const aiButton = document.getElementById('aiButton');
        if (this.aiRunning) {
            this.stopAI();
            return;
        }

        this.aiRunning = true;
        aiButton.textContent = 'Stop AI';
        aiButton.classList.add('running');
        this.initAIMap(); // Initialize map when starting

        this.aiInterval = setInterval(() => {
            if (this.game.gameOver) {
                this.stopAI();
                return;
            }

            this.updateKnowledgeBase();
            const nextMove = this.chooseNextMove();

            if (nextMove !== null) {
                if (nextMove === 'ACTION') {
                    this.game.performAction();
                } else {
                    this.game.movePlayer(nextMove);
                }
                
                this.game.moves++;
                this.game.updateStats();
                this.game.checkGameConditions();
                this.game.draw();
            } else {
                this.stopAI();
            }
            
        }, 50);
    }
    
    stopAI() {
        clearInterval(this.aiInterval);
        this.aiRunning = false;
        document.getElementById('aiButton').textContent = 'Run AI';
        document.getElementById('aiButton').classList.remove('running');
    }
}