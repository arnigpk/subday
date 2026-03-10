import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { LiquidGlassHeader } from '@/components/layout/LiquidGlassHeader';
import { SubFlowFeed } from '@/components/subflow/SubFlowFeed';
import { SubFlowCreatePostDialog } from '@/components/subflow/SubFlowCreatePostDialog';
import { SubFlowNotifications } from '@/components/subflow/SubFlowNotifications';
import { SubFlowFollowerCount } from '@/components/subflow/SubFlowFollowerCount';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { supabase } from '@/integrations/supabase/client';
import { Lock, ChevronUp, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import logo from '@/assets/logo.png';

export default function SubFlowPage() {
  const { hasActiveSubscription, isLoading: isSubLoading, refetch: refetchSubscription } = useSubscriptionStatus();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const { t } = useLanguage();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id || null));
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handlePostCreated = () => {
    setShowCreateDialog(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleRefresh = useCallback(async () => {
    await refetchSubscription();
    setRefreshTrigger(prev => prev + 1);
  }, [refetchSubscription]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!isSubLoading && !hasActiveSubscription) {
    return (
      <AppLayout>
        <PullToRefresh onRefresh={handleRefresh}>
          <div className="safe-area-top relative min-h-[calc(100vh-80px)]">
            <div className="px-4 py-4 blur-sm pointer-events-none select-none opacity-50">
              <div className="flex items-center justify-between mb-1">
                <h1 className="text-2xl font-black text-foreground">#subFlow</h1>
              </div>
              <p className="text-xs text-muted-foreground mb-4">{t('subflow.subtitle')}</p>
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="card-static">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-11 h-11 rounded-full bg-muted" />
                      <div>
                        <div className="h-4 w-24 bg-muted rounded" />
                        <div className="h-3 w-16 bg-muted rounded mt-1" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-4 w-full bg-muted rounded" />
                      <div className="h-4 w-3/4 bg-muted rounded" />
                    </div>
                    <div className="flex gap-2 mt-4">
                      {['💚', '👍', '🔥'].map((emoji) => (
                        <div key={emoji} className="px-3 py-1.5 bg-secondary rounded-full text-sm">{emoji}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <div className="text-center px-8 max-w-sm animate-slide-up">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Lock size={32} className="text-primary" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">{t('subflow.locked')}</h2>
                <p className="text-sm text-muted-foreground mb-6">{t('subflow.lockedDesc')}</p>
                <Link to="/packages">
                  <Button className="btn-accent w-full">{t('balance.subscribe')}</Button>
                </Link>
              </div>
            </div>
          </div>
        </PullToRefresh>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PullToRefresh onRefresh={handleRefresh}>
        <div ref={scrollContainerRef}>
          <LiquidGlassHeader>
            <div className="px-4 py-4 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black text-foreground">#subFlow</h1>
                <p className="text-xs text-muted-foreground">{t('subflow.subtitle')}</p>
              </div>
              <div className="flex items-center gap-2">
                <SubFlowNotifications userId={userId} onNavigateToPost={(postId) => setHighlightPostId(postId)} />
                <img src={logo} alt="subday" className="h-10 w-auto object-contain" />
              </div>
            </div>
          </LiquidGlassHeader>
          <div className="px-4 pt-2">

            <SubFlowFeed refreshTrigger={refreshTrigger} currentUserId={userId} shopFilter={null} hasActiveSubscription={hasActiveSubscription} highlightPostId={highlightPostId} onHighlightDone={() => setHighlightPostId(null)} />
          </div>
        </div>
      </PullToRefresh>

      {/* Floating Action Button - Create Post */}
      {!isSubLoading && hasActiveSubscription && (
        <button
          onClick={() => setShowCreateDialog(true)}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-accent text-accent-foreground font-semibold text-sm shadow-md transition-all duration-300 hover:scale-105 active:scale-95"
          style={{
            boxShadow: '0 0 12px hsl(var(--accent) / 0.3), 0 2px 8px hsl(var(--accent) / 0.2)',
          }}
        >
          <Pencil size={16} />
          Сделать пост
        </button>
      )}

      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-24 left-4 z-40 w-11 h-11 rounded-full bg-secondary/90 backdrop-blur-sm border border-border flex items-center justify-center text-foreground shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 animate-fade-in"
        >
          <ChevronUp size={20} />
        </button>
      )}

      {/* Create Post Dialog */}
      <SubFlowCreatePostDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onPostCreated={handlePostCreated}
      />
    </AppLayout>
  );
}
