import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AiAssistantButtonProps {
  onClick: () => void;
}

export function AiAssistantButton({ onClick }: AiAssistantButtonProps) {
  return (
    <Button
      onClick={onClick}
      size="icon"
      className="fixed left-4 bottom-28 z-40 h-12 w-12 rounded-full shadow-lg bg-primary hover:bg-primary/90 animate-in fade-in slide-in-from-bottom-4 duration-500"
      aria-label="AI-помощник"
    >
      <MessageCircle className="h-5 w-5" />
    </Button>
  );
}
