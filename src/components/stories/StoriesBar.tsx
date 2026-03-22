import { useState, useRef, useEffect } from 'react';
import { Plus, User } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAllActiveStories, StoryUser } from '@/hooks/useAllActiveStories';
import { StoryCreateDialog } from './StoryCreateDialog';
import { StoryViewer } from './StoryViewer';
import { useVibration } from '@/hooks/useVibration';

interface StoriesBarProps {
  currentUserId: string | null;
  currentUserName?: string;
  currentUserAvatar?: string | null;
  refreshTrigger?: number;
}

const INSTAGRAM_GRADIENT = 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)';
const VIEWED_RING = 'hsl(var(--border))';

export function StoriesBar({ currentUserId, currentUserName, currentUserAvatar, refreshTrigger }: StoriesBarProps) {
  const { users, refresh, viewedStoryIds, isUserFullyViewed } = useAllActiveStories(currentUserId);
  const [showCreate, setShowCreate] = useState(false);
  const [viewerData, setViewerData] = useState<{ users: StoryUser[]; startUserIndex: number; startStoryIndex: number } | null>(null);
  const { vibrateShort } = useVibration();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (refreshTrigger) refresh();
  }, [refreshTrigger]);

  const currentUserHasStory = users.some(u => u.userId === currentUserId);

  const handleUserTap = (userIndex: number) => {
    const user = users[userIndex];
    if (!user) return;

    const firstUnviewedIndex = user.stories.findIndex((story) => !viewedStoryIds.has(story.id));
    const startStoryIndex = firstUnviewedIndex === -1 ? 0 : firstUnviewedIndex;

    vibrateShort();
    setViewerData({ users, startUserIndex: userIndex, startStoryIndex });
  };

  const handleAddStory = () => {
    vibrateShort();
    setShowCreate(true);
  };

  const handleStoryCreated = () => {
    setShowCreate(false);
    refresh();
  };

  const handleViewerClose = () => {
    setViewerData(null);
    refresh();
  };

  const truncateName = (name: string) => {
    if (name.length > 10) return name.slice(0, 9) + '…';
    return name;
  };

  const getRingStyle = (user: StoryUser) => {
    const viewed = isUserFullyViewed(user);
    return {
      background: viewed ? VIEWED_RING : INSTAGRAM_GRADIENT,
    };
  };

  return (
    <>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide px-4 py-3"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="relative">
            <button
              onClick={currentUserHasStory ? () => handleUserTap(0) : handleAddStory}
              className="block"
            >
              <div
                className="w-16 h-16 rounded-full p-[3px]"
                style={currentUserHasStory ? getRingStyle(users.find(u => u.userId === currentUserId)!) : { background: 'transparent' }}
              >
                <Avatar className={`w-full h-full ${currentUserHasStory ? 'ring-2 ring-background' : 'ring-2 ring-border'}`}>
                  {currentUserAvatar ? (
                    <AvatarImage src={currentUserAvatar} alt="You" className="object-cover" />
                  ) : null}
                  <AvatarFallback className="bg-muted">
                    <User size={24} className="text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
              </div>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleAddStory(); }}
              className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center ring-2 ring-background"
            >
              <Plus size={12} className="text-primary-foreground" />
            </button>
          </div>
          <span className="text-[10px] text-muted-foreground max-w-[60px] truncate text-center">
            {currentUserHasStory ? truncateName(currentUserName || 'Вы') : 'Ваша история'}
          </span>
        </div>

        {users.map((user, idx) => {
          if (user.userId === currentUserId) return null;
          return (
            <button
              key={user.userId}
              onClick={() => handleUserTap(idx)}
              className="flex flex-col items-center gap-1 shrink-0"
            >
              <div
                className="w-16 h-16 rounded-full p-[3px]"
                style={getRingStyle(user)}
              >
                <Avatar className="w-full h-full ring-2 ring-background">
                  {user.avatar ? (
                    <AvatarImage src={user.avatar} alt={user.name} className="object-cover" />
                  ) : null}
                  <AvatarFallback className="bg-muted">
                    <User size={24} className="text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
              </div>
              <span className="text-[10px] text-muted-foreground max-w-[60px] truncate text-center">
                {truncateName(user.name)}
              </span>
            </button>
          );
        })}
      </div>

      <StoryCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onStoryCreated={handleStoryCreated}
      />

      {viewerData && (
        <StoryViewer
          storyUsers={viewerData.users}
          startUserIndex={viewerData.startUserIndex}
          startStoryIndex={viewerData.startStoryIndex}
          currentUserId={currentUserId}
          onClose={handleViewerClose}
          onStoryDeleted={refresh}
        />
      )}
    </>
  );
}
