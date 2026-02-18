import { useEffect, useRef, useState } from 'react';
import './App.css';

interface Entity {
  x: number;
  y: number;
  radius: number;
  color: string;
}

interface Projectile extends Entity {
  velocity: { x: number; y: number };
}

interface Enemy extends Projectile {}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  // Game state held in refs to avoid re-renders during the game loop
  const projectiles = useRef<Projectile[]>([]);
  const enemies = useRef<Enemy[]>([]);
  const animationId = useRef<number>();

  const spawnEnemy = (canvas: HTMLCanvasElement) => {
    const radius = Math.random() * (30 - 10) + 10;
    let x, y;

    if (Math.random() < 0.5) {
      x = Math.random() < 0.5 ? 0 - radius : canvas.width + radius;
      y = Math.random() * canvas.height;
    } else {
      x = Math.random() * canvas.width;
      y = Math.random() < 0.5 ? 0 - radius : canvas.height + radius;
    }

    const angle = Math.atan2(canvas.height / 2 - y, canvas.width / 2 - x);
    const velocity = {
      x: Math.cos(angle) * 2,
      y: Math.sin(angle) * 2,
    };

    enemies.current.push({ x, y, radius, color: 'red', velocity });
  };

  const handleShoot = (e: React.MouseEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const angle = Math.atan2(
      e.clientY - canvas.height / 2,
      e.clientX - canvas.width / 2
    );

    projectiles.current.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      radius: 5,
      color: 'white',
      velocity: {
        x: Math.cos(angle) * 6,
        y: Math.sin(angle) * 6,
      },
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const animate = () => {
      animationId.current = requestAnimationFrame(animate);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Player
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 15, 0, Math.PI * 2);
      ctx.fillStyle = 'blue';
      ctx.fill();

      // Update Projectiles
      projectiles.current.forEach((p, index) => {
        p.x += p.velocity.x;
        p.y += p.velocity.y;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
          projectiles.current.splice(index, 1);
        }
      });

      // Update Enemies
      enemies.current.forEach((enemy, eIndex) => {
        enemy.x += enemy.velocity.x;
        enemy.y += enemy.velocity.y;

        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fillStyle = enemy.color;
        ctx.fill();

        // Game Over check
        const distToPlayer = Math.hypot(canvas.width / 2 - enemy.x, canvas.height / 2 - enemy.y);
        if (distToPlayer - enemy.radius - 15 < 1) {
          cancelAnimationFrame(animationId.current!);
          setGameOver(true);
        }

        // Collision detection
        projectiles.current.forEach((p, pIndex) => {
          const dist = Math.hypot(p.x - enemy.x, p.y - enemy.y);
          if (dist - enemy.radius - p.radius < 1) {
            setScore((s) => s + 100);
            setTimeout(() => {
              enemies.current.splice(eIndex, 1);
              projectiles.current.splice(pIndex, 1);
            }, 0);
          }
        });
      });
    };

    const interval = setInterval(() => spawnEnemy(canvas), 1000);
    animate();

    return () => {
      cancelAnimationFrame(animationId.current!);
      clearInterval(interval);
    };
  }, [gameOver]);

  return (
    <div style={{ position: 'relative', overflow: 'hidden', height: '100vh', width: '100vw' }}>
      <div style={{ position: 'absolute', color: 'white', padding: '10px', fontSize: '20px' }}>
        Score: {score}
      </div>
      {gameOver && (
        <div className="game-over">
          <h1>Game Over!</h1>
          <button onClick={() => window.location.reload()}>Restart</button>
        </div>
      )}
      <canvas ref={canvasRef} onClick={handleShoot} style={{ display: 'block' }} />
    </div>
  );
}

export default App;
