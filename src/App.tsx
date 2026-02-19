import { useEffect, useRef, useState } from 'react';
import './App.css';

interface Entity { x: number; y: number; radius: number; color: string; }
interface Projectile extends Entity { velocity: { x: number; y: number }; pierce: number; }
interface Enemy extends Entity { hp: number; maxHp: number; type: 'basic' | 'fast' | 'tank'; speedMult: number; }
interface Drop extends Entity { type: 'shotgun' | 'pierce'; }

const LEVEL_THRESHOLDS = [1500, 4000, 8000];

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  // 遊戲狀態 Refs
  const projectiles = useRef<Projectile[]>([]);
  const enemies = useRef<Enemy[]>([]);
  const drops = useRef<Drop[]>([]);
  const weaponType = useRef<'default' | 'shotgun' | 'pierce'>('default');
  const animationId = useRef<number>();
  
  // 玩家位置與控制
  const playerPos = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const isDragging = useRef(false);
  const lastShootTime = useRef(0);

  // 音效系統 Ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  // 初始化音效系統
  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    setGameStarted(true);
  };

  // 播放合成音效
  const playSound = (type: string) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const t = ctx.currentTime;

    const createOsc = (type: OscillatorType, freq: number, endFreq: number, duration: number, vol: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + duration);
    };

    const createNoise = (duration: number, vol: number) => {
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
      noise.connect(gain);
      gain.connect(ctx.destination);
      noise.start(t);
    };

    switch (type) {
      case 'shoot_default': createOsc('square', 400, 100, 0.1, 0.05); break;
      case 'shoot_shotgun': createNoise(0.1, 0.1); createOsc('sawtooth', 300, 50, 0.1, 0.05); break;
      case 'shoot_pierce': createOsc('sine', 800, 200, 0.3, 0.1); break;
      case 'hit': 
        createOsc('square', 150, 20, 0.1, 0.1); // 低頻打擊感
        createNoise(0.05, 0.1); // 碎裂聲
        break;
      case 'explode': 
        createOsc('sawtooth', 100, 10, 0.3, 0.1);
        createNoise(0.3, 0.2); // 大爆炸
        break;
      case 'level_up':
        [329.63, 440, 554.37, 659.25].forEach((freq, i) => { // 酷炫琶音
          setTimeout(() => createOsc('sine', freq, freq, 0.2, 0.1), i * 100);
        });
        break;
      case 'win':
        [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => { // 勝利和弦
          setTimeout(() => createOsc('square', freq, freq, 0.15, 0.1), i * 80);
        });
        break;
    }
  };

  // 滑鼠/觸控事件處理（拖動移動）
  const handlePointerDown = (e: React.PointerEvent) => {
    initAudio();
    isDragging.current = true;
    playerPos.current = { x: e.clientX, y: e.clientY };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging.current) {
      playerPos.current = { x: e.clientX, y: e.clientY };
    }
  };
  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const spawnEnemy = (canvas: HTMLCanvasElement) => {
    if (isTransitioning || gameOver || !gameStarted) return;
    
    const rand = Math.random();
    let type: 'basic' | 'fast' | 'tank' = 'basic';
    let radius = 15, color = '#ff3366', speedMult = 1, hp = 1;

    if (level >= 2 && rand < 0.3) { type = 'fast'; radius = 10; color = '#00ffff'; speedMult = 2.5; hp = 1; }
    else if (level >= 3 && rand > 0.8) { type = 'tank'; radius = 30; color = '#cc00ff'; speedMult = 0.5; hp = 4; }
    else { type = 'basic'; radius = 15; color = '#ff3366'; speedMult = 1.2 + (level * 0.2); hp = 1; }

    let x, y;
    if (Math.random() < 0.5) {
      x = Math.random() < 0.5 ? 0 - radius : canvas.width + radius;
      y = Math.random() * canvas.height;
    } else {
      x = Math.random() * canvas.width;
      y = Math.random() < 0.5 ? 0 - radius : canvas.height + radius;
    }

    enemies.current.push({ x, y, radius, color, hp, maxHp: hp, type, speedMult });
  };

  // 自動開火邏輯
  const autoShoot = () => {
    if (enemies.current.length === 0) return;

    // 尋找最近的敵人
    let nearestEnemy = enemies.current[0];
    let minDist = Infinity;
    enemies.current.forEach(e => {
      const dist = Math.hypot(e.x - playerPos.current.x, e.y - playerPos.current.y);
      if (dist < minDist) { minDist = dist; nearestEnemy = e; }
    });

    const angle = Math.atan2(nearestEnemy.y - playerPos.current.y, nearestEnemy.x - playerPos.current.x);
    const px = playerPos.current.x;
    const py = playerPos.current.y;

    if (weaponType.current === 'shotgun') {
      playSound('shoot_shotgun');
      [-0.2, 0, 0.2].forEach(offset => {
        projectiles.current.push({
          x: px, y: py, radius: 4, color: '#ffff00', pierce: 1,
          velocity: { x: Math.cos(angle + offset) * 8, y: Math.sin(angle + offset) * 8 }
        });
      });
    } else if (weaponType.current === 'pierce') {
      playSound('shoot_pierce');
      projectiles.current.push({
        x: px, y: py, radius: 8, color: '#00ffcc', pierce: 3,
        velocity: { x: Math.cos(angle) * 12, y: Math.sin(angle) * 12 }
      });
    } else {
      playSound('shoot_default');
      projectiles.current.push({
        x: px, y: py, radius: 5, color: '#ffffff', pierce: 1,
        velocity: { x: Math.cos(angle) * 7, y: Math.sin(angle) * 7 }
      });
    }
  };

  const checkLevelUp = (currentScore: number) => {
    if (level <= 3 && currentScore >= LEVEL_THRESHOLDS[level - 1]) {
      setIsTransitioning(true);
      if (level === 3) {
        playSound('win');
        setGameOver(true);
      } else {
        playSound('level_up');
        setTimeout(() => {
          setLevel(l => l + 1);
          setLives(l => l + 1);
          enemies.current = [];
          projectiles.current = [];
          drops.current = [];
          weaponType.current = 'default';
          setIsTransitioning(false);
        }, 3000);
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const animate = () => {
      if (!isTransitioning && !gameOver && gameStarted) {
        animationId.current = requestAnimationFrame(animate);
      } else if (!gameStarted) {
        animationId.current = requestAnimationFrame(animate); // 等待開始
      }

      ctx.fillStyle = 'rgba(5, 5, 5, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!gameStarted) {
        ctx.fillStyle = 'white';
        ctx.font = '30px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('點擊並拖動滑鼠開始遊戲', canvas.width / 2, canvas.height / 2);
        return;
      }

      const px = playerPos.current.x;
      const py = playerPos.current.y;

      // 處理自動開火冷卻
      const now = Date.now();
      const fireRate = weaponType.current === 'shotgun' ? 400 : weaponType.current === 'pierce' ? 600 : 200;
      if (now - lastShootTime.current > fireRate) {
        autoShoot();
        lastShootTime.current = now;
      }

      // 畫掉落物
      drops.current.forEach((drop, index) => {
        const angle = Math.atan2(py - drop.y, px - drop.x);
        drop.x += Math.cos(angle) * 1;
        drop.y += Math.sin(angle) * 1;

        ctx.shadowBlur = 15;
        ctx.shadowColor = drop.color;
        ctx.fillStyle = drop.color;
        ctx.fillRect(drop.x - drop.radius, drop.y - drop.radius, drop.radius * 2, drop.radius * 2);

        if (Math.hypot(px - drop.x, py - drop.y) < 20 + drop.radius) {
          playSound('level_up'); // 拾取音效
          weaponType.current = drop.type;
          drops.current.splice(index, 1);
        }
      });

      // 畫玩家 (自動瞄準最近的敵人，若無則朝上)
      let playerAngle = -Math.PI / 2;
      if (enemies.current.length > 0) {
        let nearest = enemies.current[0];
        let minDist = Infinity;
        enemies.current.forEach(e => {
          const d = Math.hypot(e.x - px, e.y - py);
          if (d < minDist) { minDist = d; nearest = e; }
        });
        playerAngle = Math.atan2(nearest.y - py, nearest.x - px);
      }

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(playerAngle);
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#0066ff';
      ctx.beginPath();
      ctx.moveTo(20, 0); ctx.lineTo(-10, 15); ctx.lineTo(-10, -15);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();

      // 更新與畫子彈
      projectiles.current.forEach((p, index) => {
        p.x += p.velocity.x; p.y += p.velocity.y;
        ctx.shadowBlur = 10; ctx.shadowColor = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.fill();

        if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
          projectiles.current.splice(index, 1);
        }
      });

      // 更新與畫敵人 (現在敵人會追蹤玩家當前位置)
      enemies.current.forEach((enemy, eIndex) => {
        const angleToPlayer = Math.atan2(py - enemy.y, px - enemy.x);
        enemy.x += Math.cos(angleToPlayer) * enemy.speedMult;
        enemy.y += Math.sin(angleToPlayer) * enemy.speedMult;

        ctx.shadowBlur = 15; ctx.shadowColor = enemy.color;
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.rotate(Date.now() / 500 * (enemy.type === 'fast' ? 2 : 1));
        ctx.beginPath();
        if (enemy.type === 'tank') { ctx.rect(-enemy.radius, -enemy.radius, enemy.radius*2, enemy.radius*2); } 
        else if (enemy.type === 'fast') { ctx.moveTo(0, -enemy.radius); ctx.lineTo(enemy.radius, enemy.radius); ctx.lineTo(-enemy.radius, enemy.radius); } 
        else { ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2); }
        ctx.fillStyle = enemy.color; ctx.fill();
        
        if (enemy.maxHp > 1) {
            ctx.fillStyle = 'red'; ctx.fillRect(-enemy.radius, -enemy.radius - 10, enemy.radius * 2, 4);
            ctx.fillStyle = 'lightgreen'; ctx.fillRect(-enemy.radius, -enemy.radius - 10, (enemy.radius * 2) * (enemy.hp / enemy.maxHp), 4);
        }
        ctx.restore();

        // 碰撞：敵人撞到玩家
        if (Math.hypot(px - enemy.x, py - enemy.y) < enemy.radius + 15) {
          playSound('explode');
          enemies.current.splice(eIndex, 1);
          setLives(prev => {
            if (prev - 1 <= 0) setGameOver(true);
            return prev - 1;
          });
        }

        // 碰撞：子彈打到敵人
        projectiles.current.forEach((p, pIndex) => {
          if (Math.hypot(p.x - enemy.x, p.y - enemy.y) - enemy.radius - p.radius < 1) {
            enemy.hp -= 1;
            p.pierce -= 1;
            if (p.pierce <= 0) projectiles.current.splice(pIndex, 1);

            playSound('hit'); // 播放打擊音效

            if (enemy.hp <= 0) {
              playSound('explode'); // 播放死亡爆炸音效
              setScore(s => {
                const newScore = s + (enemy.type === 'tank' ? 300 : enemy.type === 'fast' ? 200 : 100);
                checkLevelUp(newScore);
                return newScore;
              });

              if (Math.random() < 0.15) {
                const dropType = Math.random() < 0.5 ? 'shotgun' : 'pierce';
                drops.current.push({ x: enemy.x, y: enemy.y, radius: 8, color: dropType === 'shotgun' ? '#ffff00' : '#00ffcc', type: dropType });
              }
              setTimeout(() => enemies.current.splice(eIndex, 1), 0);
            }
          }
        });
      });
      ctx.shadowBlur = 0;
    };

    const spawnRate = Math.max(400, 1000 - (level * 200));
    const interval = setInterval(() => spawnEnemy(canvas), spawnRate);
    animate();

    return () => {
      cancelAnimationFrame(animationId.current!);
      clearInterval(interval);
    };
  }, [gameOver, isTransitioning, level, gameStarted]);

  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: '100vh', width: '100vw', touchAction: 'none' }}>
      <div className="game-ui">
        <div>分數: {score}</div>
        <div>關卡: {level} / 3</div>
        <div style={{ color: lives === 1 ? 'red' : 'white' }}>生命值: {'❤️'.repeat(lives)}</div>
      </div>

      {isTransitioning && !gameOver && (
        <div className="level-transition">
          <h1>關卡 {level - 1} 通過！</h1>
          <p>準備進入 關卡 {level}...</p>
          <p style={{ color: '#00ffcc' }}>生命值 +1</p>
        </div>
      )}

      {gameOver && (
        <div className="game-over">
          <h1 style={{ color: score >= LEVEL_THRESHOLDS[2] ? 'gold' : 'red' }}>
             {score >= LEVEL_THRESHOLDS[2] ? '恭喜通關！你是神槍手！' : '遊戲結束！'}
          </h1>
          <h2>最終分數: {score}</h2>
          <button onClick={() => window.location.reload()}>重新開始</button>
        </div>
      )}

      {/* 將滑鼠/觸控事件綁定在 canvas 上 */}
      <canvas 
        ref={canvasRef} 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ display: 'block', cursor: 'crosshair' }} 
      />
    </div>
  );
}

export default App;
