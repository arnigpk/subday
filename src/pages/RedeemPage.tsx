import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, QrCode, Check, Sparkles } from 'lucide-react';
import { coffeeShops } from '@/data/mockData';

type RedeemStatus = 'ready' | 'scanning' | 'success';

export default function RedeemPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<RedeemStatus>('ready');
  const [showConfetti, setShowConfetti] = useState(false);
  
  const shop = location.state?.shop || coffeeShops[0];
  
  // Mock scanning process
  const handleScan = () => {
    setStatus('scanning');
    
    setTimeout(() => {
      setStatus('success');
      setShowConfetti(true);
      
      // Hide confetti after animation
      setTimeout(() => setShowConfetti(false), 2000);
    }, 2000);
  };
  
  // Auto-trigger for demo
  useEffect(() => {
    if (status === 'ready') {
      const timer = setTimeout(() => {
        // Don't auto-trigger, let user tap
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);
  
  const goHome = () => {
    navigate('/');
  };
  
  return (
    <AppLayout hideNav>
      <div className="min-h-screen safe-area-top safe-area-bottom flex flex-col">
        {/* Header */}
        <div className="px-4 py-4 flex items-center gap-3">
          <Link to="/" className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <ArrowLeft size={20} className="text-foreground" />
          </Link>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Забираешь в</p>
            <h1 className="font-bold text-foreground">{shop.name}</h1>
          </div>
        </div>
        
        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          {status === 'ready' && (
            <div className="text-center animate-slide-up">
              <div className="w-64 h-64 bg-card rounded-3xl shadow-card flex items-center justify-center mb-6 mx-auto border-4 border-accent animate-pulse-glow">
                <QrCode size={180} className="text-foreground" />
              </div>
              <p className="text-lg font-bold text-foreground mb-2">Код готов</p>
              <p className="text-muted-foreground mb-8">Покажи бариста для сканирования</p>
              
              <button onClick={handleScan} className="btn-primary">
                Имитировать скан
              </button>
            </div>
          )}
          
          {status === 'scanning' && (
            <div className="text-center animate-pop">
              <div className="w-64 h-64 bg-card rounded-3xl shadow-card flex items-center justify-center mb-6 mx-auto border-4 border-primary">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-lg font-bold text-foreground mb-2">Сканируют...</p>
              <p className="text-muted-foreground">Подожди секунду</p>
            </div>
          )}
          
          {status === 'success' && (
            <div className="text-center animate-pop relative">
              {/* Confetti */}
              {showConfetti && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute animate-confetti"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: '50%',
                        animationDelay: `${Math.random() * 0.5}s`,
                        fontSize: `${Math.random() * 20 + 10}px`,
                      }}
                    >
                      {['☕', '✨', '🎉', '⭐'][Math.floor(Math.random() * 4)]}
                    </div>
                  ))}
                </div>
              )}
              
              <div className="w-64 h-64 bg-accent rounded-3xl shadow-glow flex items-center justify-center mb-6 mx-auto">
                <Check size={100} className="text-accent-foreground" strokeWidth={3} />
              </div>
              <p className="text-2xl font-black text-foreground mb-2">Засчитано!</p>
              <p className="text-muted-foreground mb-2">Наслаждайся напитком ☕</p>
              
              <div className="inline-flex items-center gap-2 bg-accent/20 text-accent font-bold px-4 py-2 rounded-xl mt-4">
                <Sparkles size={16} />
                +1 к стрику
              </div>
              
              <div className="mt-8">
                <button onClick={goHome} className="btn-primary">
                  На главную
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
