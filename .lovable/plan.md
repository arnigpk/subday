
# Comprehensive App Health Check and Performance Optimization

## 1. Database Health Check Results

All tables are operational and contain expected data:
- 21 users, 21 profiles, 20 user_stats (1 may need creation on next login)
- 5 shops, 5 subscription types, 3 ad banners
- 126 redemptions, 56 user subscriptions (7 active), 16 subflow posts
- 1 active story
- All RLS policies are properly configured
- Active subscriptions have valid future expiration dates

No database issues found.

## 2. Preloader GIF Issue (Shows Logo Instead of GIF)

**Root Cause**: The preloader uses `<img src={preloader.gif}>`. Some mobile browsers (especially Safari/WebKit on older iOS and some Android browsers) have issues with large GIF animations, or the GIF may fail to load and the browser falls back to showing nothing or a broken state. The user then sees the *next* screen (LoginScreen with logo.png) flash briefly before auth completes. This is NOT the preloader showing a logo -- it's the preloader finishing (2s timer) while auth is still loading, briefly showing the AuthScreen logo before the session resolves.

Actually, looking more carefully: the preloader shows for exactly 2 seconds (`isPreloaderDone`), but `isAuthLoading` and `isTelegramReady` also gate the loading screen. If auth resolves before the 2s timer, the preloader stays. But if the GIF itself fails to render (browser incompatibility), the user sees a blank white screen with no visual feedback.

**Fix**: Replace the raw `<img>` GIF approach with a more robust preloader:
- Add a CSS fallback animation (pulsing logo) that shows immediately
- Use the GIF as the primary display with an `onError` fallback to the CSS animation
- Add `<video>` element as an alternative for browsers that handle video better than large GIFs
- Ensure the GIF is preloaded in `index.html` via `<link rel="preload">`

## 3. Performance Optimizations

### 3.1 Lazy Loading Routes (High Impact)
Currently ALL pages are imported eagerly in App.tsx (30+ imports). This means the entire app bundle loads upfront, even pages the user may never visit (admin, partner).

**Fix**: Use `React.lazy()` + `Suspense` for route-level code splitting:
- Admin pages (6 pages) -- lazy loaded
- Partner pages (4 pages) -- lazy loaded
- Secondary pages (SubFlow, Streaks, Bonuses, GiftCoffee, History) -- lazy loaded
- Keep Home, Packages, Shops, Profile, ShopDetail eager (most visited)

### 3.2 Google Fonts Loading (Medium Impact)
The Inter font is loaded via `@import url(...)` in CSS, which is render-blocking.

**Fix**: Move to `<link rel="preconnect">` + `<link rel="stylesheet">` in `index.html` with `display=swap` (already set) for faster loading.

### 3.3 Preload Critical Assets (Medium Impact)
Add `<link rel="preload">` for the preloader GIF and logo in `index.html` to ensure they load before React renders.

### 3.4 Remove Unused CSS (Low Impact)
`src/App.css` contains default Vite boilerplate CSS (logo-spin, .card, .read-the-docs) that is not imported or used anywhere. Remove it.

### 3.5 Image Lazy Loading (Low Impact)
Shop gallery images and banner images in carousels are loaded eagerly. Add `loading="lazy"` to off-screen images (already done for SubFlow posts, extend to shop cards).

## Technical Implementation Plan

### Step 1: Fix Preloader Reliability
- In `App.tsx`: Wrap the GIF `<img>` with an `onError` handler that falls back to a CSS-animated logo
- Add `<link rel="preload" as="image" href="/assets/preloader.gif">` in `index.html`
- Use a `<picture>` or dual approach: try GIF first, CSS animation as fallback

### Step 2: Route-Level Code Splitting
- In `App.tsx`: Convert admin (6), partner (4), and secondary (5) page imports to `React.lazy()`
- Wrap `<Routes>` in `<Suspense fallback={<LoadingSpinner />}>`
- This should reduce initial bundle by ~40-50%

### Step 3: Optimize Font Loading
- Move Google Fonts `@import` from `index.css` to `index.html` as `<link>` tags
- Add `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`

### Step 4: Clean Up
- Delete `src/App.css` (unused boilerplate)
- Add `loading="lazy"` to shop card images in `ShopsPage.tsx` and `TopShopsCarousel.tsx`

### Step 5: Sync Check
- Verify all sections (app, admin, partner) use the same shared query keys and data fetching patterns (already confirmed -- all use `queryKeys.shops`, `prefetchShops`, etc.)

### Files to Modify
1. `index.html` -- preload assets, move font loading
2. `src/App.tsx` -- lazy routes, preloader fallback
3. `src/index.css` -- remove `@import` for fonts
4. `src/App.css` -- delete file
5. `src/pages/ShopsPage.tsx` -- add `loading="lazy"` to images
6. `src/components/home/TopShopsCarousel.tsx` -- add `loading="lazy"` to images

### Expected Results
- Initial JS bundle reduced by ~40% via code splitting
- Preloader works reliably across all mobile browsers
- Faster font rendering via preconnect
- Reduced render-blocking resources
