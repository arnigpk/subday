import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { SubFlowFeed } from '@/components/subflow/SubFlowFeed';
import { SubFlowCreatePost } from '@/components/subflow/SubFlowCreatePost';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { supabase } from '@/integrations/supabase/client';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SubFlowPage() {
  const { hasActiveSubscription, isLoading: isSubLoading } = useSubscriptionStatus();
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-black text-foreground bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">subFlow</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Делись впечатлениями ☕</p>
            </div>
            {!isSubLoading && hasActiveSubscription && (
              <Button
                size="sm"
                onClick={() => setShowCreatePost(true)}
                className="rounded-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity shadow-lg"
              >
                <Plus size={16} className="mr-1" />
                Сделать пост
              </Button>
            )}
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
          />
        </div>
      </div>
    </AppLayout>
  );
}
