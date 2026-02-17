-- Allow all authenticated users to read profiles (needed for SubFlow, comments, stories etc.)
-- Drop the restrictive self-only policy first
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Create a broader policy: any authenticated user can see profiles
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);
