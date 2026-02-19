import { useEffect, useRef, useState } from 'react';
import './App.css';

// 定義遊戲物件介面
interface Entity { x: number; y: number; radius: number; color: string; }
interface Projectile extends Entity { velocity: { x: number; y: number }; pierce: number; }
interface Enemy extends Entity { velocity: { x: number; y: number }; hp: number; maxHp: number; type: 'basic' | 'fast' | 'tank'; }
interface Drop extends Entity { type: 'shotgun' | 'pierce'; }

// 關卡過關分數需求
const LEVEL_THRESHOLDS = [1500, 4000, 8000];

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // 遊戲狀態 Ref (避免頻繁渲染)
  const projectiles = useRef<Projectile[]>([]);
  const enemies = useRef<Enemy[]>([]);
  const drops = useRef<Drop[]>([]);
  const weaponType = useRef<'default' | 'shotgun' | 'pierce'>('default');
  const animationId = useRef<number>();
  const mousePos = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  // 監聽滑鼠移動以讓玩家面向游標
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const spawnEnemy = (canvas: HTMLCanvasElement) => {
    if (isTransitioning || gameOver) return;
    
    // 根據關卡決定生成的敵人種類
    const rand = Math.random();
    let type: 'basic' | 'fast' | 'tank' = 'basic';
    let radius = 15;
    let color = '#ff3366';
    let speedMult = 1;
    let hp = 1;

    if (level >= 2 && rand < 0.3) {
      type = 'fast'; radius = 10; color = '#00ffff'; speedMult = 2.5; hp = 1;
    } else if (level >= 3 && rand > 0.8) {
      type = 'tank'; radius = 30; color = '#cc00ff'; speedMult = 0.5; hp = 4;
    } else {
      type = 'basic'; radius = 15; color = '#ff3366'; speedMult = 1.2 + (level * 0.2); hp = 1;
    }

    let x, y;
    if (Math.random() < 0.5) {
      x = Math.random() < 0.5 ? 0 - radius : canvas.width + radius;
      y = Math.random() * canvas.height;
    } else {
      x = Math.random() * canvas.width;
      y = Math.random() < 0.5 ? 0 - radius : canvas.height + radius;
    }

    const angle = Math.atan2(canvas.height / 2 - y, canvas.width / 2 - x);
    const velocity = { x: Math.cos(angle) * speedMult, y: Math.sin(angle) * speedMult };

    enemies.current.push({ x, y, radius, color, velocity, hp, maxHp: hp, type });
  };

  const handleShoot = () => {
    if (isTransitioning || gameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const angle = Math.atan2(mousePos.current.y - canvas.height / 2, mousePos.current.x - canvas.width / 2);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    if (weaponType.current === 'shotgun') {
      // 散彈槍：發射3發子彈
      [-0.2, 0, 0.2].forEach(offset => {
        projectiles.current.push({
          x: cx, y: cy, radius: 4, color: '#ffff00', pierce: 1,
          velocity: { x: Math.cos(angle + offset) * 8, y: Math.sin(angle + offset) * 8 }
        });
      });
    } else if (weaponType.current === 'pierce') {
      // 穿透彈：體積大、可穿透3個敵人
      projectiles.current.push({
        x: cx, y: cy, radius: 8, color: '#00ffcc', pierce: 3,
        velocity: { x: Math.cos(angle) * 12, y: Math.sin(angle) * 12 }
      });
    } else {
      // 默認武器
      projectiles.current.push({
        x: cx, y: cy, radius: 5, color: '#ffffff', pierce: 1,
        velocity: { x: Math.cos(angle) * 7, y: Math.sin(angle) * 7 }
      });
    }
  };

  const checkLevelUp = (currentScore: number) => {
    if (level <= 3 && currentScore >= LEVEL_THRESHOLDS[level - 1]) {
      setIsTransitioning(true);
      if (level === 3) {
        setGameOver(true); // 破關
      } else {
        setTimeout(() => {
          setLevel(l => l + 1);
          setLives(l => l + 1); // 過關獎勵生命
          enemies.current = []; // 清空畫面
          projectiles.current = [];
          drops.current = [];
          weaponType.current = 'default';
          setIsTransitioning(false);
        }, 3000); // 3秒過場
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

    const drawPlayer = (cx: number, cy: number, angle: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#0066ff';
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-10, 15);
      ctx.lineTo(-10, -15);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    };

    const animate = () => {
      if (!isTransitioning && !gameOver) {
        animationId.current = requestAnimationFrame(animate);
      }
      
      // 拖尾特效背景
      ctx.fillStyle = 'rgba(5, 5, 5, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // 畫掉落物
      drops.current.forEach((drop, index) => {
        // 掉落物緩慢向玩家飄動
        const angle = Math.atan2(cy - drop.y, cx - drop.x);
        drop.x += Math.cos(angle) * 1;
        drop.y += Math.sin(angle) * 1;

        ctx.shadowBlur = 15;
        ctx.shadowColor = drop.color;
        ctx.fillStyle = drop.color;
        ctx.fillRect(drop.x - drop.radius, drop.y - drop.radius, drop.radius * 2, drop.radius * 2);

        // 玩家拾取
        const distToPlayer = Math.hypot(cx - drop.x, cy - drop.y);
        if (distToPlayer < 20 + drop.radius) {
          weaponType.current = drop.type;
          drops.current.splice(index, 1);
        }
      });

      // 畫玩家
      const playerAngle = Math.atan2(mousePos.current.y - cy, mousePos.current.x - cx);
      drawPlayer(cx, cy, playerAngle);

      // 更新與畫子彈
      projectiles.current.forEach((p, index) => {
        p.x += p.velocity.x;
        p.y += p.velocity.y;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
          projectiles.current.splice(index, 1);
        }
      });

      // 更新與畫敵人
      enemies.current.forEach((enemy, eIndex) => {
        enemy.x += enemy.velocity.x;
        enemy.y += enemy.velocity.y;

        ctx.shadowBlur = 15;
        ctx.shadowColor = enemy.color;
        
        // 畫不同形狀的敵人
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        ctx.rotate(Date.now() / 500 * (enemy.type === 'fast' ? 2 : 1));
        ctx.beginPath();
        if (enemy.type === 'tank') {
           ctx.rect(-enemy.radius, -enemy.radius, enemy.radius*2, enemy.radius*2); // 方塊
        } else if (enemy.type === 'fast') {
           ctx.moveTo(0, -enemy.radius); ctx.lineTo(enemy.radius, enemy.radius); ctx.lineTo(-enemy.radius, enemy.radius); // 三角
        } else {
           ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2); // 圓形
        }
        ctx.fillStyle = enemy.color;
        ctx.fill();
        
        // 畫血條
        if (enemy.maxHp > 1) {
            ctx.fillStyle = 'red';
            ctx.fillRect(-enemy.radius, -enemy.radius - 10, enemy.radius * 2, 4);
            ctx.fillStyle = 'lightgreen';
            ctx.fillRect(-enemy.radius, -enemy.radius - 10, (enemy.radius * 2) * (enemy.hp / enemy.maxHp), 4);
        }
        ctx.restore();

        // 碰撞檢測：敵人撞到玩家
        const distToPlayer = Math.hypot(cx - enemy.x, cy - enemy.y);
        if (distToPlayer < enemy.radius + 15) {
          enemies.current.splice(eIndex, 1);
          setLives(prev => {
            const newLives = prev - 1;
            if (newLives <= 0) {
              setGameOver(true);
            }
            return newLives;
          });
        }

        // 碰撞檢測：子彈打到敵人
        projectiles.current.forEach((p, pIndex) => {
          const dist = Math.hypot(p.x - enemy.x, p.y - enemy.y);
          if (dist - enemy.radius - p.radius < 1) {
            enemy.hp -= 1;
            p.pierce -= 1;
            if (p.pierce <= 0) projectiles.current.splice(pIndex, 1); // 穿透力耗盡才消失

            if (enemy.hp <= 0) {
              setScore(s => {
                const newScore = s + (enemy.type === 'tank' ? 300 : enemy.type === 'fast' ? 200 : 100);
                checkLevelUp(newScore);
                return newScore;
              });

              // 掉落武器機率 (15%)
              if (Math.random() < 0.15) {
                const dropType = Math.random() < 0.5 ? 'shotgun' : 'pierce';
                drops.current.push({
                  x: enemy.x, y: enemy.y, radius: 8, 
                  color: dropType === 'shotgun' ? '#ffff00' : '#00ffcc', 
                  type: dropType 
                });
              }
              setTimeout(() => enemies.current.splice(eIndex, 1), 0);
            }
          }
        });
      });
      ctx.shadowBlur = 0; // 重置陰影避免影響效能
    };

    const spawnRate = Math.max(400, 1000 - (level * 200)); // 關卡越高生成越快
    const interval = setInterval(() => spawnEnemy(canvas), spawnRate);
    animate();

    return () => {
      cancelAnimationFrame(animationId.current!);
      clearInterval(interval);
    };
  }, [gameOver, isTransitioning, level]);

  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: '100vh', width: '100vw' }}>
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

      <canvas ref={canvasRef} onClick={handleShoot} style={{ display: 'block' }} />
    </div>
  );
}

export default App;
