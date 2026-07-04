import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { LiquidGlassHeader } from '@/components/layout/LiquidGlassHeader';
import { StoriesBar } from '@/components/stories/StoriesBar';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { SubFlowFeed } from '@/components/subflow/SubFlowFeed';
import { SubFlowCreatePostDialog } from '@/components/subflow/SubFlowCreatePostDialog';
import { SubFlowNotifications } from '@/components/subflow/SubFlowNotifications';
import { SubFlowFollowerCount } from '@/components/subflow/SubFlowFollowerCount';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { useVibration } from '@/hooks/useVibration';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { useAllActiveStories } from '@/hooks/useAllActiveStories';
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
  const [userName, setUserName] = useState<string | undefined>();
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerStartUser, setStoryViewerStartUser] = useState(0);
  const [storyViewerStartStory, setStoryViewerStartStory] = useState(0);
  const { t } = useLanguage();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const playNotificationSound = useNotificationSound();
  const { vibrate } = useVibration();
  const { settings: notifSettings } = useNotificationSettings();
  const entryAlertFired = useRef(false);
  const { users: storyUsers, refresh: refreshStories, viewedStoryIds } = useAllActiveStories(userId);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profile) {
        setUserName(profile.name || undefined);
        setUserAvatar(profile.avatar_url);
      }
    });
  }, []);

  // Play sound + vibration on page entry if there are unread notifications
  useEffect(() => {
    if (!userId || entryAlertFired.current) return;
    const checkUnread = async () => {
      const { count } = await supabase
        .from('subflow_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      if (count && count > 0) {
        entryAlertFired.current = true;
        if (notifSettings.subflowSoundEnabled) playNotificationSound();
        if (notifSettings.vibrationEnabled) vibrate(3000);
      }
    };
    checkUnread();
  }, [userId, notifSettings, playNotificationSound, vibrate]);

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
          <div className="safe-area-top relative app-viewport-with-nav">
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

            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm px-6">
              <div className="text-center w-full max-w-sm animate-slide-up">
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
            <div className="px-4 py-4">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-black text-foreground">#subFlow</h1>
                <div className="flex items-center gap-1">
                <SubFlowFollowerCount userId={userId} />
                <SubFlowNotifications
                  userId={userId}
                  onNavigateToPost={(postId) => setHighlightPostId(postId)}
                  onOpenStory={(storyId) => {
                    // Find which user and story index this story belongs to
                    for (let ui = 0; ui < storyUsers.length; ui++) {
                      const si = storyUsers[ui].stories.findIndex(s => s.id === storyId);
                      if (si !== -1) {
                        setStoryViewerStartUser(ui);
                        setStoryViewerStartStory(si);
                        setStoryViewerOpen(true);
                        return;
                      }
                    }
                  }}
                />
                <img src={logo} alt="subday" className="h-10 w-auto object-contain" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t('subflow.subtitle')}</p>
            </div>
          </LiquidGlassHeader>

          {/* Stories Bar */}
          {hasActiveSubscription && (
            <StoriesBar
              currentUserId={userId}
              currentUserName={userName}
              currentUserAvatar={userAvatar}
              refreshTrigger={refreshTrigger}
            />
          )}

          <div className="px-4 pt-2 subflow-feed-safe-bottom">

            <SubFlowFeed refreshTrigger={refreshTrigger} currentUserId={userId} shopFilter={null} hasActiveSubscription={hasActiveSubscription} highlightPostId={highlightPostId} onHighlightDone={() => setHighlightPostId(null)} />
          </div>
        </div>
      </PullToRefresh>

      {/* Floating Action Button - Create Post */}
      {!isSubLoading && hasActiveSubscription && (
        <button
          onClick={() => setShowCreateDialog(true)}
          className="fixed app-floating-above-nav left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-5 py-3 rounded-full font-semibold text-sm text-foreground backdrop-blur-xl border border-border/40 transition-all duration-300 hover:scale-105 active:scale-95"
          style={{
            background: 'hsl(var(--background) / 0.65)',
            boxShadow: '0 4px 24px hsl(var(--foreground) / 0.08), 0 1px 3px hsl(var(--foreground) / 0.06), inset 0 1px 0 hsl(var(--background) / 0.5)',
          }}
        >
          <Pencil size={16} />
          {t('subflow.createPost') || 'Сделать пост'}
        </button>
      )}

      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed app-floating-above-nav-compact left-4 z-40 w-11 h-11 rounded-full backdrop-blur-xl border border-border/40 flex items-center justify-center text-foreground transition-all duration-300 hover:scale-105 active:scale-95 animate-fade-in"
          style={{
            background: 'hsl(var(--background) / 0.65)',
            boxShadow: '0 4px 24px hsl(var(--foreground) / 0.08), 0 1px 3px hsl(var(--foreground) / 0.06), inset 0 1px 0 hsl(var(--background) / 0.5)',
          }}
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

      {/* Story Viewer from notification */}
      {storyViewerOpen && storyUsers.length > 0 && (
        <StoryViewer
          storyUsers={storyUsers}
          startUserIndex={storyViewerStartUser}
          startStoryIndex={storyViewerStartStory}
          currentUserId={userId}
          onClose={() => setStoryViewerOpen(false)}
          onStoryDeleted={() => refreshStories()}
        />
      )}
    </AppLayout>
  );
}
