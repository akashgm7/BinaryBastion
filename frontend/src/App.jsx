import { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

// Auto-detect URL: If running locally (port 5173), use localhost:3000. 
// If deployed (same origin), use relative path.
const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '/';
const socket = io(SOCKET_URL);

// Card Config
const CARDS = [
  { id: 'GRUNT', name: 'CYBER GRUNT', cost: 20, color: 'bg-blue-600', icon: '🤖' },
  { id: 'RANGER', name: 'LASER SNIPER', cost: 40, color: 'bg-green-600', icon: '🔫' },
  { id: 'TANK', name: 'HEAVY MECH', cost: 60, color: 'bg-purple-600', icon: '🛡️' }
];

function App() {
  const [screen, setScreen] = useState('login');
  const [user, setUser] = useState(null);
  const [usernameInput, setUsernameInput] = useState('');

  const [isConnected, setIsConnected] = useState(socket.connected);
  const [gameState, setGameState] = useState(null);
  const [myRole, setMyRole] = useState(null);

  const [selectedCard, setSelectedCard] = useState(null);

  const canvasRef = useRef(null);
  const gameStateRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('init', (data) => setMyRole(data.role));
    socket.on('gameState', (state) => {
      setGameState(state);
      gameStateRef.current = state;
    });
    return () => socket.removeAllListeners();
  }, []);

  useEffect(() => {
    if (gameState?.winner && screen === 'game') {
      const winnerName = gameState.winner;
      setScreen('results');

      if (user && user.id) {
        let result = 'spectator';
        if (myRole === 'p1') result = winnerName === 'Player 1' ? 'win' : 'loss';
        if (myRole === 'p2') result = winnerName === 'Player 2' ? 'win' : 'loss';

        if (result !== 'spectator') {
          fetch('http://localhost:3000/api/report-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, result })
          }).catch(e => console.error(e));
        }
      }
    }
  }, [gameState?.winner]);

  const login = (name) => {
    if (!name) return;
    fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name })
    })
      .then(r => r.json())
      .then(u => {
        setUser(u);
        setScreen('game');
      })
      .catch(e => {
        console.error(e);
        alert("Server Error. Is Backend Running?");
      });
  };

  const handleCanvasClick = (e) => {
    if (!canvasRef.current || !selectedCard) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    socket.emit('spawn_unit', { type: selectedCard.id, x, y });
    setSelectedCard(null);
  };

  // Renderer
  useEffect(() => {
    if (screen !== 'game') return;

    const canvas = canvasRef.current;
    if (!canvas) return; // Safety

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // Clear
      ctx.fillStyle = '#111827'; // Darker blue-gray bg
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 1;
      for (let i = 0; i < 800; i += 50) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 600); ctx.stroke(); }

      // River / Divider
      ctx.fillStyle = '#064e3b';
      ctx.fillRect(390, 0, 20, 600);

      const state = gameStateRef.current;
      if (state) {
        // Draw Crown Towers
        if (state.crownTowers) {
          state.crownTowers.forEach(t => {
            if (t.hp <= 0) return;

            const isP1 = t.owner === 'p1';
            ctx.fillStyle = isP1 ? '#3b82f6' : '#f97316'; // Blue / Orange
            const size = t.type === 'KING' ? 60 : 40;

            // Base
            ctx.fillRect(t.x - size / 2, t.y - size / 2, size, size);

            // Turret
            ctx.fillStyle = isP1 ? '#60a5fa' : '#fb923c';
            ctx.fillRect(t.x - size / 3, t.y - size / 3, size / 1.5, size / 1.5);

            // HP Bar
            const pct = t.hp / t.maxHp;
            ctx.fillStyle = 'red'; ctx.fillRect(t.x - 20, t.y - size / 2 - 12, 40, 6);
            ctx.fillStyle = '#22c55e'; ctx.fillRect(t.x - 20, t.y - size / 2 - 12, 40 * pct, 6);
          });
        }

        // Draw Units with Shapes
        if (state.units) {
          state.units.forEach(u => {
            // Bounce Animation
            const bounce = Math.sin(Date.now() / 150) * 2;
            ctx.save();
            ctx.translate(u.x, u.y + bounce);

            if (u.type === 'TANK') {
              // Tank Body
              ctx.fillStyle = '#581c87'; // Dark Purple
              ctx.fillRect(-12, -12, 24, 24);
              // Tracks
              ctx.fillStyle = '#1f2937';
              ctx.fillRect(-14, -10, 4, 20); // Left track
              ctx.fillRect(10, -10, 4, 20); // Right track
              // Turret
              ctx.fillStyle = '#a855f7';
              ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
              // Barrel
              ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 4;
              ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(u.speed > 0 ? 15 : -15, 0); ctx.stroke();

            } else if (u.type === 'RANGER') {
              // Triangle
              ctx.fillStyle = '#16a34a'; // Green
              ctx.beginPath();
              if (u.speed > 0) { // Facing Right
                ctx.moveTo(8, 0); ctx.lineTo(-8, -8); ctx.lineTo(-8, 8);
              } else {
                ctx.moveTo(-8, 0); ctx.lineTo(8, -8); ctx.lineTo(8, 8);
              }
              ctx.fill();
              // Hood
              ctx.fillStyle = '#22c55e';
              ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();

            } else {
              // GRUNT (Robot)
              ctx.fillStyle = '#2563eb'; // Blue
              ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
              // Eyes
              ctx.fillStyle = 'cyan';
              ctx.fillRect(u.speed > 0 ? 2 : -4, -2, 2, 2);
            }

            ctx.restore();

            // HP Bar
            const pct = u.hp / u.maxHp;
            ctx.fillStyle = 'red'; ctx.fillRect(u.x - 10, u.y - 18, 20, 4);
            ctx.fillStyle = '#4ade80'; ctx.fillRect(u.x - 10, u.y - 18, 20 * pct, 4);
          });
        }

        // Draw Projectiles
        if (state.projectiles) {
          state.projectiles.forEach(p => {
            ctx.strokeStyle = p.color || 'yellow';
            ctx.lineWidth = 2;
            ctx.globalAlpha = p.life / 100; // Fade out
            ctx.beginPath();
            ctx.moveTo(p.startX, p.startY);
            ctx.lineTo(p.endX, p.endY);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          });
        }
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationRef.current);
  }, [screen]);


  if (screen === 'login') {
    return (
      <div className="min-h-screen bg-gray-900 text-green-500 flex flex-col items-center justify-center font-mono p-4">
        <h1 className="text-4xl mb-4 font-bold border-b border-green-500 pb-4">BINARY BASTION PROTOCOL</h1>

        <div className="border border-green-800 bg-black p-4 mb-8 text-center rounded w-full max-w-md">
          <div className="text-sm text-gray-400">SERVER STATUS</div>
          <div className={`text-xl font-bold ${isConnected ? 'text-green-400' : 'text-red-500'}`}>
            {isConnected ? 'ONLINE' : 'DISCONNECTED'}
          </div>
          <div className="mt-4 text-sm text-gray-400">ASSIGNED ROLE</div>
          <div className="text-2xl font-bold text-white tracking-widest uppercase">
            {myRole || 'Scanning...'}
          </div>
        </div>

        <input
          value={usernameInput}
          onChange={e => setUsernameInput(e.target.value)}
          placeholder="ENTER AGENT NAME"
          className="bg-gray-800 border-2 border-green-600 p-4 mb-4 text-white text-center text-xl w-full max-w-md focus:outline-none focus:border-green-400"
        />
        <button
          onClick={() => login(usernameInput)}
          className="bg-green-600 hover:bg-green-500 text-black px-8 py-4 font-bold text-xl rounded w-full max-w-md"
        >
          INITIALIZE LINK
        </button>
      </div>
    )
  }

  if (screen === 'results') {
    return (
      <div className="min-h-screen bg-black text-green-500 flex flex-col items-center justify-center font-mono">
        <h1 className="text-6xl font-bold mb-4 animate-bounce text-center">
          {gameState?.winner}<br />VICTORY
        </h1>
        <div className="text-2xl mb-8 text-white">
          MISSION COMPLETE
        </div>
        <button
          onClick={() => { fetch('http://localhost:3000/reset', { method: 'POST' }).then(() => window.location.reload()) }}
          className="bg-red-600 hover:bg-red-500 text-white px-8 py-4 font-bold rounded shadow-[0_0_20px_red]"
        >
          RESET SIMULATION
        </button>
      </div>
    )
  }

  const myData = gameState?.playerData?.[socket.id];

  return (
    <div className="min-h-screen bg-gray-950 text-green-500 font-mono flex flex-col items-center">
      {/* TOP BAR */}
      <div className="w-full max-w-[800px] flex justify-between p-2 border-b border-green-600 bg-gray-900">
        <div className="flex flex-col">
          <span className="font-bold text-white">{user?.username}</span>
          <span className="text-xs text-green-400">{myRole?.toUpperCase()} COMMANDER</span>
        </div>
        <div className="text-right">
          <span className="text-yellow-400 text-2xl font-bold drop-shadow-md">
            ${Math.floor(myData?.gold || 0)}
          </span>
          <span className="text-xs text-gray-400 block">+5/sec</span>
        </div>
      </div>

      {/* GAME VIEW */}
      <div className="relative mt-2 border-2 border-green-800 shadow-[0_0_30px_#00ff0022]">
        <canvas ref={canvasRef} width={800} height={600} onClick={handleCanvasClick}
          className={`bg-gray-900 ${selectedCard ? 'cursor-crosshair' : 'cursor-default'}`}
        />
        {selectedCard && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-yellow-500/90 border-2 border-white px-6 py-3 text-black font-bold animate-pulse pointer-events-none text-xl rounded-lg shadow-xl">
            CLICK MAP TO DEPLOY<br />
            <span className="text-sm block text-center">{selectedCard.name}</span>
          </div>
        )}
      </div>

      {/* CARD DECK */}
      <div className="w-[800px] mt-2 flex gap-2 h-32">
        {CARDS.map(card => {
          const canAfford = myData && myData.gold >= card.cost;
          return (
            <button
              key={card.id}
              onClick={() => setSelectedCard(card)}
              disabled={!canAfford}
              className={`flex-1 border-2 rounded-lg p-2 transition-all relative overflow-hidden group
                            ${selectedCard?.id === card.id ? 'border-yellow-400 bg-gray-800 scale-105 z-10' : 'border-gray-700 bg-gray-900'}
                            ${!canAfford ? 'opacity-40 grayscale cursor-not-allowed' : 'hover:bg-gray-800'}
                        `}
            >
              {/* Cost Badge */}
              <div className={`absolute top-1 right-1 font-bold text-sm px-2 rounded ${canAfford ? 'bg-yellow-500 text-black' : 'bg-red-900 text-red-300'}`}>
                ${card.cost}
              </div>

              <div className="text-3xl mt-2 mb-1 group-hover:scale-110 transition-transform">{card.icon}</div>
              <div className={`font-bold text-xs uppercase ${selectedCard?.id === card.id ? 'text-yellow-400' : 'text-gray-400'}`}>
                {card.name}
              </div>
            </button>
          );
        })}

        <button
          onClick={() => { fetch('http://localhost:3000/reset', { method: 'POST' }).then(() => window.location.reload()) }}
          className="w-20 border border-red-900 bg-red-950/30 text-red-600 text-[10px] font-bold hover:bg-red-900 hover:text-white transition-colors flex items-center justify-center p-1"
        >
          FORCE<br />RESET
        </button>
      </div>
    </div>
  );
}

export default App;
