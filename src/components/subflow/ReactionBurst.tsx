import { useState, useEffect } from 'react';

interface Particle {
  id: number;
  emoji: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  duration: number;
}

interface ReactionBurstProps {
  emoji: string | null;
  onDone: () => void;
}

let particleId = 0;

export function ReactionBurst({ emoji, onDone }: ReactionBurstProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!emoji) return;

    const count = 6;
    const newParticles: Particle[] = Array.from({ length: count }, (_, i) => ({
      id: ++particleId,
      emoji,
      x: (Math.random() - 0.5) * 80,
      y: -(30 + Math.random() * 60),
      scale: 0.6 + Math.random() * 0.8,
      rotation: (Math.random() - 0.5) * 120,
      duration: 600 + Math.random() * 400,
    }));

    setParticles(newParticles);

    const timer = setTimeout(() => {
      setParticles([]);
      onDone();
    }, 1100);

    return () => clearTimeout(timer);
  }, [emoji]);

  if (!particles.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible z-50">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute left-1/2 top-1/2 text-2xl"
          style={{
            animation: `reaction-burst ${p.duration}ms ease-out forwards`,
            '--burst-x': `${p.x}px`,
            '--burst-y': `${p.y}px`,
            '--burst-scale': p.scale,
            '--burst-rotation': `${p.rotation}deg`,
          } as React.CSSProperties}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
