# Memory: features/subflow-social-network-v8
Updated: just now

#subFlow is a fully public real-time social network for sharing coffee experiences with a Gen Z/Alpha aesthetic.

## Visibility & Access
- All users (including non-subscribers) can see the full feed: posts, stories, comments, author names, and avatars.
- **Subscriptions required for**: posting, adding stories, and commenting.
- Non-subscribers see a CTA banner: "Купите подписку чтобы публиковать посты, сториз и комментарии в #subFlow".

## Nickname System
- Users can set a "Псевдоним #subFlow" (SubFlow nickname) in their profile settings.
- If a nickname is set, it displays instead of the user's real name in posts, comments, and stories.
- The nickname field is stored in `profiles.subflow_nickname`.

## Reactions
- All users can react with: 💚, 👍, 🔥, 🚀, ⚡️.
- Limit: 2 reactions per post per user.

## Content Features
- Posts support text and up to 5 photos in a responsive carousel.
- Authors can edit post content within a 60-minute window after creation.

## Technical
- Feed uses Supabase Realtime for instant updates.
- Infinite scroll for pagination.
- Shop filtering is disabled.
