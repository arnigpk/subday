import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  buildAndroidIntentUrl,
  buildIosSchemeUrl,
} from '@/config/appLinks';
import logo from '@/assets/logo.png';

const DISMISS_KEY = 'subday_bridge_dismissed';

type Platform = 'android' | 'ios' | null;

function detectPlatform(): Platform {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return null;
}

// Only bridge on the shareable deep-link routes.
function isDeepLinkRoute(): boolean {
  const { pathname, search } = window.location;
  if (/^\/shops\/[\w-]+/.test(pathname)) return true;
  if (pathname.startsWith('/subflow') && new URLSearchParams(search).has('post')) return true;
  return false;
}

/**
 * "Open in app" bridge shown when a shared link is opened in a mobile browser
 * (i.e. the native app didn't intercept it). Tries to open the app and falls
 * back to the right store. Never shown inside the native app or Telegram mini
 * app, and only on the shareable /shops/:id and /subflow?post= routes.
 */
export function AppInstallBridge() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>(null);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return; // inside the app already
    if ((window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData) return;
    const plat = detectPlatform();
    if (!plat) return; // desktop web — leave it alone
    if (!isDeepLinkRoute()) return;
    try { if (sessionStorage.getItem(DISMISS_KEY)) return; } catch { /* ignore */ }

    setPlatform(plat);
    setVisible(true);
  }, []);

  const openApp = () => {
    const path = window.location.pathname + window.location.search;
    if (platform === 'android') {
      window.location.href = buildAndroidIntentUrl(path);
      return;
    }
    if (platform === 'ios') {
      // Try the app via a hidden iframe (avoids Safari's "address is invalid"
      // dialog when the app isn't installed); fall back to the App Store.
      const start = Date.now();
      const timer = window.setTimeout(() => {
        if (APP_STORE_URL && !document.hidden && Date.now() - start < 2500) {
          window.location.href = APP_STORE_URL;
        }
      }, 1200);
      const onHide = () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onHide); };
      document.addEventListener('visibilitychange', onHide);
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = buildIosSchemeUrl(path);
      document.body.appendChild(iframe);
      window.setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 1500);
    }
  };

  // Auto-attempt once on mount (button remains for browsers that block it).
  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(openApp, 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const storeUrl = platform === 'android' ? PLAY_STORE_URL : APP_STORE_URL;
  const storeLabel = platform === 'android' ? 'Google Play' : 'App Store';

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full sm:max-w-sm m-3 rounded-3xl bg-background border border-border/50 shadow-2xl p-6 text-center animate-slide-up">
        <img src={logo} alt="subday" className="h-12 w-auto object-contain mx-auto mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-1">Открыть в приложении</h2>
        <p className="text-sm text-muted-foreground mb-5">
          В приложении subday удобнее — открой ссылку там или установи бесплатно.
        </p>

        <button
          onClick={openApp}
          className="btn-accent w-full rounded-2xl py-3 font-semibold mb-3"
        >
          Открыть в приложении
        </button>

        {storeUrl && (
          <a
            href={storeUrl}
            className="block w-full rounded-2xl py-3 font-semibold text-foreground border border-border/60 bg-secondary/40 mb-4 transition-colors hover:bg-secondary"
          >
            Установить из {storeLabel}
          </a>
        )}

        <button onClick={dismiss} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Продолжить в браузере
        </button>
      </div>
    </div>
  );
}
