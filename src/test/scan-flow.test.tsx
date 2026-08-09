import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Веб-камера: считаем КАЖДОЕ монтирование. Ровно на этом ловится баг с двумя
// сканерами — если она поднялась, пока работает системный, счётчик вырастет.
const webCameraMounted = vi.fn();
vi.mock('@/components/partner/QRScanner', () => ({
  QRScanner: () => { webCameraMounted(); return <div data-testid="web-camera" />; },
}));

// Системный сканер. Очередь ответов задаём в каждом тесте.
const scanQueue: { status: string; value?: string }[] = [];
const nativeScanQR = vi.fn(async () => scanQueue.shift() ?? { status: 'cancelled' });
const isNativeScanReady = vi.fn(() => true);
vi.mock('@/lib/nativeScan', () => ({
  nativeScanQR: (...a: unknown[]) => nativeScanQR(...(a as [])),
  isNativeScanReady: () => isNativeScanReady(),
}));

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...(a as [])) } } }));
const toastError = vi.fn();
vi.mock('@/components/ui/sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...(a as [])), success: vi.fn() } }));
vi.mock('@/components/TT', () => ({ TT: ({ text }: { text: string }) => <>{text}</> }));

import { ShopQRScanner } from '@/components/redeem/ShopQRScanner';

const SHOP_QR = JSON.stringify({ t: 'subday_shop', k: '11111111-2222-3333-4444-555555555555' });

const base = {
  drinkType: 'coffee' as const,
  isGuestCoffee: false,
  onClose: vi.fn(),
  onRedeemed: vi.fn(),
};

describe('Экран пользователя: сканер после ошибки', () => {
  beforeEach(() => {
    scanQueue.length = 0;
    webCameraMounted.mockClear();
    nativeScanQR.mockClear();
    toastError.mockClear();
    invoke.mockReset();
    isNativeScanReady.mockReturnValue(true);
    base.onClose = vi.fn();
    base.onRedeemed = vi.fn();
  });

  it('ошибка списания → системный сканер открывается СНОВА, веб-камера не поднимается', async () => {
    // Первый скан упирается в ошибку сервера, второй — тоже (чтобы поймать повтор).
    scanQueue.push({ status: 'scanned', value: SHOP_QR }, { status: 'scanned', value: SHOP_QR });
    invoke.mockResolvedValue({ data: { error: 'QR код не действителен!' }, error: null });

    render(<ShopQRScanner {...base} />);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('QR код не действителен!'));
    // Ключевое: сканер переоткрылся, а запасная камера так и не появилась.
    await waitFor(() => expect(nativeScanQR.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 4000 });
    expect(webCameraMounted).not.toHaveBeenCalled();
    expect(screen.queryByTestId('web-camera')).toBeNull();
  });

  it('успешное списание не переоткрывает сканер', async () => {
    scanQueue.push({ status: 'scanned', value: SHOP_QR });
    invoke.mockResolvedValue({ data: { shopName: 'Granat' }, error: null });

    render(<ShopQRScanner {...base} />);

    await waitFor(() => expect(base.onRedeemed).toHaveBeenCalledWith('Granat'));
    expect(nativeScanQR).toHaveBeenCalledTimes(1);
    expect(webCameraMounted).not.toHaveBeenCalled();
  });

  it('закрыли окно сканера → закрывается экран, камера не поднимается', async () => {
    scanQueue.push({ status: 'cancelled' });
    render(<ShopQRScanner {...base} />);
    await waitFor(() => expect(base.onClose).toHaveBeenCalled());
    expect(webCameraMounted).not.toHaveBeenCalled();
  });

  it('сбой системного сканера → кнопка «Открыть сканер», камера сама не стартует', async () => {
    scanQueue.push({ status: 'unavailable' });
    render(<ShopQRScanner {...base} />);
    await waitFor(() => expect(screen.getByText('Открыть сканер')).toBeTruthy());
    expect(webCameraMounted).not.toHaveBeenCalled();
  });

  it('платформа без плагина → сразу обычная камера, без кнопок и ожиданий', async () => {
    isNativeScanReady.mockReturnValue(false);
    render(<ShopQRScanner {...base} />);
    await waitFor(() => expect(screen.getByTestId('web-camera')).toBeTruthy());
    expect(nativeScanQR).not.toHaveBeenCalled();
  });

  it('за всё время работы одновременно живёт только один сканер', async () => {
    scanQueue.push(
      { status: 'scanned', value: SHOP_QR },
      { status: 'scanned', value: SHOP_QR },
      { status: 'scanned', value: SHOP_QR },
    );
    invoke.mockResolvedValue({ data: { error: 'Ошибка' }, error: null });

    render(<ShopQRScanner {...base} />);

    await waitFor(() => expect(nativeScanQR.mock.calls.length).toBeGreaterThanOrEqual(3), { timeout: 6000 });
    // Ни одного монтирования веб-камеры за три круга с ошибками.
    expect(webCameraMounted).not.toHaveBeenCalled();
  });
});
