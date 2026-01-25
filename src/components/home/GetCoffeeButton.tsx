import { QrCode } from 'lucide-react';
import { Link } from 'react-router-dom';

export function GetCoffeeButton() {
  return (
    <Link 
      to="/redeem" 
      className="block w-full animate-slide-up" 
      style={{ animationDelay: '0.05s' }}
    >
      <button className="w-full btn-accent flex items-center justify-center gap-3 text-xl animate-pulse-glow">
        <QrCode size={28} strokeWidth={2.5} />
        <span>Забрать</span>
      </button>
    </Link>
  );
}
