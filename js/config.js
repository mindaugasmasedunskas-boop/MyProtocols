const SUPABASE_URL =
    "https://makkjcxrsnopzgkdhhhl.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_vHdmimWhVuVxo1lp3wvwXw_2mgOf2Yi";

let supabaseClient = null;
let supabaseInitializationError = "";
try {
    if (!window.supabase) {
        throw new Error("Nepavyko įkelti prisijungimo bibliotekos. Patikrinkite ryšį ir atnaujinkite puslapį.");
    }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (error) {
    supabaseInitializationError = error && error.message
        ? error.message
        : "Nepavyko inicializuoti prisijungimo bibliotekos.";
}
