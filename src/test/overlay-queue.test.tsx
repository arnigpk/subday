import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import {
  OverlayProvider,
  useOverlaySlot,
  resolveActiveOverlay,
  OVERLAY_PRIORITY,
} from '@/contexts/OverlayContext';

// Тестируем РЕАЛЬНЫЙ дирижёр оверлеев: онбординг → спецпредложение → сообщение.
// Главное, что проверяем: одновременно рендерится РОВНО ОДИН оверлей, и после
// закрытия старшего автоматически показывается следующий.

function Slot({ id, wants }: { id: 'onboarding' | 'specialOffer' | 'appMessage'; wants: boolean }) {
  const canShow = useOverlaySlot(id, wants);
  if (!wants || !canShow) return null;
  return <div data-testid={`overlay-${id}`}>{id}</div>;
}

function Harness({ initial }: { initial: Record<string, boolean> }) {
  const [w, setW] = useState(initial);
  return (
    <OverlayProvider>
      <button data-testid="close-onboarding" onClick={() => setW(p => ({ ...p, onboarding: false }))} />
      <button data-testid="close-offer" onClick={() => setW(p => ({ ...p, specialOffer: false }))} />
      <Slot id="onboarding" wants={!!w.onboarding} />
      <Slot id="specialOffer" wants={!!w.specialOffer} />
      <Slot id="appMessage" wants={!!w.appMessage} />
    </OverlayProvider>
  );
}

const shown = () =>
  ['onboarding', 'specialOffer', 'appMessage'].filter(id => screen.queryByTestId(`overlay-${id}`));

describe('resolveActiveOverlay (чистая логика приоритета)', () => {
  it('приоритет именно такой: онбординг → спецпредложение → сообщение', () => {
    expect(OVERLAY_PRIORITY).toEqual(['onboarding', 'specialOffer', 'appMessage']);
  });

  it('выбирает старшего из желающих', () => {
    expect(resolveActiveOverlay({ onboarding: true, specialOffer: true, appMessage: true })).toBe('onboarding');
    expect(resolveActiveOverlay({ specialOffer: true, appMessage: true })).toBe('specialOffer');
    expect(resolveActiveOverlay({ appMessage: true })).toBe('appMessage');
    expect(resolveActiveOverlay({})).toBeNull();
    expect(resolveActiveOverlay({ onboarding: false, appMessage: true })).toBe('appMessage');
  });
});

describe('Очередь оверлеев (реальные компоненты)', () => {
  it('новый пользователь: все три хотят показаться — виден ТОЛЬКО онбординг', () => {
    render(<Harness initial={{ onboarding: true, specialOffer: true, appMessage: true }} />);
    expect(screen.getByTestId('overlay-onboarding')).toBeTruthy();
    expect(screen.queryByTestId('overlay-specialOffer')).toBeNull();
    expect(screen.queryByTestId('overlay-appMessage')).toBeNull();
    expect(shown()).toHaveLength(1);
  });

  it('после онбординга показывается спецпредложение, потом сообщение', () => {
    render(<Harness initial={{ onboarding: true, specialOffer: true, appMessage: true }} />);

    act(() => { screen.getByTestId('close-onboarding').click(); });
    expect(screen.queryByTestId('overlay-onboarding')).toBeNull();
    expect(screen.getByTestId('overlay-specialOffer')).toBeTruthy();
    expect(screen.queryByTestId('overlay-appMessage')).toBeNull();
    expect(shown()).toHaveLength(1);

    act(() => { screen.getByTestId('close-offer').click(); });
    expect(screen.getByTestId('overlay-appMessage')).toBeTruthy();
    expect(shown()).toHaveLength(1);
  });

  it('без онбординга (существующий юзер): сначала спецпредложение, сообщение ждёт', () => {
    render(<Harness initial={{ onboarding: false, specialOffer: true, appMessage: true }} />);
    expect(screen.getByTestId('overlay-specialOffer')).toBeTruthy();
    expect(screen.queryByTestId('overlay-appMessage')).toBeNull();
  });

  it('если хочет только сообщение — оно и показывается сразу', () => {
    render(<Harness initial={{ appMessage: true }} />);
    expect(screen.getByTestId('overlay-appMessage')).toBeTruthy();
    expect(shown()).toHaveLength(1);
  });

  it('никто не хочет — ничего не рендерится', () => {
    render(<Harness initial={{}} />);
    expect(shown()).toHaveLength(0);
  });
});
