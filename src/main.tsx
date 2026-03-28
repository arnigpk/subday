import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Detect Telegram MiniApp and mark document for CSS adjustments
if ((window as any).Telegram?.WebApp) {
  document.documentElement.classList.add('tg-miniapp');
}

createRoot(document.getElementById("root")!).render(<App />);
