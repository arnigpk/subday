

## Plan: Fullscreen Image Viewer with Zoom and Swipe-to-Dismiss

### What We're Building
A fullscreen image lightbox that opens when a user taps any image in a SubFlow post. Features:
- **Tap to open** image fullscreen with dark overlay
- **Swipe between images** in multi-image posts (carousel)
- **Double-tap to zoom** (toggle between 1x and 2x)
- **Pinch-to-zoom** support
- **Swipe down to dismiss** (drag down returns image to feed)
- Works for single and multi-image posts

### Implementation

**1. Create `SubFlowImageViewer` component** (`src/components/subflow/SubFlowImageViewer.tsx`)
- Fixed fullscreen overlay (`fixed inset-0 z-50 bg-black`)
- Receives `images: string[]`, `initialIndex: number`, `onClose: () => void`
- State: `currentIndex`, `scale` (1 or 2), `translateY` (for swipe-down dismiss), `translateX/Y` for panned position when zoomed
- **Double-tap detection**: Track last tap time; if < 300ms between taps, toggle scale between 1x and 2x, centering on tap point
- **Swipe down to dismiss**: When scale === 1, track vertical touch drag. If drag > 150px downward, close with opacity transition. Otherwise animate back.
- **Swipe left/right**: When scale === 1, horizontal swipe navigates between images (reuse similar logic to current carousel)
- **Pinch-to-zoom**: Track two-finger touch distance changes to adjust scale (1x-3x range)
- Dots indicator at bottom for multi-image posts
- Close button (X) in top-right corner as fallback

**2. Update `SubFlowPost` component** (`src/components/subflow/SubFlowPost.tsx`)
- Add state: `lightboxOpen: boolean`, `lightboxStartIndex: number`
- Remove `pointer-events-none` from the `<img>` tag (line 493)
- Add `onClick` handler on images to open lightbox with `currentImageIndex`
- Render `<SubFlowImageViewer>` when `lightboxOpen` is true
- Pass `images`, `initialIndex`, and `onClose` to viewer

### Technical Details
- Pure CSS transforms + React touch event handlers (no additional library needed)
- `touch-action: none` on the viewer to prevent browser scroll/zoom interference
- Use `will-change: transform` for smooth GPU-accelerated animations
- Body scroll lock when lightbox is open (`overflow: hidden` on body)
- The dismiss gesture: `translateY` mapped to opacity (more drag = more transparent background)

