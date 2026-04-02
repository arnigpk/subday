import visaLogo from '@/assets/visa-logo.png';
import mastercardLogo from '@/assets/mastercard-logo.png';

export function PaymentLogos() {
  return (
    <div className="flex items-center justify-center gap-4 mt-3 opacity-40">
      <img src={visaLogo} alt="Visa" className="h-5 w-auto object-contain" />
      <img src={mastercardLogo} alt="Mastercard" className="h-5 w-auto object-contain" />
    </div>
  );
}
