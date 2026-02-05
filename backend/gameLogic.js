const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

const UNIT_TYPES = {
    GRUNT: { cost: 20, hp: 50, damage: 10, speed: 2.5, range: 30, color: 'blue', radius: 10, cooldown: 1000 },
    TANK: { cost: 60, hp: 400, damage: 15, speed: 1.5, range: 30, color: 'purple', radius: 15, cooldown: 3000 },
    RANGER: { cost: 40, hp: 40, damage: 15, speed: 2.5, range: 120, color: 'green', radius: 8, cooldown: 2000 }
};

const TOWER_STATS = {
    PRINCESS: { hp: 350, damage: 10, range: 150, fireRate: 800 },
    KING: { hp: 1000, damage: 15, range: 150, fireRate: 1000 }
};

module.exports = {
    gameState: {
        players: { p1: null, p2: null },
        playerData: {},
        units: [],
        crownTowers: [],
        projectiles: [], // { id, startX, startY, endX, endY, life, color }
        winner: null
    },

    reset: function () {
        this.gameState.players = { p1: null, p2: null };
        this.gameState.playerData = {};
        this.gameState.units = [];
        this.gameState.crownTowers = [];
        this.gameState.projectiles = [];
        this.gameState.winner = null;
    },

    addPlayer: function (socketId) {
        if (!this.gameState.players.p1) {
            this.gameState.players.p1 = socketId;
            this.initPlayer(socketId, 'p1');
            return 'p1';
        } else if (!this.gameState.players.p2) {
            this.gameState.players.p2 = socketId;
            this.initPlayer(socketId, 'p2');
            return 'p2';
        }
        return 'spectator';
    },

    initPlayer: function (id, role) {
        this.gameState.playerData[id] = {
            role,
            gold: 100,
            maxGold: 100,
            lastIncome: Date.now()
        };

        const xBase = role === 'p1' ? 80 : 720;
        const xFront = role === 'p1' ? 180 : 620;

        // King Tower (Center)
        this.gameState.crownTowers.push({
            id: `king-${role}`,
            owner: role,
            type: 'KING',
            x: xBase,
            y: 300,
            hp: TOWER_STATS.KING.hp,
            maxHp: TOWER_STATS.KING.hp,
            range: TOWER_STATS.KING.range,
            damage: TOWER_STATS.KING.damage,
            fireRate: TOWER_STATS.KING.fireRate,
            lastShot: 0
        });

        // Princess Towers (Top/Bottom)
        [100, 500].forEach((y, i) => {
            this.gameState.crownTowers.push({
                id: `princess-${role}-${i}`,
                owner: role,
                type: 'PRINCESS',
                x: xFront,
                y: y,
                hp: TOWER_STATS.PRINCESS.hp,
                maxHp: TOWER_STATS.PRINCESS.hp,
                range: TOWER_STATS.PRINCESS.range,
                damage: TOWER_STATS.PRINCESS.damage,
                fireRate: TOWER_STATS.PRINCESS.fireRate,
                lastShot: 0
            });
        });
    },

    removePlayer: function (socketId) {
        const p1 = this.gameState.players.p1;
        const p2 = this.gameState.players.p2;

        // Remove logic: keep towers? No, usually in 1v1 if P disconnects, reset?
        // Let's keep data for now to prevent crashes if reconnect.
        // Actually, if a player leaves, we probably should clear that role so they can rejoin.
        if (p1 === socketId) {
            this.gameState.players.p1 = null;
        }
        if (p2 === socketId) {
            this.gameState.players.p2 = null;
        }
        delete this.gameState.playerData[socketId];
    },

    spawnUnit: function (socketId, type, x, y) {
        const player = this.gameState.playerData[socketId];
        if (!player || this.gameState.winner) return;

        const stats = UNIT_TYPES[type];
        if (!stats) return;

        if (player.gold < stats.cost) return;

        // Boundaries
        if (player.role === 'p1' && x > GAME_WIDTH / 2 - 20) return;
        if (player.role === 'p2' && x < GAME_WIDTH / 2 + 20) return;

        player.gold -= stats.cost;

        this.gameState.units.push({
            id: Date.now() + Math.random(),
            owner: player.role,
            type: type,
            x: x,
            y: y,
            hp: stats.hp,
            maxHp: stats.hp,
            speed: player.role === 'p1' ? stats.speed : -stats.speed,
            damage: stats.damage,
            range: stats.range,
            color: stats.color,
            radius: stats.radius,
            cooldown: stats.cooldown || 1000,
            lastAttack: 0,
            targetId: null
        });
    },

    update: function () {
        if (this.gameState.winner) return;
        const now = Date.now();

        // 0. Update Projectiles
        for (let i = this.gameState.projectiles.length - 1; i >= 0; i--) {
            const p = this.gameState.projectiles[i];
            p.life -= 20; // 20ms tick
            if (p.life <= 0) this.gameState.projectiles.splice(i, 1);
        }

        // 1. Passive Income
        Object.values(this.gameState.playerData).forEach(p => {
            if (now - p.lastIncome >= 1000) {
                if (p.gold < p.maxGold) p.gold += 2;
                p.lastIncome = now;
            }
        });

        // 2. Unit Logic
        this.gameState.units.forEach(unit => {
            let target = null;
            let minDist = Infinity;

            // A. Search for Enemy Units (Agro Range = 200)
            this.gameState.units.forEach(enemy => {
                if (enemy.owner !== unit.owner) {
                    const d = Math.hypot(enemy.x - unit.x, enemy.y - unit.y);
                    if (d < 200 && d < minDist) {
                        minDist = d;
                        target = enemy;
                    }
                }
            });

            // B. If no unit, Find Closest Tower (Global Range)
            if (!target) {
                this.gameState.crownTowers.forEach(tower => {
                    if (tower.owner !== unit.owner && tower.hp > 0) {
                        const d = Math.hypot(tower.x - unit.x, tower.y - unit.y);
                        if (d < minDist) {
                            minDist = d;
                            target = tower;
                        }
                    }
                });
            }

            // C. Act
            if (target) {
                const dist = Math.hypot(target.x - unit.x, target.y - unit.y);

                // --- TARGETING FIX ---
                // Increase radius checks for bigger targets (Towers)
                let targetRadius = target.radius || 10;
                if (target.type === 'KING') targetRadius = 40;
                else if (target.type === 'PRINCESS') targetRadius = 30;

                const attackRange = unit.range + targetRadius;

                if (dist <= attackRange) {
                    // Attack
                    if (now - unit.lastAttack > unit.cooldown) {
                        target.hp -= unit.damage;
                        unit.lastAttack = now;
                        // Visual
                        this.gameState.projectiles.push({
                            id: Math.random(),
                            startX: unit.x, startY: unit.y,
                            endX: target.x, endY: target.y,
                            life: 100, color: 'white'
                        });
                    }
                } else {
                    // Move
                    const angle = Math.atan2(target.y - unit.y, target.x - unit.x);
                    unit.x += Math.cos(angle) * Math.abs(unit.speed);
                    unit.y += Math.sin(angle) * Math.abs(unit.speed);
                }
            } else {
                // Default Forward
                const forward = unit.owner === 'p1' ? 1 : -1;
                unit.x += forward * Math.abs(unit.speed);
            }
        });

        // 3. Tower Logic
        this.gameState.crownTowers.forEach(tower => {
            if (tower.hp <= 0) return;

            if (now - tower.lastShot > tower.fireRate) {
                // Find closest unit
                let target = null;
                let minDist = tower.range;

                this.gameState.units.forEach(u => {
                    if (u.owner !== tower.owner) {
                        const d = Math.hypot(u.x - tower.x, u.y - tower.y);
                        if (d <= minDist) {
                            minDist = d;
                            target = u;
                        }
                    }
                });

                if (target) {
                    target.hp -= tower.damage;
                    tower.lastShot = now;
                    // Visual
                    this.gameState.projectiles.push({
                        id: Math.random(),
                        startX: tower.x, startY: tower.y,
                        endX: target.x, endY: target.y,
                        life: 200, color: tower.owner === 'p1' ? '#60a5fa' : '#fb923c'
                    });
                }
            }
        });

        // 4. Cleanup
        for (let i = this.gameState.units.length - 1; i >= 0; i--) {
            if (this.gameState.units[i].hp <= 0) {
                this.gameState.units.splice(i, 1);
            }
        }

        let p1Alive = false;
        let p2Alive = false;
        this.gameState.crownTowers.forEach(tower => {
            if (tower.hp > 0 && tower.type === 'KING') {
                if (tower.owner === 'p1') p1Alive = true;
                if (tower.owner === 'p2') p2Alive = true;
            }
        });

        if (!p1Alive && this.gameState.players.p1) this.gameState.winner = 'Player 2';
        else if (!p2Alive && this.gameState.players.p2) this.gameState.winner = 'Player 1';
    }
};
