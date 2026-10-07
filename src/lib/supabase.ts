import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://yyyqwiauonyonnqvoozu.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Pr-YAWBnzp9_Qjnf5cFqJw_cjdr0WsJ';

const url = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL) as string | undefined;
const key = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY
) as string | undefined;

export const supabase = url && key ? createClient(url, key) : null;
