// Documents library (stage 1): logged-in staff can search and open files;
// admins upload and delete. Server protection: RLS on public.documents
// (read: authenticated, write: admin) and storage policies on the private
// "documents" bucket. A SHA-256 of each file is stored for stage 2
// ("Susipažinau"), which must reference the exact file version.

const DOCUMENT_TYPES = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx"
};
const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
const DOCUMENT_CATEGORIES = ["Pareigybinės instrukcijos", "Tvarkos", "Instrukcijos", "Įsakymai"];

let documentsList = [];
let documentsLoaded = false;
let documentsLoading = false;
let documentsError = "";
let documentCategory = "Visi";
let documentSavePending = false;

function clearDocuments() {
    documentsList = [];
    documentsLoaded = false;
    documentsError = "";
}

async function loadDocuments() {
    documentsLoading = true;
    documentsError = "";
    const version = authVersion;
    try {
        const { data, error } = await supabaseClient
            .from("documents")
            .select("id,title,category,file_path,file_name,created_at")
            .order("title");
        if (version !== authVersion) return;
        if (error) throw error;
        documentsList = data || [];
        documentsLoaded = true;
    } catch (error) {
        if (version !== authVersion) return;
        clearDocuments();
        documentsError = "Nepavyko gauti dokumentų: " + errorText(error);
    } finally {
        if (version === authVersion) documentsLoading = false;
    }
}

async function showDocuments() {
    if (!currentUser || authLoading || logoutPending || logoutFailed) {
        clearDocuments();
        if (!currentUser) {
            currentSection = "home";
            showHome();
            return;
        }
    }
    currentSection = "documents";
    document.getElementById("app").innerHTML = `
        <div class="topbar">${userAreaHtml()}</div>
        ${authErrorHtml()}
        <nav class="sections" id="sectionNav"></nav>
        <input id="documentSearch" class="search" type="text" placeholder="Ieškoti dokumento...">
        <div class="categories" id="documentCategories"></div>
        <div id="documentList"></div>
    `;
    renderSectionNav();
    if (isAdmin()) {
        const add = document.createElement("button");
        add.className = "primary";
        add.textContent = "+ Įkelti dokumentą";
        add.addEventListener("click", showDocumentForm);
        document.getElementById("sectionNav").append(add);
    }
    document.getElementById("documentSearch").addEventListener("input", renderDocuments);
    renderDocuments();

    if (!documentsLoaded && !documentsLoading) {
        await loadDocuments();
        if (currentSection === "documents" && document.getElementById("documentList")) renderDocuments();
    }
}

function renderDocuments() {
    const list = document.getElementById("documentList");
    const categoryBox = document.getElementById("documentCategories");
    if (!list || !categoryBox) return;
    categoryBox.replaceChildren();
    if (documentsLoading || (!documentsLoaded && !documentsError)) {
        list.innerHTML = '<div class="empty" role="status">Kraunama...</div>';
        return;
    }
    if (documentsError) {
        list.innerHTML = `<div class="message" role="alert">${escapeHtml(documentsError)}</div>`;
        const retry = document.createElement("button");
        retry.textContent = "Bandyti dar kartą";
        retry.addEventListener("click", () => { clearDocuments(); showDocuments(); });
        list.append(retry);
        return;
    }

    const categories = ["Visi", ...[...new Set(documentsList.map(d => d.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "lt"))];
    if (!categories.includes(documentCategory)) documentCategory = "Visi";
    for (const category of categories) {
        const button = document.createElement("button");
        button.className = "category-button" + (category === documentCategory ? " active" : "");
        button.textContent = category;
        button.addEventListener("click", () => { documentCategory = category; renderDocuments(); });
        categoryBox.append(button);
    }

    const search = normalizeSearchText(document.getElementById("documentSearch")?.value.trim() || "");
    const filtered = documentsList.filter(d =>
        (documentCategory === "Visi" || d.category === documentCategory) &&
        (!search || normalizeSearchText(`${d.title || ""} ${d.category || ""} ${d.file_name || ""}`).includes(search)));

    list.replaceChildren();
    if (!filtered.length) {
        list.innerHTML = `<div class="empty">${documentsList.length ? "Dokumentų nerasta." : "Dokumentų dar nėra."}</div>`;
        return;
    }
    for (const item of filtered) {
        const card = document.createElement("div");
        card.className = "protocol document-card";
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("data-document", String(item.id));
        const category = document.createElement("div");
        category.className = "category";
        category.textContent = item.category || "";
        const title = document.createElement("h2");
        title.textContent = item.title || "";
        const meta = document.createElement("div");
        meta.className = "cal-muted";
        meta.textContent = (item.file_name || "") + (item.created_at ? " · " + String(item.created_at).slice(0, 10) : "");
        card.append(category, title, meta);
        card.addEventListener("click", () => openDocument(item));
        card.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openDocument(item);
            }
        });
        if (isAdmin()) {
            const remove = document.createElement("button");
            remove.className = "link-button";
            remove.textContent = "Ištrinti";
            remove.addEventListener("click", event => {
                event.stopPropagation?.();
                return deleteDocument(item);
            });
            card.append(remove);
        }
        list.append(card);
    }
}

async function openDocument(item) {
    // Open the window during the click so popup blockers allow it.
    const win = window.open("about:blank", "_blank");
    try {
        const { data, error } = await supabaseClient.storage
            .from("documents")
            .createSignedUrl(item.file_path, 300);
        if (error || !data?.signedUrl) throw error || new Error("Nuoroda negauta.");
        if (win) {
            win.opener = null;
            win.location.href = data.signedUrl;
        }
    } catch (error) {
        if (win) win.close();
        alert("Nepavyko atidaryti dokumento: " + errorText(error));
    }
}

async function fileSha256(file) {
    try {
        if (!globalThis.crypto?.subtle || typeof file.arrayBuffer !== "function") return null;
        const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
    } catch {
        return null;
    }
}

function showDocumentForm() {
    if (!isAdmin()) return showDocuments();
    document.getElementById("app").innerHTML = `
        <div class="detail-buttons"><button id="documentCancel">← Atšaukti</button></div>
        <form id="documentForm" class="suggestion-box" novalidate>
            <h2>Įkelti dokumentą</h2>
            <label class="form-row">Failas (PDF, Word, Excel, iki 20 MB) <input id="documentFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx"></label>
            <input id="documentTitle" type="text" placeholder="Pavadinimas">
            <input id="documentCategory" type="text" placeholder="Kategorija" list="documentCategoryList">
            <datalist id="documentCategoryList"></datalist>
            <button id="documentSave" type="submit" class="primary">Įkelti</button>
            <div id="documentMessage" class="message" role="alert"></div>
        </form>
    `;
    const options = document.getElementById("documentCategoryList");
    for (const category of new Set([...DOCUMENT_CATEGORIES, ...documentsList.map(d => d.category).filter(Boolean)])) {
        const option = document.createElement("option");
        option.setAttribute("value", category);
        options.append(option);
    }
    const fileInput = document.getElementById("documentFile");
    fileInput.addEventListener("change", () => {
        const title = document.getElementById("documentTitle");
        const file = fileInput.files?.[0];
        if (file && !title.value.trim()) title.value = String(file.name || "").replace(/\.[^.]+$/, "");
    });
    document.getElementById("documentCancel").addEventListener("click", showDocuments);
    document.getElementById("documentForm").addEventListener("submit", event => {
        event.preventDefault();
        return saveDocument();
    });
}

async function saveDocument() {
    if (!isAdmin() || documentSavePending) return;
    const message = document.getElementById("documentMessage");
    const button = document.getElementById("documentSave");
    const file = document.getElementById("documentFile").files?.[0];
    const title = document.getElementById("documentTitle").value.trim();
    const category = document.getElementById("documentCategory").value.trim();
    if (!file) { message.textContent = "Pasirinkite failą."; return; }
    const extension = DOCUMENT_TYPES[file.type];
    if (!extension) { message.textContent = "Leidžiami tik PDF, Word ir Excel failai."; return; }
    if (file.size > DOCUMENT_MAX_BYTES) { message.textContent = "Failas per didelis (daugiau nei 20 MB)."; return; }
    if (!title) { message.textContent = "Įrašykite pavadinimą."; return; }

    documentSavePending = true;
    if (button) button.disabled = true;
    message.textContent = "Įkeliama...";
    const version = authVersion;
    const path = `${new Date().getFullYear()}/${Date.now()}.${extension}`;
    let failure = null;
    try {
        const sha256 = await fileSha256(file);
        const upload = await supabaseClient.storage.from("documents")
            .upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) throw upload.error;
        const { data, error } = await supabaseClient.from("documents")
            .insert({ title, category, file_path: path, file_name: String(file.name || "").slice(0, 200), sha256 })
            .select("id");
        if (error || !Array.isArray(data) || !data.length) {
            // Do not leave an orphaned file when the row was not written.
            await supabaseClient.storage.from("documents").remove([path]);
            throw error || new Error("neturite teisės.");
        }
    } catch (error) {
        failure = error;
    } finally {
        documentSavePending = false;
        if (button) button.disabled = false;
    }
    if (version !== authVersion || !isAdmin() || document.getElementById("documentMessage") !== message) return;
    if (failure) {
        message.textContent = "Nepavyko įkelti: " + errorText(failure);
        return;
    }
    clearDocuments();
    await showDocuments();
}

async function deleteDocument(item) {
    if (!isAdmin() || !confirm(`Ištrinti dokumentą „${item.title}“? To atšaukti negalima.`)) return;
    const version = authVersion;
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient.from("documents").delete().eq("id", item.id).select("id"));
        if (!error && Array.isArray(data) && data.length) {
            await supabaseClient.storage.from("documents").remove([item.file_path]);
        }
    } catch (requestError) {
        error = requestError;
    }
    if (version !== authVersion) return;
    if (error || !Array.isArray(data) || !data.length) {
        alert("Nepavyko ištrinti: " + (error ? errorText(error) : "įrašas nerastas arba neturite teisės."));
        return;
    }
    clearDocuments();
    await showDocuments();
}
