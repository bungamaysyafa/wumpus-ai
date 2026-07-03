class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.confettiCanvas = document.getElementById('confettiCanvas');
        this.confettiCtx = this.confettiCanvas.getContext('2d');

        this.gridWidth = 15; 
        this.gridHeight = 8; 
        this.cellSize = 50;
        this.player = { x: 0, y: 7, dir: 0, hasSword: false }; 
        this.score = 0;
        this.goldCollected = 0;
        this.moves = 0;
        this.showFog = true;
        this.gameOver = false;
        this.won = false;
        this.pits = [];
        this.wumpus = [];
        this.gold = [];
        this.swordLocation = null;
        this.visited = [];
        this.goldVisited = []; // To track collected gold cells for map drawing

        // AI properties (managed by AI class, but stored here)
        this.aiMap = [];
        this.wumpusTarget = null; 

        this.canvas.width = this.gridWidth * this.cellSize;
        this.canvas.height = this.gridHeight * this.cellSize;
        this.resizeConfettiCanvas();

        this.initColors();
    }
// ... rest of the Game class ...

    // --- Utility Functions ---

    initColors() {
        this.colors = {
            light: {
                canvasBg: '#f0f0f0', 
                visibleCellBg: '#ffffff', 
                foggedCellBg: '#e0e0e0', 
                gridLine: '#ccc', 
                player: '#708A9A', 
                wumpus: '#A85C5C', 
                gold: '#D8B37A', 
                breeze: '#96D0C5', 
                stench: 'rgba(168, 92, 92, 0.3)', 
                sword: '#FFD700', 
                // Color for collected gold tile (persistent yellow/orange)
                collectedGoldTile: 'rgba(255, 200, 0, 0.3)',
                // Color for uncollected gold tile (when visible on map)
                uncollectedGoldTile: 'rgba(255, 230, 150, 0.5)',
            },
            dark: {
                canvasBg: '#323246',
                visibleCellBg: '#3a3a50',
                foggedCellBg: '#212130',
                gridLine: '#505060',
                player: '#93A5CF',
                wumpus: '#FF6F6F',
                gold: '#FFCC66',
                breeze: '#66CCFF',
                stench: 'rgba(255, 111, 111, 0.3)',
                sword: '#F0E68C',
                // Dark Mode Collected Gold Tile color
                collectedGoldTile: 'rgba(255, 204, 102, 0.3)',
                // Dark Mode Uncollected Gold Tile color
                uncollectedGoldTile: 'rgba(255, 220, 100, 0.2)',
            }
        };
        this.confetti = {
            count: 150,
            colors: ['#D8B37A', '#FFCC66', '#FFFFFF', '#69A197'], 
            size: 8,
            speed: 3,
            gravity: 0.1,
        };
    }

    getCurrentColors() {
        const isDarkMode = document.body.classList.contains('dark-mode');
        return isDarkMode ? this.colors.dark : this.colors.light;
    }
    
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    isValid(x, y) {
        return x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight;
    }
    
    isStartCell(x, y) {
        return x === 0 && y === this.gridHeight - 1;
    }

    isAdjacentToStart(x, y) {
        const startX = 0;
        const startY = this.gridHeight - 1;
        const dx = Math.abs(x - startX);
        const dy = Math.abs(y - startY);
        return (dx + dy) === 1;
    }

    // Updated to be a generic placement check (not used for pits anymore, but for wumpus/gold/sword)
    isPlacementValid(x, y) {
        // Elements cannot be on the start cell, or adjacent to it (ensuring the first move is safe).
        return !this.isStartCell(x, y) && !this.isAdjacentToStart(x, y);
    }

    getNeighbors(x, y) {
        const neighbors = [];
        const possibleMoves = [[0, 1], [0, -1], [1, 0], [-1, 0]]; 
        
        for (const [dx, dy] of possibleMoves) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.isValid(nx, ny)) {
                neighbors.push({ x: nx, y: ny });
            }
        }
        return neighbors;
    }
    
    // Helper function to check if a cell is adjacent to a hazard
    isHazardAdjacent(x, y, pits, wumpus) {
        const neighbors = this.getNeighbors(x, y);
        for (const n of neighbors) {
            // Check for Breeze (adjacent to Pit)
            if (pits.some(p => p.x === n.x && p.y === n.y)) {
                return true; 
            }
            // Check for Stench (adjacent to Wumpus)
            if (wumpus.some(w => w.x === n.x && w.y === n.y && !w.slain)) {
                return true;
            }
        }
        return false;
    }

    // Reusable BFS function to check reachability from start to target, avoiding specified obstacles.
    isReachable(startX, startY, targetX, targetY, blockedCells) {
        // Simple case: start is the target
        if (startX === targetX && startY === targetY) return true;

        const queue = [{ x: startX, y: startY }];
        const visited = new Set(`${startX},${startY}`);
        
        // Convert blocked array to a Set for quick lookups
        const blockedSet = new Set(blockedCells.map(p => `${p.x},${p.y}`));

        while (queue.length > 0) {
            const current = queue.shift();

            for (const neighbor of this.getNeighbors(current.x, current.y)) {
                const key = `${neighbor.x},${neighbor.y}`;

                if (neighbor.x === targetX && neighbor.y === targetY) {
                    return true;
                }

                // A cell is only passable if it hasn't been visited AND is NOT a blocked cell.
                if (!visited.has(key) && !blockedSet.has(key)) {
                    visited.add(key);
                    queue.push(neighbor);
                }
            }
        }
        return false;
    }

    // --- Game Setup and State Management ---

    setupMap() {
        this.pits = [];
        this.wumpus = []; 
        this.gold = [];
        this.swordLocation = null;
        
        let attempts = 0;
        const maxAttempts = 100;
        
        const startX = 0;
        const startY = this.gridHeight - 1;
        const startNeighbors = this.getNeighbors(startX, startY);

        // Keep trying until we generate a solvable map
        while (attempts < maxAttempts) {
            attempts++;
            
            // Use temporary arrays for checking constraints
            const tempPits = [];
            const tempWumpus = []; 
            const tempGold = [];
            let tempSword = null;

            const allCells = [];
            for (let y = 0; y < this.gridHeight; y++) {
                for (let x = 0; x < this.gridWidth; x++) {
                    // Elements cannot be on the start cell, or adjacent to it.
                    if (this.isStartCell(x, y) || this.isAdjacentToStart(x, y)) {
                        continue;
                    }
                    allCells.push({ x, y });
                }
            }
            
            // Shuffle all available cells
            for (let i = allCells.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allCells[i], allCells[j]] = [allCells[j], allCells[i]];
            }
            
            let cellIndex = 0;

            // 1. Wumpus placement
            if (cellIndex >= allCells.length) continue;
            const wumpusLoc = allCells[cellIndex++];
            tempWumpus.push({ x: wumpusLoc.x, y: wumpusLoc.y, slain: false });
            
            let remainingCells = allCells.slice(cellIndex);

            // 2. Gold placement (3 locations) - Must not be adjacent to Wumpus/Pits (no pits yet, but good check)
            let goldCount = 0;
            const goldIndicesToRemove = [];
            
            for (let i = 0; i < remainingCells.length; i++) {
                const goldLoc = remainingCells[i];
                if (!this.isHazardAdjacent(goldLoc.x, goldLoc.y, tempPits, tempWumpus)) {
                    tempGold.push(goldLoc);
                    goldIndicesToRemove.push(i); 
                    goldCount++;
                }
                if (goldCount === 3) break;
            }
            
            if (goldCount < 3) continue;

            for (let i = goldIndicesToRemove.length - 1; i >= 0; i--) {
                remainingCells.splice(goldIndicesToRemove[i], 1);
            }
            
            // 3. Sword placement (1 location) - Must not be a hazard itself or adjacent to one
            let swordPlacementCandidateIndex = -1;
            for (let i = 0; i < remainingCells.length; i++) {
                const swordLoc = remainingCells[i];
                
                const isHazard = tempWumpus.some(w => w.x === swordLoc.x && w.y === swordLoc.y);
                
                if (!isHazard && !this.isHazardAdjacent(swordLoc.x, swordLoc.y, tempPits, tempWumpus)) {
                    tempSword = swordLoc;
                    swordPlacementCandidateIndex = i;
                    break;
                }
            }
            
            if (!tempSword) {
                continue; 
            }
            
            remainingCells.splice(swordPlacementCandidateIndex, 1);
            
            // 4. Pits placement - Stricter Connectivity Check
            let pitCandidates = remainingCells;
            const totalCells = this.gridWidth * this.gridHeight;
            const maxPits = Math.min(10, Math.floor(totalCells * 0.15));
            const pitCount = this.randomInt(5, maxPits);
            
            // Critical locations that MUST remain reachable
            const criticalLocations = [tempSword, ...tempGold, ...tempWumpus];

            for (let i = 0; i < pitCount; i++) {
                if (pitCandidates.length === 0) break;
                
                const pitLoc = pitCandidates.shift();
                let createsHazardBreeze = false;

                // Check 1: Does the pit create a breeze on a gold/sword tile?
                const pitNeighbors = this.getNeighbors(pitLoc.x, pitLoc.y);
                for (const n of pitNeighbors) {
                    if (tempGold.some(g => g.x === n.x && g.y === n.y) || (n.x === tempSword.x && n.y === tempSword.y)) {
                        createsHazardBreeze = true;
                        break;
                    }
                }

                if (!createsHazardBreeze) {
                    // --- STAGE 2: STICKY REACHABILITY CHECK ---
                    const testPits = [...tempPits, pitLoc];
                    let allReachable = true;

                    // CHECK A: Path from Start Cell (0, 7) to ALL critical items
                    for (const item of criticalLocations) {
                        // Wumpus is an obstacle only if it's NOT the target itself.
                        const blockedCells = (item.x === tempWumpus[0].x && item.y === tempWumpus[0].y) ? testPits : [...testPits, tempWumpus[0]];
                        if (!this.isReachable(startX, startY, item.x, item.y, blockedCells)) {
                            allReachable = false;
                            break;
                        }
                    }

                    // CHECK B: Path from Start Neighbors to ALL critical items
                    // This prevents pits from boxing in the start area by guaranteeing multiple entry/exit points are open.
                    if (allReachable) {
                        for (const startNeighbor of startNeighbors) {
                            if (startNeighbor.x === pitLoc.x && startNeighbor.y === pitLoc.y) {
                                // The placement list already ensures the pit is not on a neighbor, but this is a double check.
                                continue;
                            }
                            
                            for (const item of criticalLocations) {
                                // Blocked cells are the pits and the Wumpus (unless the Wumpus is the target)
                                const blockedCells = (item.x === tempWumpus[0].x && item.y === tempWumpus[0].y) ? testPits : [...testPits, tempWumpus[0]];
                                
                                if (!this.isReachable(startNeighbor.x, startNeighbor.y, item.x, item.y, blockedCells)) {
                                    allReachable = false;
                                    break;
                                }
                            }
                            if (!allReachable) break;
                        }
                    }

                    // If all checks pass, place the pit
                    if (allReachable) {
                        tempPits.push(pitLoc);
                    } else {
                        // Skip this pit location, it would block a critical path or box the start.
                        pitCandidates.push(pitLoc); 
                    }
                } else {
                    // Skip this pit location, it would place a breeze on a gold or sword tile.
                }
            }
            
            // Assign successful temporary map
            this.wumpus = tempWumpus;
            this.gold = tempGold;
            this.swordLocation = tempSword;
            this.pits = tempPits;

            if (this.isMapSolvable()) {
                return; // Success! Use this map
            }
        }
        
        // Fallback: If no solvable map found, create a guaranteed safe one
        console.warn('Could not generate random solvable map, using fallback');
        this.createFallbackMap();
    }
    
    // NOTE: This function provides a final safety check.
    isMapSolvable() {
        // Check if there's a safe path from start to all objectives
        const start = { x: 0, y: this.gridHeight - 1 };
        const objectives = [
            ...this.gold,
            this.swordLocation,
            this.wumpus[0] // Need to reach Wumpus location eventually
        ];
        
        // For each objective, check if reachable via safe cells
        for (const objective of objectives) {
            const wumpusAsObstacle = this.wumpus[0].x !== objective.x || this.wumpus[0].y !== objective.y ? this.wumpus : [];
            const blocked = [...this.pits, ...wumpusAsObstacle];

            if (!this.isReachable(start.x, start.y, objective.x, objective.y, blocked)) {
                return false;
            }
        }
        
        return true;
    }
    
    createFallbackMap() {
        // Create a simple, guaranteed solvable map
        this.pits = [];
        this.wumpus = [];
        this.gold = [];
        this.swordLocation = null;
        
        // Place Wumpus in a safe, reachable location (3, 3)
        this.wumpus.push({ x: 3, y: 3, slain: false });
        
        // Place gold in safe locations (not adjacent to Wumpus or start area)
        this.gold.push({ x: 1, y: 5 }); 
        this.gold.push({ x: 6, y: 1 }); 
        this.gold.push({ x: 10, y: 5 }); 
        
        // Place sword before Wumpus
        this.swordLocation = { x: 2, y: 4 };
        
        // Add a few pits that don't block the path or sit next to gold/start
        this.pits.push({ x: 5, y: 5 });
        this.pits.push({ x: 7, y: 4 });
        this.pits.push({ x: 9, y: 3 });
        this.pits.push({ x: 12, y: 1 });
        this.pits.push({ x: 14, y: 7 });
    }
    
    resetState() {
        this.score = 0;
        this.goldCollected = 0;
        this.moves = 0;
        this.gameOver = false;
        this.won = false;
        this.showFog = true;
        
        this.player.x = 0;
        this.player.y = this.gridHeight - 1;
        this.player.hasSword = false;
        this.player.dir = 0;
        
        this.visited = [];
        for (let y = 0; y < this.gridHeight; y++) {
            this.visited[y] = [];
            for (let x = 0; x < this.gridWidth; x++) {
                this.visited[y][x] = false;
            }
        }
        this.markVisited(this.player.x, this.player.y);
        
        // Reset goldVisited
        this.goldVisited = [];
        
        // Initialize AI Map
        this.aiMap = [];
        this.wumpusTarget = null;

        this.updateStats();
    }

    // --- Movement and Action Logic ---

    markVisited(x, y) {
        if (this.isValid(x, y)) {
            this.visited[y][x] = true;
        }
    }

    movePlayer(direction) {
        this.player.dir = direction;
        
        let newX = this.player.x;
        let newY = this.player.y;

        switch (direction) {
            case 0: newY--; break; // Up
            case 1: newX++; break; // Right
            case 2: newY++; break; // Down
            case 3: newX--; break; // Left
        }

        if (this.isValid(newX, newY)) {
            this.player.x = newX;
            this.player.y = newY;
            this.markVisited(newX, newY);
            this.score -= 1;
        }
    }
    
    // Helper function to collect gold
    collectGold(x, y) {
        const goldIndex = this.gold.findIndex(g => g.x === x && g.y === y);
        if (goldIndex !== -1) {
            // Mark the cell as having had gold
            this.goldVisited.push({ x, y }); 
            
            this.gold.splice(goldIndex, 1);
            this.goldCollected++;
            this.score += 1000;
            return true;
        }
        return false;
    }

    performAction() {
        const { x, y } = this.player;
        let actionTaken = false;

        // 1. Pick up Gold 
        if (this.collectGold(x, y)) {
            actionTaken = true;
        }

        // 2. Pick up Sword
        if (this.swordLocation && this.swordLocation.x === x && this.swordLocation.y === y) {
            this.player.hasSword = true;
            this.swordLocation = null;
            actionTaken = true;
        }

        if (actionTaken) {
            this.checkGameConditions();
            this.draw();
            this.updateStats();
        }
    }

    checkGameConditions() {
        if (this.gameOver) return;
        
        const { x, y } = this.player;

        // Win Condition
        if (this.goldCollected === 3 && this.wumpus.every(w => w.slain)) {
            this.winGame();
            return;
        }

        // 1. Pit Hazard
        if (this.pits.some(p => p.x === x && p.y === y)) {
            this.score -= 10000;
            this.endGame(false, `You fell into a pit at (${x}, ${y})!`);
            return;
        }

        // 2. Wumpus Hazard / Slash Logic (Direct Entry)
        const wumpusCell = this.wumpus.find(w => w.x === x && w.y === y && !w.slain);
        if (wumpusCell) {
            if (this.player.hasSword) {
                // Slash the Wumpus
                wumpusCell.slain = true; 
                this.player.hasSword = false;
                this.score += 5000;
                // AI state clear for Wumpus target is done in AI class, but can be done here for safety
                this.wumpusTarget = null; 
                this.draw(); 
                this.updateStats();
                return;
            } else {
                // Game Over (Eaten by Wumpus without a sword)
                this.score -= 10000;
                this.endGame(false, `You were eaten by the Wumpus at (${x}, ${y})!`);
                return;
            }
        }
    }

    // --- Drawing Functions ---

    draw() {
        if (this.gameOver) return;

        const { ctx, cellSize, gridWidth, gridHeight } = this;
        const colors = this.getCurrentColors();

        // Clear canvas
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Draw Grid Lines and Cells
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                const isVisible = !this.showFog || this.visited[y][x];
                const isCurrent = x === this.player.x && y === this.player.y;
                const cellX = x * cellSize;
                const cellY = y * cellSize;
                
                // Determine base background color
                ctx.fillStyle = isVisible ? colors.visibleCellBg : colors.foggedCellBg;
                
                // 1. Highlight collected gold tile (ALWAYS YELLOW AFTER COLLECTION)
                if (isVisible && this.goldVisited.some(gv => gv.x === x && gv.y === y)) {
                    ctx.fillStyle = colors.collectedGoldTile;
                }
                
                // 2. Highlight UNCOLLECTED gold tile (IF VISIBLE)
                if (isVisible && this.gold.some(g => g.x === x && g.y === y)) {
                    ctx.fillStyle = colors.uncollectedGoldTile;
                }
                
                ctx.fillRect(cellX, cellY, cellSize, cellSize);

                // Draw Grid Lines
                ctx.strokeStyle = colors.gridLine;
                ctx.lineWidth = 1;
                ctx.strokeRect(cellX, cellY, cellSize, cellSize);

                // Draw Percepts and Objects (only for visible cells)
                if (isVisible) {
                    this.drawPercepts(x, y, cellX, cellY, colors);
                    this.drawObjects(x, y, cellX, cellY, colors);
                }
                
                // Highlight Current Cell (Player)
                if (isCurrent) {
                    ctx.strokeStyle = colors.player;
                    ctx.lineWidth = 3;
                    ctx.strokeRect(cellX + 1, cellY + 1, cellSize - 2, cellSize - 2);
                }
            }
        }

        // 2. Draw Player (always last for visibility)
        this.drawPlayer(colors);
        
        // 3. Draw Wumpus Target (for AI debugging, if active)
        if (window.ai && window.ai.aiRunning && this.wumpusTarget) {
            this.drawWumpusTarget(colors);
        }
    }

    drawPercepts(x, y, cellX, cellY, colors) {
        const neighbors = this.getNeighbors(x, y);
        let hasBreeze = false;
        let hasStench = false;
        
        for (const n of neighbors) {
            if (this.pits.some(p => p.x === n.x && p.y === n.y)) {
                hasBreeze = true;
            }
            if (this.wumpus.some(w => w.x === n.x && w.y === n.y && !w.slain)) {
                hasStench = true;
            }
        }

        const { ctx, cellSize } = this;

        if (hasBreeze) {
            ctx.fillStyle = colors.breeze;
            ctx.globalAlpha = 0.5;
            ctx.fillRect(cellX, cellY, cellSize, cellSize);
            ctx.globalAlpha = 1.0;
        }

        if (hasStench) {
            ctx.fillStyle = colors.stench;
            ctx.globalAlpha = 0.3;
            ctx.fillRect(cellX, cellY, cellSize, cellSize);
            ctx.globalAlpha = 1.0;
        }

        ctx.font = `${Math.floor(cellSize * 0.2)}px Arial`;
        ctx.textAlign = 'center';
        let offset = 0;
        
        if (hasBreeze) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillText('Breeze', cellX + cellSize / 2, cellY + cellSize / 2 + offset);
            offset += Math.floor(cellSize * 0.2) + 2;
        }
        
        if (hasStench) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillText('Stench', cellX + cellSize / 2, cellY + cellSize / 2 + offset);
        }
    }
    
    drawObjects(x, y, cellX, cellY, colors) {
        const { ctx, cellSize } = this;
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fontSize = Math.floor(cellSize * 0.5);
        ctx.font = `bold ${fontSize}px Arial`;
        const centerX = cellX + cellSize / 2;
        const centerY = cellY + cellSize / 2;
        
        if (this.pits.some(p => p.x === x && p.y === y)) {
            ctx.fillStyle = 'black';
            ctx.fillText('🕳️', centerX, centerY + 2);
        }
        
        const wumpusCell = this.wumpus.find(w => w.x === x && w.y === y);
        if (wumpusCell) {
            ctx.fillStyle = colors.wumpus;
            ctx.fillText(wumpusCell.slain ? '💀' : '👹', centerX, centerY + 2);
        }

        if (this.gold.some(g => g.x === x && g.y === y)) {
            ctx.fillStyle = colors.gold;
            ctx.fillText('💰', centerX, centerY + 2);
        }
        
        if (this.swordLocation && this.swordLocation.x === x && this.swordLocation.y === y) {
            if (!this.player.hasSword) {
                ctx.fillStyle = colors.sword;
                ctx.fillText('🗡️', centerX, centerY + 2);
            }
        }
    }

    drawPlayer(colors) {
        const { ctx, player, cellSize } = this;
        const cellX = player.x * cellSize;
        const cellY = player.y * cellSize;
        const centerX = cellX + cellSize / 2;
        const centerY = cellY + cellSize / 2;
        const radius = cellSize * 0.35;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = colors.player;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        const arrowLength = radius * 0.7;
        let endX, endY;
        
        switch (player.dir) {
            case 0: endX = centerX; endY = centerY - arrowLength; break; 
            case 1: endX = centerX + arrowLength; endY = centerY; break; 
            case 2: endX = centerX; endY = centerY + arrowLength; break; 
            case 3: endX = centerX - arrowLength; endY = centerY; break; 
        }

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();

        if (player.hasSword) {
            ctx.font = `${Math.floor(cellSize * 0.4)}px Arial`;
            ctx.fillStyle = colors.sword;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚔️', centerX, centerY + 2);
        }
    }

    drawWumpusTarget(colors) {
        const { ctx, cellSize, wumpusTarget } = this;
        if (!wumpusTarget) return;

        const cellX = wumpusTarget.x * cellSize;
        const cellY = wumpusTarget.y * cellSize;

        ctx.strokeStyle = '#FF00FF';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(cellX + 1, cellY + 1, cellSize - 2, cellSize - 2);
        ctx.setLineDash([]);
    }

    // --- UI/Game End Functions ---

    updateStats() {
        document.getElementById('scoreDisplay').textContent = this.score;
        
        const totalGold = this.goldCollected + this.gold.length; 

        document.getElementById('gold').textContent = `${this.goldCollected}/${totalGold}`;
        document.getElementById('moves').textContent = this.moves;
        
        const swordStatusElement = document.getElementById('swordStatus');
        swordStatusElement.textContent = `Sword: ${this.player.hasSword ? 'Yes ⚔️' : 'No'}`;
        if (this.player.hasSword) {
            swordStatusElement.classList.add('has-sword');
        } else {
            swordStatusElement.classList.remove('has-sword');
        }

        const isDarkMode = document.body.classList.contains('dark-mode');
        document.querySelector('.mode-label').textContent = isDarkMode ? 'Dark Mode' : 'Light Mode';
    }

    winGame() {
        this.gameOver = true;
        this.won = true;
        this.draw();
        
        // Confetti
        this.particles = [];
        for (let i = 0; i < this.confetti.count; i++) {
            this.particles.push(this.createConfettiParticle());
        }
        this.confettiLoop();

        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('winModal').style.display = 'flex';
    }

    endGame(isWon, message) {
        this.gameOver = true;
        this.won = isWon;
        this.draw();
        
        document.getElementById('gameOverScore').textContent = this.score;
        document.getElementById('loseModal').style.display = 'flex';
    }

    toggleFog() {
        this.showFog = !this.showFog;
        this.draw();
    }
    
    // Function to hide the modals, called by the "Close" button in game.html
    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }
    
    // Function to restart the game, called by the "Start New Game" button in game.html
    restart() {
        // 1. Stop AI cleanly if it's running
        if (window.ai) {
            window.ai.stopAI();
        }

        // 2. Stop and clear confetti animation
        this.particles = [];
        if (this.confettiCtx) {
            this.confettiCtx.clearRect(0, 0, this.confettiCanvas.width, this.confettiCanvas.height);
        }

        // 3. Hide all modals
        document.getElementById('winModal').style.display = 'none';
        document.getElementById('loseModal').style.display = 'none';
        
        // 4. Setup new map and reset game state
        this.setupMap(); 
        this.resetState();
        this.draw();
    }
    
    // --- Confetti Functions ---

    resizeConfettiCanvas() {
        if (this.confettiCanvas && this.canvas) {
            this.confettiCanvas.width = this.canvas.width;
            this.confettiCanvas.height = this.canvas.height;
        }
    }

    createConfettiParticle() {
        const { confettiCanvas, confetti } = this;
        const angle = Math.random() * Math.PI; 
        
        return {
            x: confettiCanvas.width / 2, 
            y: confettiCanvas.height / 2,
            vx: Math.cos(angle) * confetti.speed * (Math.random() * 0.5 + 0.5), 
            vy: Math.sin(angle) * confetti.speed * (Math.random() * 0.5 + 0.5) * -1, 
            size: Math.random() * confetti.size + 2,
            color: confetti.colors[this.randomInt(0, confetti.colors.length - 1)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 5,
        };
    }

    confettiLoop() {
        const { confettiCtx, confettiCanvas, particles, confetti } = this;
        
        if (!this.won || !confettiCtx) {
            return;
        }

        confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];

            p.x += p.vx;
            p.y += p.vy;
            p.vy += confetti.gravity;
            p.rotation += p.rotationSpeed;

            confettiCtx.save();
            confettiCtx.translate(p.x, p.y);
            confettiCtx.rotate(p.rotation * Math.PI / 180);
            
            confettiCtx.fillStyle = p.color;
            confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            
            confettiCtx.restore();

            if (p.y > confettiCanvas.height) {
                particles[i] = this.createConfettiParticle();
                particles[i].x = Math.random() * confettiCanvas.width;
                particles[i].y = -confetti.size;
            }
        }
        
        if (this.won) {
            requestAnimationFrame(this.confettiLoop.bind(this));
        }
    }
}