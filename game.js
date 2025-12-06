import { db, ref, set, onValue, update, push, child, get } from './src/firebase.js';

// DOM Elements
const views = {
    lobby: document.getElementById('lobby'),
    game: document.getElementById('game')
};
const inputs = {
    name: document.getElementById('playerName'),
    roomCode: document.getElementById('roomCodeInput')
};
const buttons = {
    create: document.getElementById('createBtn'),
    join: document.getElementById('joinBtn'),
    pour: document.getElementById('pourBtn'),
    restart: document.getElementById('restartBtn'),
    playAgain: document.getElementById('playAgainBtn')
};
const displays = {
    water: document.getElementById('waterLevel'),
    roomCode: document.getElementById('roomCodeDisplay'),
    turn: document.getElementById('turnIndicator'),
    status: document.getElementById('lobbyStatus'),
    gameOver: document.getElementById('gameOverOverlay'),
    winnerText: document.getElementById('winnerText'),
    loserText: document.getElementById('loserText')
};

// Game State
let gameState = {
    player: {
        id: null,
        name: 'Player',
        isHost: false
    },
    room: {
        id: null,
        players: {},
        currentTurn: null,
        waterLevel: 0,
        status: 'waiting', // waiting, playing, ended
        maxWater: 100
    }
};

// --- Game Logic ---

function init() {
    setupEventListeners();
    // Generate a quick random ID for the player for this session
    gameState.player.id = 'p_' + Math.random().toString(36).substr(2, 9);
}

function setupEventListeners() {
    // Lobby
    buttons.create.addEventListener('click', createRoom);
    buttons.join.addEventListener('click', joinRoom);

    // Game
    // Mouse/Touch
    buttons.pour.addEventListener('mousedown', startPouring);
    buttons.pour.addEventListener('mouseup', stopPouring);
    buttons.pour.addEventListener('mousedown', startPouring);
    buttons.pour.addEventListener('mouseup', stopPouring);

    // Global Touch Support (Touch Anywhere)
    document.body.addEventListener('touchstart', (e) => {
        // Only trigger if in game view
        if (views.game.classList.contains('active')) {
            if (e.target.tagName !== 'BUTTON') { // Avoid double triggering if touching a button
                e.preventDefault();
                startPouring();
            }
        }
    }, { passive: false });

    document.body.addEventListener('touchend', (e) => {
        if (views.game.classList.contains('active')) {
            e.preventDefault();
            stopPouring();
        }
    }, { passive: false });

    // Keyboard (Space)
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat && views.game.classList.contains('active')) {
            startPouring();
        }
    });
    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && views.game.classList.contains('active')) {
            stopPouring();
        }
    });

    buttons.restart.addEventListener('click', backToLobby);
    buttons.playAgain.addEventListener('click', resetGame);
}

// --- Multiplayer / Firebase Functions ---

async function createRoom() {
    const name = inputs.name.value.trim() || 'Player 1';
    gameState.player.name = name;
    gameState.player.isHost = true;

    // Generate Room Code (6 chars)
    const roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();

    updateStatus('Creating room...');

    try {
        if (db) {
            const roomRef = ref(db, 'rooms/' + roomCode);

            // Initial Room State
            const initialRoomState = {
                status: 'waiting',
                waterLevel: 0,
                currentTurn: gameState.player.id, // Host starts? or random
                players: {
                    [gameState.player.id]: {
                        name: gameState.player.name,
                        id: gameState.player.id,
                        host: true
                    }
                }
            };

            await set(roomRef, initialRoomState);
            enterGame(roomCode);
        } else {
            // Offline Create
            gameState.room = {
                status: 'waiting',
                waterLevel: 0,
                currentTurn: gameState.player.id,
                players: {
                    [gameState.player.id]: {
                        name: gameState.player.name,
                        id: gameState.player.id,
                        host: true
                    }
                }
            };
            enterGame('OFFLINE');
        }
    } catch (e) {
        console.error(e);
        updateStatus('Error creating room. Check Firebase config.');
    }
}

async function joinRoom() {
    const name = inputs.name.value.trim() || 'Player 2';
    const roomCode = inputs.roomCode.value.trim().toUpperCase();

    if (!roomCode) {
        updateStatus('Enter a room code!');
        return;
    }

    gameState.player.name = name;
    gameState.player.isHost = false;

    updateStatus('Joining...');

    if (!db) {
        updateStatus('Offline Mode: Cannot join rooms.');
        return;
    }

    const roomRef = ref(db, 'rooms/' + roomCode);

    try {
        const snapshot = await get(roomRef);
        if (snapshot.exists()) {
            // Add player to room
            const updates = {};
            updates[`rooms/${roomCode}/players/${gameState.player.id}`] = {
                name: gameState.player.name,
                id: gameState.player.id,
                host: false
            };

            // If room was waiting, maybe start it now?
            // Simple logic: if 2 players, start?
            // For now just add player
            if (db) {
                await update(ref(db), updates);
                enterGame(roomCode);
            } else {
                console.warn("No DB connection");
                // For testing without DB
                enterGame(roomCode);
            }
        } else {
            updateStatus('Room not found!');
        }
    } catch (e) {
        console.error(e);
        updateStatus('Error joining room.');
    }
}

function enterGame(roomCode) {
    gameState.room.id = roomCode;
    views.lobby.classList.add('hidden');
    views.lobby.classList.remove('active');
    views.game.classList.remove('hidden');
    views.game.classList.add('active');

    displays.roomCode.textContent = `Code: ${roomCode}`;

    // Subscribe to room updates
    if (db) {
        const roomRef = ref(db, 'rooms/' + roomCode);
        onValue(roomRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                syncGame(data);
            }
        });
    } else {
        // Local mode simulation?
        console.log("Running in offline mode");
        // We might want to just set local state as 'connected' to self
        syncGame(gameState.room);
    }
}

function syncGame(data) {
    gameState.room = { ...gameState.room, ...data }; // Merge state

    // Update Water UI
    updateWaterUI(gameState.room.waterLevel, gameState.room.turbulence || 0);

    // Update Turn UI
    const isMyTurn = gameState.room.currentTurn === gameState.player.id;
    buttons.pour.disabled = !isMyTurn;

    // Visual styling for button
    if (isMyTurn) {
        displays.turn.textContent = "Your Turn!";
        displays.turn.classList.add('active-player');
        buttons.pour.classList.remove('disabled');
        buttons.pour.textContent = "HOLD TO POUR";
    } else {
        // Find who's turn it is
        const currentId = gameState.room.currentTurn;
        const currentPlayerName = gameState.room.players[currentId] ? gameState.room.players[currentId].name : 'Opponent';
        displays.turn.textContent = `${currentPlayerName}'s Turn`;
        displays.turn.classList.remove('active-player');
        buttons.pour.classList.add('disabled');
        buttons.pour.textContent = "WAITING...";
    }

    // Check Game Over
    if (data.status === 'ended') {
        showGameOver(data.loser);
    } else if (data.status === 'playing' || data.status === 'waiting') {
        // Did we just restart?
        displays.gameOver.classList.add('hidden');
    }
}

// --- Gameplay Mechanics ---

let pourInterval = null;
const FILL_RATE = 0.5; // % per tick
const TICK_RATE = 20; // ms
const MAX_POUR_PER_TURN = 20; // 20% limit per turn
let turnStartWaterLevel = 0; // Track start level

function startPouring() {
    if (gameState.room.currentTurn !== gameState.player.id) return;
    if (gameState.room.status === 'ended') return;
    if (pourInterval) return; // Already pouring

    // Track start level when we START pouring (only set once per turn really, but this works if we don't allow re-grab)
    // Actually better to set this when turn starts. 
    // But since we only have start/stop events, let's check relative to what current 'server' state says?
    // Simplified: When you click, we see how much you've poured so far based on memory?
    // Better: Just track it in a variable 'pouredThisTurn' that resets on turn change.

    // Instead of complex sync: Let's assume you can hold it multiple times in one turn? 
    // User requested "each turn players can fill %10". 
    // Let's enforce: Once you stop, you LOSE your turn? Or you can pour multiple times until 20%?
    // "Pouring mechanics (hold to pour)" implies continuous.
    // Let's do: You can pour until 20% limit is hit, OR you release.
    // If you release, turn ends? Convention is usually yes for this game.
    // Let's implement: Release = End Turn.

    // So limit is simple: stop if poured > 20% in this single hold.
    turnStartWaterLevel = gameState.room.waterLevel;
    let currentTurbulence = 0;
    let ticksPouring = 0;

    buttons.pour.classList.add('active');
    document.getElementById('pourStream').classList.remove('hidden');

    pourInterval = setInterval(() => {
        ticksPouring++;

        // --- Physics 2.0: Variable Flow & Turbulence ---
        // Flow Rate increases slightly over time (0.2 -> 0.8)
        const flowMultiplier = Math.min(2.5, 1 + (ticksPouring / 40));
        const currentFillRate = FILL_RATE * flowMultiplier;

        // Turbulence increases with hold time (0 -> 25%)
        // Rapid taps keep it low. Long holds spike it massive.
        if (currentTurbulence < 25) {
            currentTurbulence += 0.8;
        }

        // Update Game State
        gameState.room.turbulence = currentTurbulence;

        let newLevel = gameState.room.waterLevel + currentFillRate;
        let pouredAmount = newLevel - turnStartWaterLevel;

        // Check Pour Limit
        if (pouredAmount >= MAX_POUR_PER_TURN) {
            stopPouring();
            return;
        }

        // --- Spill Logic ---
        // Spill if (Level + Turbulence) > 100
        // This forces players to pour slowly (tap) when near the top.
        const effectiveLevel = newLevel + currentTurbulence;

        // Update UI
        updateWaterUI(newLevel, currentTurbulence);
        gameState.room.waterLevel = newLevel;

        // Check Overflow
        if (effectiveLevel >= 100) {
            // It spilled due to wave!
            triggerGameOver();
        } else {
            safeUpdate(`rooms/${gameState.room.id}`, {
                waterLevel: newLevel,
                turbulence: currentTurbulence
            });
        }

    }, TICK_RATE);
}

function stopPouring() {
    if (!pourInterval) return;

    clearInterval(pourInterval);
    pourInterval = null;
    buttons.pour.classList.remove('active');
    document.getElementById('pourStream').classList.add('hidden');

    // End turn
    if (gameState.room.status !== 'ended') {
        // Reset turbulence on turn end
        safeUpdate(`rooms/${gameState.room.id}`, {
            turbulence: 0
        });
        passTurn();
    }
}

function passTurn() {
    // Determine next player
    const playerIds = Object.keys(gameState.room.players);
    const currentIndex = playerIds.indexOf(gameState.player.id);
    const nextIndex = (currentIndex + 1) % playerIds.length;
    const nextPlayerId = playerIds[nextIndex];

    safeUpdate(`rooms/${gameState.room.id}`, {
        currentTurn: nextPlayerId,
        waterLevel: gameState.room.waterLevel // Ensure final level is synced
    });
}

function triggerGameOver() {
    clearInterval(pourInterval);
    pourInterval = null;
    document.getElementById('pourStream').classList.add('hidden');

    safeUpdate(`rooms/${gameState.room.id}`, {
        status: 'ended',
        loser: gameState.player.id,
        waterLevel: 100
    });
}

function updateWaterUI(level, turbulence = 0) {
    displays.water.style.height = `${Math.min(level, 100)}%`;

    // Visual Wave Effect in CSS
    // We pass turbulence to CSS variable
    // Visual Wave Effect in CSS
    // We pass turbulence to CSS variable
    // Multiplier for visual drama!
    const visualWave = turbulence * 1.5;
    document.documentElement.style.setProperty('--wave-height', `${visualWave}%`);

    // Update stream width based on flow? (Simulated by just active class for now)

    if (level > 80) {
        displays.water.style.background = '#f59e0b'; // warning color
    }
    // Note: Spill logic is handled in game loop with effectiveLevel
    if (level >= 100) {
        displays.water.style.background = '#ef4444'; // danger color
        document.querySelector('.glass').classList.add('spilling');
        document.getElementById('spillEffect').classList.remove('hidden');
    } else {
        displays.water.style.background = 'var(--water-color)';
        document.querySelector('.glass').classList.remove('spilling');
        document.getElementById('spillEffect').classList.add('hidden');
    }
}

function showGameOver(loserId) {
    displays.gameOver.classList.remove('hidden');

    // Only host can reset
    if (gameState.player.isHost) {
        buttons.playAgain.classList.remove('hidden');
    } else {
        buttons.playAgain.classList.add('hidden'); // Hide for non-host? Or let anyone reset?
        // Let's let anyone reset for simplicity in this friendly game
        buttons.playAgain.classList.remove('hidden');
    }

    const loserName = gameState.room.players[loserId] ? gameState.room.players[loserId].name : 'Unknown';

    if (loserId === gameState.player.id) {
        displays.winnerText.textContent = "You Lost!";
        displays.loserText.textContent = "You spilled the water!";
    } else {
        displays.winnerText.textContent = "You Won!";
        displays.loserText.textContent = `${loserName} spilled the water!`;
    }
}

function resetGame() {
    console.log("Resetting game...");
    // Reset room state
    safeUpdate(`rooms/${gameState.room.id}`, {
        status: 'playing',
        waterLevel: 0,
        loser: null
    });

    // UI Local Reset (listener will catch it but good to force hide)
    displays.gameOver.classList.add('hidden');
    updateWaterUI(0);
}

function backToLobby() {
    location.reload(); // Simple reset
}

function updateStatus(msg) {
    displays.status.textContent = msg;
    setTimeout(() => displays.status.textContent = '', 3000);
}

// Function to safely interact with DB
function safeUpdate(path, data) {
    if (db) {
        update(ref(db, path), data);
    } else {
        console.warn('Firebase not connected, cannot save:', path, data);
        // Local simulation for offline play again
        Object.assign(gameState.room, data);
        if (data.status === 'ended') showGameOver(data.loser);
        if (data.status === 'playing') {
            displays.gameOver.classList.add('hidden');
            updateWaterUI(0);
        }
    }
}

// Initialize
init();

