
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


// =====================================================
// DRAG AND DROP REORDERING (admin)
// =====================================================

let reorderDragKey = null;

// Return a copy of list with fromKey moved to the position of toKey.
function moveKey(list, fromKey, toKey) {
    const from = list.indexOf(fromKey);
    const to = list.indexOf(toKey);
    if (from < 0 || to < 0 || from === to) return list;
    const next = list.slice();
    next.splice(from, 1);
    next.splice(to, 0, fromKey);
    return next;
}

function makeDraggable(element, key, onMove) {
    element.setAttribute("draggable", "true");
    element.className += " reorderable";
    element.addEventListener("dragstart", event => {
        reorderDragKey = key;
        event.dataTransfer?.setData("text/plain", key);
    });
    element.addEventListener("dragover", event => event.preventDefault());
    element.addEventListener("drop", event => {
        event.preventDefault();
        if (reorderDragKey !== null && reorderDragKey !== key) onMove(reorderDragKey, key);
        reorderDragKey = null;
    });
}

// Save/cancel bar shown while an admin rearranges items.
function reorderBar(hint, onSave, onCancel) {
    const bar = document.createElement("div");
    bar.className = "reorder-bar";
    const text = document.createElement("span");
    text.textContent = hint;
    const save = document.createElement("button");
    save.className = "primary";
    save.textContent = "Išsaugoti tvarką";
    const cancel = document.createElement("button");
    cancel.textContent = "Atšaukti";
    const message = document.createElement("span");
    message.className = "message";
    message.setAttribute("id", "reorderMessage");
    save.addEventListener("click", () => onSave(message, save));
    cancel.addEventListener("click", onCancel);
    bar.append(text, save, cancel, message);
    return bar;
}
