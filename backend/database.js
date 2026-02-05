const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to SQLite database file
const dbPath = path.resolve(__dirname, 'binary_bastion.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Could not connect to database', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Initialize Schema
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        winner_id INTEGER,
        loser_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

module.exports = {
    getUser: (username, callback) => {
        db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
            if (err) {
                callback(err, null);
                return;
            }
            if (row) {
                callback(null, row);
            } else {
                // Create new user
                db.run("INSERT INTO users (username) VALUES (?)", [username], function (err) {
                    if (err) callback(err, null);
                    else {
                        callback(null, { id: this.lastID, username, wins: 0, losses: 0 });
                    }
                });
            }
        });
    },

    updateStats: (userId, isWin, callback) => {
        const column = isWin ? 'wins' : 'losses';
        db.run(`UPDATE users SET ${column} = ${column} + 1 WHERE id = ?`, [userId], (err) => {
            callback(err);
        });
    },

    getAllUsers: (callback) => {
        db.all("SELECT username, wins, losses FROM users ORDER BY wins DESC LIMIT 10", [], (err, rows) => {
            callback(err, rows);
        });
    }
};
