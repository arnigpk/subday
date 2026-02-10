import { ReactNode, useState } from 'react';
import { BottomNav } from './BottomNav';
import { AiAssistantButton } from '@/components/chat/AiAssistantButton';
import { AiAssistantChat } from '@/components/chat/AiAssistantChat';

interface AppLayoutProps {
  children: ReactNode;
  hideNav?: boolean;
}

export function AppLayout({ children, hideNav = false }: AppLayoutProps) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <main className={`${hideNav ? '' : 'pb-24'}`}>
        {children}
      </main>
      {!hideNav && (
        <>
          <AiAssistantButton onClick={() => setChatOpen(true)} />
          <AiAssistantChat open={chatOpen} onOpenChange={setChatOpen} />
          <BottomNav />
        </>
      )}
    </div>
  );
}
