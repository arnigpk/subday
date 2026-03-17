import { useState, useRef } from 'react';
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

export function StoriesBar({ currentUserId, currentUserName, currentUserAvatar, refreshTrigger }: StoriesBarProps) {
  const { users, refresh } = useAllActiveStories(currentUserId);
  const [showCreate, setShowCreate] = useState(false);
  const [viewerData, setViewerData] = useState<{ users: StoryUser[]; startUserIndex: number } | null>(null);
  const { vibrateShort } = useVibration();
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentUserHasStory = users.some(u => u.userId === currentUserId);

  const handleUserTap = (userIndex: number) => {
    vibrateShort();
    setViewerData({ users, startUserIndex: userIndex });
  };

  const handleAddStory = () => {
    vibrateShort();
    setShowCreate(true);
  };

  const handleStoryCreated = () => {
    setShowCreate(false);
    refresh();
  };

  const truncateName = (name: string) => {
    if (name.length > 10) return name.slice(0, 9) + '…';
    return name;
  };

  return (
    <>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide px-4 py-3"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Current user - add story */}
        <button
          onClick={currentUserHasStory ? () => handleUserTap(0) : handleAddStory}
          className="flex flex-col items-center gap-1 shrink-0"
        >
          <div className="relative">
            <div className={`w-16 h-16 rounded-full ${currentUserHasStory ? 'p-[3px]' : ''}`}
              style={currentUserHasStory ? {
                background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'
              } : undefined}
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
            {!currentUserHasStory && (
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center ring-2 ring-background">
                <Plus size={12} className="text-primary-foreground" />
              </div>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground max-w-[60px] truncate text-center">
            {currentUserHasStory ? truncateName(currentUserName || 'Вы') : 'Ваша история'}
          </span>
        </button>

        {/* Other users with stories */}
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
                style={{
                  background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'
                }}
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

      {/* Create dialog */}
      <StoryCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onStoryCreated={handleStoryCreated}
      />

      {/* Viewer */}
      {viewerData && (
        <StoryViewer
          storyUsers={viewerData.users}
          startUserIndex={viewerData.startUserIndex}
          currentUserId={currentUserId}
          onClose={() => setViewerData(null)}
          onStoryDeleted={refresh}
        />
      )}
    </>
  );
}
