import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Detect Telegram MiniApp and set CSS variable for safe area
if (window.Telegram?.WebApp) {
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
  // Set CSS variable for Telegram header offset
  const updateInset = () => {
    const headerHeight = tg.headerColor ? 0 : 0; // Telegram handles its own header
    const contentSafeTop = tg.viewportStableHeight !== tg.viewportHeight ? 0 : 0;
    document.documentElement.style.setProperty('--tg-safe-top', `${contentSafeTop}px`);
  };
  updateInset();
  tg.onEvent('viewportChanged', updateInset);
  document.documentElement.classList.add('tg-miniapp');
}

createRoot(document.getElementById("root")!).render(<App />);
