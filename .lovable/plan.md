

## Plan: Instagram-style Stories Bar in #subFlow

### What exists today
- Database tables: `stories`, `story_views`, `story_likes` (all with RLS)
- Storage bucket: `subflow-images` (public)
- Components: `StoryAvatar` (shows ring on avatar if user has story), `StoryViewer` (fullscreen viewer with progress bars, likes, delete)
- Hook: `useStoriesCache` with batch prefetch
- Stories auto-expire at 24h via `expires_at` column

### What needs to be built

**1. New component: `StoriesBar`** (`src/components/stories/StoriesBar.tsx`)
- Horizontal scrollable row at top of SubFlow feed (like Instagram screenshot 1)
- First item = current user's avatar with "+" button to add a story
- Remaining items = other users who have active stories, fetched in one query
- Each circle: avatar with gradient ring (like Instagram), truncated name below (max ~10 chars)
- Tapping opens the `StoryViewer` but enhanced to chain across users

**2. New component: `StoryCreateDialog`** (`src/components/stories/StoryCreateDialog.tsx`)
- Triggered by tapping the "+" on current user's story circle
- Image picker, compress, upload to `subflow-images` bucket
- Insert row into `stories` table with `expires_at = now() + 24h`

**3. Enhance `StoryViewer`** 
- Accept all stories grouped by user (not just one user's stories)
- Progress bars show segments per current user's stories
- When one user's stories end, auto-advance to next user's stories
- 10 seconds per story (currently 5s)
- Smooth morph-in animation (reuse pattern from `SubFlowImageViewer`)
- Owner sees delete button (bottom-right)
- Non-owner sees like button and close button (top-right X)
- Left/right tap navigation within user, then cross-user

**4. New hook: `useAllActiveStories`** (`src/hooks/useAllActiveStories.ts`)
- Single query: fetch all active stories joined with profiles for name/avatar
- Group by user_id, ordered by created_at
- Returns `{ users: [{userId, name, avatar, stories[]}], refresh }`

**5. Integrate into `SubFlowPage.tsx`**
- Add `<StoriesBar>` between the header and the feed
- Pass current userId and refresh trigger

### Data flow
```text
stories table (existing)
  + profiles join (name, avatar)
       |
  useAllActiveStories hook
       |
  StoriesBar (horizontal scroll)
       |
  tap -> StoryViewer (enhanced, cross-user chaining)
       |
  "+" -> StoryCreateDialog -> upload -> insert story row
```

### Technical details

- **Timer**: Change from 5000ms to 10000ms in StoryViewer
- **Cross-user chaining**: StoryViewer receives a flat array of all stories (ordered by user groups). Progress bars reset per user group. When last story of user N ends, advance to user N+1's first story.
- **Morph animation**: Use `createPortal` + transform animation from source rect (same pattern as SubFlowImageViewer)
- **Name truncation**: CSS `max-w-[60px] truncate text-center text-[10px]`
- **Gradient ring**: CSS gradient border mimicking Instagram's orange-pink-purple ring for users with unseen stories
- **Storage**: Reuse `subflow-images` bucket for story uploads
- **No new DB tables needed** -- all tables exist

### Files to create/modify
| File | Action |
|------|--------|
| `src/components/stories/StoriesBar.tsx` | Create |
| `src/components/stories/StoryCreateDialog.tsx` | Create |
| `src/components/stories/StoryViewer.tsx` | Modify (10s timer, cross-user, morph animation) |
| `src/hooks/useAllActiveStories.ts` | Create |
| `src/pages/SubFlowPage.tsx` | Add StoriesBar between header and feed |

