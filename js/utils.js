
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


function escapeJs(value) {

    return String(value)

        .replaceAll("\\", "\\\\")
        .replaceAll("'", "\\'");
}