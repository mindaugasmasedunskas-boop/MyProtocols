
// =====================================================
// SECURITY
// =====================================================

function escapeHtml(value) {

    return String(value)

        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function errorText(error) {
    return error && typeof error.message === "string" && error.message
        ? error.message
        : "Netikėta klaida. Patikrinkite ryšį ir bandykite dar kartą.";
}


// =====================================================
// SEARCH
// =====================================================

// Lowercase and drop diacritics so "siulymas" matches "siūlymas".
function normalizeSearchText(value) {
    return String(value)
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase();
}
