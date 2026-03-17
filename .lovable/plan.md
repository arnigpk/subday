## Plan: SubFlow Post Sharing with Content Lock Growth Hack

### Concept

Add a "Share" button to each SubFlow post that generates a visually appealing share card (image) with blurred/locked content and the subday logo. The card is generated client-side using HTML Canvas, then shared via the Web Share API (which covers Instagram Stories, WhatsApp Status, Telegram, etc. on mobile).

Each post already has a unique `id` (UUID). We need a public route `/subflow/post/:id` that shows the post (or a locked preview for non-subscribers).

### Technical Steps

#### 1. Add public route `/subflow/post/:id`

- Create `src/pages/SubFlowPostPage.tsx` — a public landing page
- If user is authenticated + has subscription → show full post
- If not → show blurred preview with CTA "Download subday app" + link to app stores / main page
- Update `App.tsx` to add the route
- Update `apple-app-site-association` and `assetlinks.json` to include `/subflow/post/*`

#### 2. Create share card generator

- New component `src/components/subflow/SubFlowShareCard.tsx`
- Uses HTML Canvas to render a share-ready image (1080x1920 story format):
  - Post text (truncated, partially visible)
  - If media exists: show blurred version with a lock icon overlay
  - subday logo prominently placed
  - "#subFlow" branding
  - QR code or short link at bottom
  - "Скачай subday чтобы увидеть" CTA text
- Export as PNG blob for sharing

#### 3. Add Share button to SubFlowPost

- Add a `Share` (or `Forward`) icon button in the post header/footer area
- On click:
  - Generate the share card image via canvas
  - Use `navigator.share({ files: [imageFile], text, url })` (Web Share API)
  - Fallback: copy link to clipboard if Web Share not available
- The shared URL will be `https://vhod.lovable.app/subflow/post/{postId}`

#### 4. Share card visual design

```text
┌──────────────────────┐
│     subday logo       │
│                       │
│   ┌─────────────┐    │
│   │  BLURRED     │    │
│   │  IMAGE/VIDEO │    │
│   │   🔒         │    │
│   └─────────────┘    │
│                       │
│  "Пост от @username"  │
│  "Текст поста час..." │
│                       │
│  ┌────────────────┐  │
│  │ Открой в subday │  │
│  └────────────────┘  │
│                       │
│  Скачать приложение     │
└──────────────────────┘
```

#### 5. Files to create/modify

- **Create**: `src/pages/SubFlowPostPage.tsx` — public post landing page
- **Create**: `src/components/subflow/SubFlowShareCard.ts` — canvas-based image generator utility
- **Modify**: `src/components/subflow/SubFlowPost.tsx` — add Share button
- **Modify**: `src/App.tsx` — add `/subflow/post/:id` route
- **Modify**: `public/.well-known/apple-app-site-association` — add path pattern
- **Modify**: `public/.well-known/assetlinks.json` — already covers all paths

#### 6. No database changes needed

Posts already have unique UUIDs. The `subflow_posts` table has public SELECT RLS policy (`true`), so the landing page can fetch any post.