// Deep links utility for popular apps with automatic fallback to web version

interface DeepLinkConfig {
  // Pattern to match the URL
  pattern: RegExp;
  // Function to extract identifier from URL
  extractId: (url: string) => string | null;
  // Deep link scheme
  deepLink: (id: string) => string;
  // Web fallback URL
  webUrl: (id: string) => string;
}

const deepLinkConfigs: DeepLinkConfig[] = [
  // Instagram
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)\/?/,
    extractId: (url) => {
      const match = url.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
      return match ? match[1] : null;
    },
    deepLink: (id) => `instagram://user?username=${id}`,
    webUrl: (id) => `https://www.instagram.com/${id}/`,
  },
  // Instagram post
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/p\/([a-zA-Z0-9_-]+)\/?/,
    extractId: (url) => {
      const match = url.match(/instagram\.com\/p\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    },
    deepLink: (id) => `instagram://media?id=${id}`,
    webUrl: (id) => `https://www.instagram.com/p/${id}/`,
  },
  // Instagram reel
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/reel\/([a-zA-Z0-9_-]+)\/?/,
    extractId: (url) => {
      const match = url.match(/instagram\.com\/reel\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    },
    deepLink: (id) => `instagram://reels?id=${id}`,
    webUrl: (id) => `https://www.instagram.com/reel/${id}/`,
  },
  // Telegram channel/user
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)\/?/,
    extractId: (url) => {
      const match = url.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/);
      return match ? match[1] : null;
    },
    deepLink: (id) => `tg://resolve?domain=${id}`,
    webUrl: (id) => `https://t.me/${id}`,
  },
  // Telegram with message
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)\/(\d+)\/?/,
    extractId: (url) => {
      const match = url.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)\/(\d+)/);
      return match ? `${match[1]}/${match[2]}` : null;
    },
    deepLink: (id) => {
      const [channel, msgId] = id.split('/');
      return `tg://resolve?domain=${channel}&post=${msgId}`;
    },
    webUrl: (id) => `https://t.me/${id}`,
  },
  // WhatsApp direct message
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?(?:wa\.me|api\.whatsapp\.com\/send)\/?\??(?:phone=)?(\d+)/,
    extractId: (url) => {
      // Handle wa.me/1234567890
      const waMatch = url.match(/wa\.me\/(\d+)/);
      if (waMatch) return waMatch[1];
      
      // Handle api.whatsapp.com/send?phone=1234567890
      const apiMatch = url.match(/phone=(\d+)/);
      if (apiMatch) return apiMatch[1];
      
      return null;
    },
    deepLink: (id) => `whatsapp://send?phone=${id}`,
    webUrl: (id) => `https://wa.me/${id}`,
  },
  // WhatsApp with text
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?wa\.me\/(\d+)\?text=/,
    extractId: (url) => {
      const match = url.match(/wa\.me\/(\d+)\?text=([^&]*)/);
      if (match) {
        return `${match[1]}|${match[2]}`;
      }
      return null;
    },
    deepLink: (id) => {
      const [phone, text] = id.split('|');
      return `whatsapp://send?phone=${phone}&text=${text}`;
    },
    webUrl: (id) => {
      const [phone, text] = id.split('|');
      return `https://wa.me/${phone}?text=${text}`;
    },
  },
];

/**
 * Opens a URL with deep link support for popular apps
 * Tries to open the native app first, falls back to web version
 */
export function openWithDeepLink(url: string): void {
  // Find matching config
  for (const config of deepLinkConfigs) {
    if (config.pattern.test(url)) {
      const id = config.extractId(url);
      if (id) {
        const deepLink = config.deepLink(id);
        const webUrl = config.webUrl(id);
        
        // Try to open deep link with fallback
        tryDeepLinkWithFallback(deepLink, webUrl);
        return;
      }
    }
  }
  
  // No matching pattern - open as regular URL
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Attempts to open a deep link, falls back to web URL if app is not installed
 */
function tryDeepLinkWithFallback(deepLink: string, webUrl: string): void {
  // Check if running in Telegram Mini App
  const tgWebApp = window.Telegram?.WebApp as { 
    initData?: string; 
    openLink?: (url: string) => void 
  } | undefined;
  const isTelegramMiniApp = tgWebApp?.initData;
  
  if (isTelegramMiniApp && tgWebApp?.openLink) {
    // In Telegram Mini App, use openLink for external URLs
    // Deep links may not work properly in TMA context
    tgWebApp.openLink(webUrl);
    return;
  }
  
  // Create hidden iframe to try deep link (works better on mobile)
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  
  // Set timeout for fallback
  const timeout = setTimeout(() => {
    document.body.removeChild(iframe);
    window.open(webUrl, '_blank', 'noopener,noreferrer');
  }, 1500);
  
  // Try deep link via iframe
  iframe.src = deepLink;
  
  // Also try via window.location for iOS
  const startTime = Date.now();
  
  // Check if app was opened (page will be hidden)
  const checkVisibility = () => {
    if (document.hidden || Date.now() - startTime > 1000) {
      clearTimeout(timeout);
      document.body.removeChild(iframe);
    }
  };
  
  // Listen for visibility change
  document.addEventListener('visibilitychange', checkVisibility, { once: true });
  
  // Clean up after timeout
  setTimeout(() => {
    document.removeEventListener('visibilitychange', checkVisibility);
  }, 2000);
}

/**
 * Detects the type of app from URL
 */
export function detectAppType(url: string): 'instagram' | 'telegram' | 'whatsapp' | 'other' {
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/(?:t\.me|telegram\.me)/i.test(url)) return 'telegram';
  if (/(?:wa\.me|whatsapp\.com)/i.test(url)) return 'whatsapp';
  return 'other';
}
