

## Plan: AI Magic Wand for SubFlow Post Creation

### What We'll Build
A "magic wand" button in the SubFlow create post form that analyzes uploaded photos using AI and generates suggested caption text.

### How It Works
1. User uploads one or more photos
2. The wand icon becomes active (highlighted)
3. User taps the wand → AI analyzes the first image and suggests a caption
4. Suggested text appears in the textarea (user can edit or replace it)

### Technical Approach

**1. New Edge Function: `supabase/functions/subflow-ai-caption/index.ts`**
- Accepts a base64-encoded image
- Calls Lovable AI Gateway with `google/gemini-2.5-flash` (multimodal, fast, cheap)
- System prompt instructs the model to generate a short, engaging social media caption in Russian based on the image
- Returns the generated text
- Add to `config.toml` with `verify_jwt = false`

**2. Frontend Changes: `SubFlowCreatePost.tsx`**
- Add a `Wand2` (lucide) icon button next to the existing Image and MapPin buttons
- Button is disabled/dimmed when no images are loaded; active when `mediaFiles` has at least one image
- On click: convert the first image blob to base64, call the edge function via `supabase.functions.invoke('subflow-ai-caption', ...)`
- Show a loading spinner on the wand button while generating
- On success: set the textarea content to the AI-generated text (or append if text already exists)
- On error: show a toast

### UI Placement
The wand button sits in the bottom toolbar row, next to the Image and MapPin buttons — same styling, with a purple/accent highlight when active.

