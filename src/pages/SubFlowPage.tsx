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
          <div className="flex items-start justify-between mb-4 gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-foreground">#subFlow</h1>
              {/* Subscription badge for non-subscribers */}
              {!isSubLoading && !hasActiveSubscription && (
                <div className="px-2 py-1 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-1.5">
                  <Info size={12} className="text-primary flex-shrink-0" />
                  <p className="text-[10px] text-foreground leading-tight max-w-[180px]">
                    Купите подписку что бы публиковать посты и сториз
                  </p>
                </div>
              )}
            </div>
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
          <p className="text-xs text-muted-foreground -mt-3 mb-4">Делись впечатлениями ☕</p>

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
