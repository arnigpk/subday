import { MessageCircle } from 'lucide-react';

interface AiAssistantButtonProps {
  onClick: () => void;
}

export function AiAssistantButton({ onClick }: AiAssistantButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed left-2 bottom-28 z-40 h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md ring-1 ring-primary/10 animate-bounce-subtle hover:scale-105 active:scale-95 transition-transform duration-200"
      aria-label="Служба заботы"
    >
      <MessageCircle className="h-4 w-4" />
    </button>
  );
}
