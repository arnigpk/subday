import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Камера (html5-qrcode) в jsdom не работает — подменяем заглушкой.
vi.mock('@/components/partner/QRScanner', () => ({
  QRScanner: () => <div data-testid="camera" />,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// TT — обёртка авто-перевода, в тестах отдаём текст как есть.
vi.mock('@/components/TT', () => ({ TT: ({ text }: { text: string }) => <>{text}</> }));

import { ShopQRScanner } from '@/components/redeem/ShopQRScanner';

const base = {
  drinkType: 'coffee' as const,
  isGuestCoffee: false,
  onClose: vi.fn(),
  onRedeemed: vi.fn(),
};

describe('ShopQRScanner — кнопка «Ваш QR» и инфо-блок', () => {
  it('показывает кнопку «Ваш QR / показать бариста»', () => {
    render(<ShopQRScanner {...base} remaining={4} onShowMyQR={vi.fn()} />);
    expect(screen.getByText('Ваш QR')).toBeTruthy();
    expect(screen.getByText('показать бариста')).toBeTruthy();
  });

  it('клик по «Ваш QR» вызывает onShowMyQR и НЕ вызывает onClose (не уводит на главную)', () => {
    const onShowMyQR = vi.fn();
    const onClose = vi.fn();
    render(<ShopQRScanner {...base} onClose={onClose} remaining={4} onShowMyQR={onShowMyQR} />);
    fireEvent.click(screen.getByText('Ваш QR'));
    expect(onShowMyQR).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('инфо-блок показывает, что спишется, и остаток', () => {
    render(<ShopQRScanner {...base} remaining={4} onShowMyQR={vi.fn()} />);
    expect(screen.getByText('Спишется 1 кофе')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('для ланча — свой текст', () => {
    render(<ShopQRScanner {...base} drinkType="drinks" remaining={2} onShowMyQR={vi.fn()} />);
    expect(screen.getByText('Спишется 1 ланч')).toBeTruthy();
  });

  it('гостевой кофе: свой текст и без остатка подписки', () => {
    render(<ShopQRScanner {...base} isGuestCoffee remaining={0} onShowMyQR={vi.fn()} />);
    expect(screen.getByText('Спишется гостевой кофе')).toBeTruthy();
    expect(screen.queryByText('Осталось')).toBeNull();
  });

  it('без onShowMyQR кнопка не рендерится (обратная совместимость)', () => {
    render(<ShopQRScanner {...base} remaining={4} />);
    expect(screen.queryByText('Ваш QR')).toBeNull();
  });
});
