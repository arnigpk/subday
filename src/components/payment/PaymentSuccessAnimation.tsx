import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { useSuccessSound } from '@/hooks/useSuccessSound';

interface PaymentSuccessAnimationProps {
  show: boolean;
  onComplete: () => void;
}

// Confetti particle component
function ConfettiParticle({ delay, x, color }: { delay: number; x: number; color: string }) {
  return (
    <motion.div
      className="absolute top-1/3 rounded-sm"
      style={{
        left: `${x}%`,
        width: Math.random() * 8 + 4,
        height: Math.random() * 8 + 4,
        backgroundColor: color,
      }}
      initial={{ y: 0, opacity: 1, rotate: 0, scale: 1 }}
      animate={{
        y: [0, -80, 300],
        x: [0, (Math.random() - 0.5) * 150],
        opacity: [1, 1, 0],
        rotate: [0, Math.random() * 720 - 360],
        scale: [1, 1.2, 0.5],
      }}
      transition={{
        duration: 2,
        delay,
        ease: 'easeOut',
      }}
    />
  );
}

const CONFETTI_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  '#FFD700',
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
];

export function PaymentSuccessAnimation({ show, onComplete }: PaymentSuccessAnimationProps) {
  const [particles] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      delay: Math.random() * 0.5,
      x: Math.random() * 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    }))
  );
  const { playSuccessSound } = useSuccessSound();

  useEffect(() => {
    if (show) {
      playSuccessSound();
      const timer = setTimeout(onComplete, 3000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete, playSuccessSound]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onComplete}
        >
          {/* Confetti */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.map((p) => (
              <ConfettiParticle key={p.id} delay={p.delay} x={p.x} color={p.color} />
            ))}
          </div>

          {/* Checkmark circle */}
          <motion.div
            className="relative flex flex-col items-center gap-4"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          >
            <motion.div
              className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center shadow-2xl"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.2, 1] }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <motion.div
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.5 }}
              >
                <Check className="w-12 h-12 text-white" strokeWidth={3} />
              </motion.div>
            </motion.div>
            <motion.p
              className="text-xl font-bold text-white drop-shadow-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              Оплата прошла успешно! 🎉
            </motion.p>
            <motion.p
              className="text-sm text-white/80 drop-shadow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              Подписка активирована
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
