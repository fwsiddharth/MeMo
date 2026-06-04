-- Align the web Supabase database with the app schema.

-- Allow episode-level history rows.
ALTER TABLE public.history DROP CONSTRAINT IF EXISTS history_user_id_anime_id_key;
ALTER TABLE public.history DROP CONSTRAINT IF EXISTS history_user_anime_episode_key;
ALTER TABLE public.history
  ADD CONSTRAINT history_user_anime_episode_key UNIQUE (user_id, anime_id, episode_id);

-- Backfill public.users from existing auth accounts.
INSERT INTO public.users (id, username, display_name, email)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'username', split_part(email, '@', 1)),
  COALESCE(raw_user_meta_data->>'display_name', split_part(email, '@', 1)),
  email
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Reduce search_path risk for functions that still exist.
ALTER FUNCTION IF EXISTS public.find_user_by_username_or_email(text) SET search_path = public;
ALTER FUNCTION IF EXISTS public.is_username_available(text) SET search_path = public;
ALTER FUNCTION IF EXISTS public.handle_new_user() SET search_path = public;
ALTER FUNCTION IF EXISTS public.get_working_servers_for_anime(text, text) SET search_path = public;
ALTER FUNCTION IF EXISTS public.get_continue_watching(uuid, integer) SET search_path = public;
ALTER FUNCTION IF EXISTS public.get_completed_anime(uuid, integer) SET search_path = public;

DROP FUNCTION IF EXISTS public.get_working_servers_for_anime;
DROP FUNCTION IF EXISTS public.get_continue_watching;
DROP FUNCTION IF EXISTS public.get_completed_anime;
