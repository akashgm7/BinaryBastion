const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const gameLogic = require('./gameLogic');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// Serve Static Frontend (Production)
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Fix "Cannot GET /" error -> Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// -- API ROUTES --

// Login / Register
// POST /api/login { username: "Neo" }
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).send('Username required');

    db.getUser(username, (err, user) => {
        if (err) return res.status(500).send('Database error');
        res.json(user);
    });
});

// Record Result
// POST /api/report-result { userId, result: 'win'|'loss' }
app.post('/api/report-result', (req, res) => {
    const { userId, result } = req.body;
    if (!userId || !result) return res.status(400).send('Missing data');

    db.updateStats(userId, result === 'win', (err) => {
        if (err) return res.status(500).send('Database error');

        // Return updated list or user stats? Just success for now.
        res.json({ success: true });
    });
});

// Get Leaderboard
app.get('/api/leaderboard', (req, res) => {
    db.getAllUsers((err, rows) => {
        if (err) return res.status(500).send('Database error');
        res.json(rows);
    });
});


// Reset Endpoint for Debugging
app.post('/reset', (req, res) => {
    console.log("Manual Game Reset Triggered");
    gameLogic.reset();
    io.emit('gameState', gameLogic.gameState);
    res.send('Game Reset');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;
const TICK_RATE = 20; // Ticks per second
const TICK_INTERVAL = 1000 / TICK_RATE;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Assign Role
    const role = gameLogic.addPlayer(socket.id);
    socket.emit('init', { role: role, id: socket.id });

    // Send initial state immediately
    socket.emit('gameState', gameLogic.gameState);

    socket.on('spawn_unit', (data) => {
        // data: { type, x, y }
        gameLogic.spawnUnit(socket.id, data.type, data.x, data.y);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        gameLogic.removePlayer(socket.id);
    });
});

// Game Loop
setInterval(() => {
    gameLogic.update();
    io.emit('gameState', gameLogic.gameState);
}, TICK_INTERVAL);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
