import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { SubFlowFeed } from '@/components/subflow/SubFlowFeed';
import { SubFlowCreatePost } from '@/components/subflow/SubFlowCreatePost';
import { SubFlowShopFilter } from '@/components/subflow/SubFlowShopFilter';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SubFlowPage() {
  const { hasActiveSubscription, isLoading: isSubLoading } = useSubscriptionStatus();
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id || null);
    });
  }, []);

  const handlePostCreated = () => {
    setShowCreatePost(false);
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-foreground flex-shrink-0">#subFlow</h1>
            {/* Subscription badge for non-subscribers */}
            {!isSubLoading && !hasActiveSubscription && (
              <div className="px-2.5 py-1.5 bg-primary/10 border border-primary/20 rounded-xl flex items-center gap-2 flex-1">
                <Info size={14} className="text-primary flex-shrink-0" />
                <p className="text-[11px] text-foreground leading-snug">
                  Купите подписку что бы публиковать посты и сториз в #subFlow и видеть кто выкладывает посты и сториз
                </p>
              </div>
            )}
            {!isSubLoading && hasActiveSubscription && (
              <div className="flex-1" />
            )}
            {!isSubLoading && hasActiveSubscription && (
              <Button
                size="sm"
                onClick={() => setShowCreatePost(true)}
                className="rounded-xl btn-accent text-sm py-2 px-4 flex-shrink-0"
              >
                <Plus size={16} className="mr-1" />
                Сделать пост
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-4">Делись впечатлениями ☕</p>

          {/* Filter */}
          <div className="mb-4">
            <SubFlowShopFilter
              selectedShopId={selectedShopId}
              onShopChange={setSelectedShopId}
            />
          </div>

          {showCreatePost && (
            <SubFlowCreatePost
              onClose={() => setShowCreatePost(false)}
              onPostCreated={handlePostCreated}
            />
          )}

          <SubFlowFeed 
            refreshTrigger={refreshTrigger} 
            currentUserId={userId}
            shopFilter={selectedShopId}
          />
        </div>
      </div>
    </AppLayout>
  );
}
