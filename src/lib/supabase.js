import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const realtimeEnabled = Boolean(url && anonKey);
export const supabase = realtimeEnabled ? createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}}) : null;