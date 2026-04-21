import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Detect Telegram MiniApp and mark document for CSS adjustments.
// Единый верхний отступ 40px для TMA на всех экранах (главная, админка,
// партнёр, бариста, subFlow). Фиксируем визуальный «воздух», не пересчитываем
// динамически — так одинаково красиво на iOS/Android и со всеми системными
// кнопками Telegram.
const tg = (window as any).Telegram?.WebApp;
if (tg) {
  document.documentElement.classList.add('tg-miniapp');
  document.documentElement.style.setProperty('--tg-safe-area-top', '40px');
}

createRoot(document.getElementById("root")!).render(<App />);
