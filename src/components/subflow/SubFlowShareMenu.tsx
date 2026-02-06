import { useState } from 'react';
import { Share2, X } from 'lucide-react';

interface SubFlowShareMenuProps {
  postId: string;
  postContent: string;
  imageUrl?: string | null;
}

const SHARE_OPTIONS = [
  {
    id: 'telegram',
    name: 'Telegram',
    icon: '📱',
    getUrl: (text: string, url: string) => 
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: '💬',
    getUrl: (text: string, url: string) => 
      `https://wa.me/?text=${encodeURIComponent(`${text}\n\n${url}`)}`,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: '📸',
    getUrl: () => null, // Instagram doesn't support direct sharing via URL
    action: 'copy',
  },
  {
    id: 'threads',
    name: 'Threads',
    icon: '🧵',
    getUrl: (text: string) => 
      `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`,
  },
];

export function SubFlowShareMenu({ postId, postContent, imageUrl }: SubFlowShareMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/subflow?post=${postId}`;
  const shareText = postContent.length > 100 
    ? postContent.substring(0, 100) + '...' 
    : postContent;

  const handleShare = async (option: typeof SHARE_OPTIONS[0]) => {
    if (option.action === 'copy' || !option.getUrl(shareText, shareUrl)) {
      // Copy to clipboard for Instagram
      try {
        await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Copy failed:', err);
      }
      return;
    }

    const url = option.getUrl(shareText, shareUrl);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all"
        aria-label="Поделиться"
      >
        <Share2 size={16} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Menu */}
          <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-xl shadow-lg p-2 min-w-[160px] animate-slide-up">
            <div className="flex items-center justify-between px-2 pb-2 border-b border-border mb-2">
              <span className="text-xs font-medium text-muted-foreground">Поделиться</span>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
            
            {SHARE_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => handleShare(option)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors"
              >
                <span className="text-lg">{option.icon}</span>
                <span className="font-medium">{option.name}</span>
                {option.id === 'instagram' && copied && (
                  <span className="ml-auto text-xs text-accent">Скопировано!</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
