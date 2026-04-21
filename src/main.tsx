import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Detect Telegram MiniApp and mark document for CSS adjustments
const tg = (window as any).Telegram?.WebApp;
if (tg) {
  document.documentElement.classList.add('tg-miniapp');

  // Auto-compute top safe area for TMA so we don't hardcode 40px.
  // Bot API 8.0+ exposes `safeAreaInset` (system insets) and
  // `contentSafeAreaInset` (Telegram UI: close/minimize buttons).
  // We sum them — that's the real top clearance the page needs.
  const applyTmaSafeArea = () => {
    // Telegram уже сдвигает viewport под системные кнопки (Закрыть/свернуть).
    // Нам нужен лишь небольшой визуальный «воздух» сверху, не дублируя инсеты.
    // Фолбэк 8px для старых клиентов; реальные значения капаем до 16px.
    const sysTop = tg.safeAreaInset?.top ?? 0;
    const contentTop = tg.contentSafeAreaInset?.top ?? 0;
    const total = sysTop + contentTop;
    const px = total > 0 ? Math.min(total, 16) : 8;
    document.documentElement.style.setProperty('--tg-safe-area-top', `${px}px`);
  };

  applyTmaSafeArea();

  try {
    tg.onEvent?.('safeAreaChanged', applyTmaSafeArea);
    tg.onEvent?.('contentSafeAreaChanged', applyTmaSafeArea);
    tg.onEvent?.('viewportChanged', applyTmaSafeArea);
  } catch {
    // ignore — older Telegram clients
  }
}

createRoot(document.getElementById("root")!).render(<App />);
