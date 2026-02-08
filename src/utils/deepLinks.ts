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
  // Instagram profile
  {
    pattern: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)\/?$/,
    extractId: (url) => {
      const match = url.match(/instagram\.com\/([a-zA-Z0-9_.]+)\/?$/);
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
    pattern: /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)\/?$/,
    extractId: (url) => {
      const match = url.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)\/?$/);
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
    pattern: /(?:https?:\/\/)?(?:www\.)?(?:wa\.me|api\.whatsapp\.com\/send)/,
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
];

/**
 * Check if device is mobile
 */
function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Opens a URL with deep link support for popular apps on mobile
 * On desktop, opens the web version directly
 */
export function openWithDeepLink(url: string): void {
  // Check if running in Telegram Mini App
  const tgWebApp = window.Telegram?.WebApp as { 
    initData?: string; 
    openLink?: (url: string) => void 
  } | undefined;
  
  if (tgWebApp?.initData && tgWebApp?.openLink) {
    // In Telegram Mini App, use openLink for external URLs
    tgWebApp.openLink(url);
    return;
  }

  // Find matching config for deep link
  for (const config of deepLinkConfigs) {
    if (config.pattern.test(url)) {
      const id = config.extractId(url);
      if (id) {
        const webUrl = config.webUrl(id);
        
        // On mobile, try deep link with fallback
        if (isMobileDevice()) {
          const deepLink = config.deepLink(id);
          tryDeepLinkWithFallback(deepLink, webUrl);
          return;
        }
        
        // On desktop, just open web version
        window.open(webUrl, '_blank', 'noopener,noreferrer');
        return;
      }
    }
  }
  
  // No matching pattern - open as regular URL
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Attempts to open a deep link on mobile, falls back to web URL
 * Uses a simple timeout-based approach that works reliably
 */
function tryDeepLinkWithFallback(deepLink: string, webUrl: string): void {
  // Record start time
  const startTime = Date.now();
  
  // Set up fallback timer
  const fallbackTimer = setTimeout(() => {
    // Only open web URL if we're still on the page (app didn't open)
    // If app opened, the page would be hidden and timer cleared
    if (Date.now() - startTime < 2000) {
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    }
  }, 1500);
  
  // Listen for page becoming hidden (means app opened)
  const handleVisibilityChange = () => {
    if (document.hidden) {
      clearTimeout(fallbackTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  // Try to open deep link via location.href (most reliable on mobile)
  window.location.href = deepLink;
  
  // Clean up listener after timeout
  setTimeout(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
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
