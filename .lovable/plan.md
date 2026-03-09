

## Plan: Clickable post link in notifications

**Problem**: When a user receives a reaction/comment notification, there's no way to navigate to the specific post.

**Approach**: Make the entire notification row clickable (not just the word "пост"). Tapping a notification with a `post_id` will close the Sheet, scroll the feed, and highlight the target post. For `follow` type (no post), the row stays non-clickable.

This is better than just making the word "пост" clickable because:
- Larger tap target (better mobile UX)
- More intuitive — users expect to tap the whole notification
- Follows patterns from Instagram/Telegram

### Implementation

**1. Add scroll-to-post mechanism**

- Accept a new prop `onNavigateToPost: (postId: string) => void` in `SubFlowNotifications`
- Pass it from `SubFlowPage` where the feed lives
- In `SubFlowFeed`, expose a `scrollToPost(postId)` method via `useImperativeHandle` + `forwardRef`, or simpler: use a state `highlightPostId` passed as prop
- When `highlightPostId` changes, the target `SubFlowPost` scrolls into view with `scrollIntoView({ behavior: 'smooth' })` and briefly highlights (pulse animation)

**2. SubFlowNotifications changes**

- When a notification with `post_id` is tapped: close the Sheet, call `onNavigateToPost(post_id)`
- Add a subtle chevron or visual cue for clickable notifications
- Add preview text snippet (first ~40 chars of post content) fetched alongside notifications to give more context

**3. SubFlowPage orchestration**

- Add `highlightPostId` state
- Pass it to `SubFlowFeed` as prop
- Pass `onNavigateToPost` callback to `SubFlowNotifications` that sets this state and closes the sheet

**4. SubFlowFeed / SubFlowPost changes**

- `SubFlowPost` accepts optional `isHighlighted` prop
- When `isHighlighted` becomes true, use `useEffect` + `ref.scrollIntoView()` and apply a brief glow/pulse CSS animation
- `SubFlowFeed` matches `highlightPostId` against each post; if the post isn't loaded yet, trigger a fetch for that specific post and prepend it

### Files to edit
- `src/components/subflow/SubFlowNotifications.tsx` — add click handler, close sheet, call callback
- `src/pages/SubFlowPage.tsx` — add `highlightPostId` state, wire props
- `src/components/subflow/SubFlowFeed.tsx` — accept `highlightPostId`, pass to posts, fetch if missing
- `src/components/subflow/SubFlowPost.tsx` — accept `isHighlighted`, scroll into view + highlight animation

