import { useState, useEffect, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { SubFlowFeed } from '@/components/subflow/SubFlowFeed';
import { SubFlowCreatePost } from '@/components/subflow/SubFlowCreatePost';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LockedView = memo(function LockedView() {
  return (
    <AppLayout>
      <div className="safe-area-top relative min-h-[calc(100vh-80px)]">
        {/* Blurred background content */}
        <div className="px-4 py-4 blur-sm pointer-events-none select-none opacity-50">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-black text-foreground">#subFlow</h1>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Делись впечатлениями ☕</p>
          
          {/* Fake posts for background effect */}
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
                    <div key={emoji} className="px-3 py-1.5 bg-secondary rounded-full text-sm">
                      {emoji}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="text-center px-8 max-w-sm animate-slide-up">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Lock size={32} className="text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Раздел закрыт</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Купите подписку чтобы увидеть уникальный раздел #subFlow и публиковать посты и комментарии.
            </p>
            <Link to="/packages">
              <Button className="btn-accent w-full">
                Оформить подписку
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
});

export default function SubFlowPage() {
  const {
    hasActiveSubscription,
    isLoading: isSubLoading
  } = useSubscriptionStatus();
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id || null);
    });
  }, []);

  const handlePostCreated = useCallback(() => {
    setShowCreatePost(false);
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleOpenCreate = useCallback(() => {
    setShowCreatePost(true);
  }, []);

  const handleCloseCreate = useCallback(() => {
    setShowCreatePost(false);
  }, []);

  // Show locked state for non-subscribers
  if (!isSubLoading && !hasActiveSubscription) {
    return <LockedView />;
  }

  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-black text-foreground">#subFlow</h1>
            {!isSubLoading && hasActiveSubscription && (
              <Button 
                size="sm" 
                onClick={handleOpenCreate} 
                className="rounded-xl btn-accent text-sm py-2 px-4"
              >
                <Plus size={16} className="mr-1" />
                Сделать пост
              </Button>
            )}
          </div>
          
          {/* Subtitle */}
          <p className="text-xs text-muted-foreground mb-4">Делись впечатлениями ☕</p>

          {showCreatePost && (
            <SubFlowCreatePost 
              onClose={handleCloseCreate} 
              onPostCreated={handlePostCreated} 
            />
          )}

          <SubFlowFeed 
            refreshTrigger={refreshTrigger} 
            currentUserId={userId} 
            shopFilter={null} 
            hasActiveSubscription={hasActiveSubscription} 
          />
        </div>
      </div>
    </AppLayout>
  );
}
