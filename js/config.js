const SUPABASE_URL =
    "https://makkjcxrsnopzgkdhhhl.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_vHdmimWhVuVxo1lp3wvwXw_2mgOf2Yi";

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );