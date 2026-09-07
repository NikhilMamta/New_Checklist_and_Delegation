import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://kfdtcqjkesvdfzncfbns.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_XvSW_BICw33KESpeQyAfkw_6Z2OpEWA";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
