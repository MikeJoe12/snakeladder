const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static(path.join(__dirname, 'public')));

// Game state
let players = [];
let currentPlayerIndex = 0;
let gameBoard = null;
const playerSessions = new Map();
let gameStarted = false;

io.on('connection', (socket) => {
	console.log('A client connected:', socket.id);

    // Handle game board connection
    socket.on('registerGameBoard', () => {
        gameBoard = socket;
    });

    // Handle start game
    socket.on('startGame', () => {
        gameStarted = true;
        io.emit('gameStarted');
    });

    // Handle player login
    socket.on('login', (username) => {
        if (!gameStarted) {
            socket.emit('loginError', 'The game has not started yet.');
            return;
        }


        let existingPlayerIndex = players.findIndex(p => p.username === username);
        let player;

        if (existingPlayerIndex !== -1) {
            // 🔥 Player is reconnecting, so update their socket ID
            player = players[existingPlayerIndex];
            player.id = socket.id;
            playerSessions.set(username, player);

            // 🔥 Keep their turn if they had it
            if (existingPlayerIndex === currentPlayerIndex) {
                socket.emit('restoreTurn', { currentPlayer: username });
            }

        } else if (playerSessions.has(username)) {
            // 🔥 Player is reconnecting after being removed from the list
            player = playerSessions.get(username);
            player.id = socket.id;

            // ✅ Insert them back into the **same position** they were before  
            players.splice(player.originalIndex, 0, player);

            // ✅ Ensure turn remains correct
            if (player.originalIndex === currentPlayerIndex) {
                socket.emit('restoreTurn', { currentPlayer: username });
            }

        } else {
            // 🔥 New player joining
            player = { id: socket.id, username, position: 1, originalIndex: players.length };
            players.push(player);
            playerSessions.set(username, player);
        }

        // 🔄 Ensure players list has **only unique usernames**
        players = [...new Map(players.map(p => [p.username, p])).values()];

        // Send updated game state to reconnecting player
        socket.emit('loginSuccess', {
            players: players,
            currentPlayer: players[currentPlayerIndex]?.username || null
        });

        // Broadcast updated player list
        io.emit('playerJoined', {
            players: players,
            currentPlayer: players[currentPlayerIndex]?.username || null
        });
    });

    // Handle dice roll
    socket.on('rollDice', () => {
        if (players.length === 0) return;
        const currentPlayer = players[currentPlayerIndex];

        if (!currentPlayer || currentPlayer.id !== socket.id) {
            return;
        }
console.log('Dice roll received from:', socket.id);
        const roll = Math.floor(Math.random() * 6) + 1;

        io.emit('diceRolled', {
            username: currentPlayer.username,
            roll: roll
        });

        if (gameBoard) {
            gameBoard.emit('playerRolled', {
                roll: roll,
                playerId: currentPlayerIndex + 1,
                username: currentPlayer.username
            });
        }

        // Move to next player's turn
        currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
        
        io.emit('nextTurn', {
            currentPlayer: players[currentPlayerIndex]?.username || null
        });

    });

    // Handle reset game
    socket.on('resetGame', () => {
        players = [];
        playerSessions.clear();
        currentPlayerIndex = 0;
        gameStarted = false;
        io.emit('forceLogout');

        if (gameBoard) {
            gameBoard.emit('gameReset');
        }

        setTimeout(() => {
            io.emit('gameStarted');
        }, 1000);
    });
	
// Handle restart game
socket.on('restartGame', () => {
    // Reset the game state without clearing players
    currentPlayerIndex = 0;
    players.forEach(player => player.position = 1);

    // Notify all clients to restart the game
    io.emit('gameRestarted');
    io.emit('nextTurn', {
        currentPlayer: players[currentPlayerIndex]?.username || null
    });

});	

    // Handle player disconnect
    socket.on('disconnect', () => {
        const playerIndex = players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const player = players[playerIndex];

            // ✅ Store their last position so we can restore them
            player.originalIndex = playerIndex;

            // 🔥 Ensure the player keeps their turn if they refresh
            if (playerIndex === currentPlayerIndex) {

            }

            // ✅ Store player info for reconnecting later
            playerSessions.set(player.username, player);

            // Remove player from active list
            players.splice(playerIndex, 1);

            if (players.length > 0) {
                currentPlayerIndex = currentPlayerIndex % players.length;
            }

            io.emit('playerLeft', {
                players: players,
                currentPlayer: players[currentPlayerIndex]?.username || null
            });

        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
