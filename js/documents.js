// Documents library. Logged-in staff search and open files; admins upload,
// change and delete. Stage 2: a document may require acknowledgement
// ("Susipažinau") from an audience (positions and/or departments; empty means
// everyone). An acknowledgement is tied to the file version (sha256, or the
// file path when no hash exists) and can only be created, never changed.
// Server protection: RLS on public.documents and public.document_acks
// (supabase/sql/document-acks.sql) and storage policies on the private
// "documents" bucket. The audience is a convenience filter, not access control:
// every logged-in employee may read every document.

const DOCUMENT_TYPES = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx"
};
const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
const DOCUMENT_CATEGORIES = ["Pareigybinės instrukcijos", "Tvarkos", "Instrukcijos", "Įsakymai"];
const DOCUMENT_COLUMNS = "id,title,category,file_path,file_name,sha256,created_at,requires_ack,audience_groups,audience_departments,version_at";

let documentsList = [];
let myDocumentAcks = [];
let documentsLoaded = false;
let documentsVersion = 0;
let documentsLoading = false;
let documentsError = "";
let documentCategory = "Visi";
let documentSavePending = false;

function clearDocuments() {
    documentsList = [];
    myDocumentAcks = [];
    documentsLoaded = false;
    documentsVersion = 0;
    documentsError = "";
}

function documentsFresh() {
    return documentsLoaded && documentsVersion === authVersion;
}

function documentVersionKey(item) {
    return item.sha256 || item.file_path || "";
}

// Whether a profile belongs to the document's audience.
function documentForProfile(item, profile) {
    const groups = Array.isArray(item.audience_groups) ? item.audience_groups : [];
    const departments = Array.isArray(item.audience_departments) ? item.audience_departments : [];
    const own = Array.isArray(profile?.departments) ? profile.departments : [];
    return (!groups.length || groups.includes(profile?.staff_group || "")) &&
        (!departments.length || departments.some(d => own.includes(d)));
}

function documentAck(item) {
    return myDocumentAcks.find(a => a.document_id === item.id && a.version_key === documentVersionKey(item)) || null;
}

function documentPending(item) {
    return Boolean(item.requires_ack && currentProfile && documentForProfile(item, currentProfile) && !documentAck(item));
}

function formatDateTime(value) {
    const text = String(value || "");
    return text ? text.slice(0, 10) + (text.length > 15 ? " " + text.slice(11, 16) : "") : "";
}

async function loadDocuments() {
    documentsLoading = true;
    documentsError = "";
    const version = authVersion;
    try {
        const [docs, acks] = await Promise.all([
            supabaseClient.from("documents").select(DOCUMENT_COLUMNS).order("title"),
            supabaseClient.from("document_acks")
                .select("document_id,version_key,acknowledged_at")
                .eq("user_id", currentUser.id)
                .order("acknowledged_at")
        ]);
        if (version !== authVersion) return;
        if (docs.error) throw docs.error;
        if (acks.error) throw acks.error;
        documentsList = docs.data || [];
        myDocumentAcks = acks.data || [];
        documentsLoaded = true;
        documentsVersion = version;
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
        add.addEventListener("click", () => showDocumentForm());
        document.getElementById("sectionNav").append(add);
    }
    document.getElementById("documentSearch").addEventListener("input", renderDocuments);
    renderDocuments();

    if (!documentsFresh() && !documentsLoading) {
        await loadDocuments();
        if (currentSection === "documents" && document.getElementById("documentList")) renderDocuments();
    }
}

function renderDocuments() {
    const list = document.getElementById("documentList");
    const categoryBox = document.getElementById("documentCategories");
    if (!list || !categoryBox) return;
    categoryBox.replaceChildren();
    if (documentsLoading || (!documentsFresh() && !documentsError)) {
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

    const pendingCount = documentsList.filter(documentPending).length;
    const categories = ["Visi", ...(pendingCount ? ["Reikia susipažinti"] : []),
        ...[...new Set(documentsList.map(d => d.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "lt"))];
    if (!categories.includes(documentCategory)) documentCategory = "Visi";
    for (const category of categories) {
        const button = document.createElement("button");
        button.className = "category-button" + (category === documentCategory ? " active" : "");
        button.textContent = category === "Reikia susipažinti" ? `${category} (${pendingCount})` : category;
        button.addEventListener("click", () => { documentCategory = category; renderDocuments(); });
        categoryBox.append(button);
    }

    const search = normalizeSearchText(document.getElementById("documentSearch")?.value.trim() || "");
    const filtered = documentsList.filter(d =>
        (documentCategory === "Visi" || d.category === documentCategory ||
            (documentCategory === "Reikia susipažinti" && documentPending(d))) &&
        (!search || normalizeSearchText(`${d.title || ""} ${d.category || ""} ${d.file_name || ""}`).includes(search)))
        .sort((a, b) => Number(documentPending(b)) - Number(documentPending(a)));

    list.replaceChildren();
    if (!filtered.length) {
        list.innerHTML = `<div class="empty">${documentsList.length ? "Dokumentų nerasta." : "Dokumentų dar nėra."}</div>`;
        return;
    }
    for (const item of filtered) list.append(documentCard(item));
}

function documentCard(item) {
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
    const date = item.version_at || item.created_at;
    meta.textContent = (item.file_name || "") + (date ? " · " + String(date).slice(0, 10) : "");
    card.append(category, title, meta);

    if (item.requires_ack && documentForProfile(item, currentProfile)) {
        const ack = documentAck(item);
        const badge = document.createElement("span");
        badge.className = "ack-badge " + (ack ? "done" : "pending");
        badge.textContent = ack ? `Susipažinta ${String(ack.acknowledged_at || "").slice(0, 10)}` : "Reikia susipažinti";
        card.append(badge);
    }
    const open = () => item.requires_ack && documentForProfile(item, currentProfile)
        ? showDocumentDetail(item) : openDocument(item);
    card.addEventListener("click", open);
    card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open();
        }
    });
    if (isAdmin()) {
        const tools = document.createElement("div");
        tools.className = "document-tools";
        const tool = (text, handler) => {
            const button = document.createElement("button");
            button.className = "link-button";
            button.textContent = text;
            button.addEventListener("click", event => {
                event.stopPropagation?.();
                return handler();
            });
            tools.append(button);
        };
        if (item.requires_ack) tool("Kas susipažino", () => showDocumentAcks(item));
        tool("Keisti", () => showDocumentForm(item));
        tool("Ištrinti", () => deleteDocument(item));
        card.append(tools);
    }
    return card;
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
        return true;
    } catch (error) {
        if (win) win.close();
        alert("Nepavyko atidaryti dokumento: " + errorText(error));
        return false;
    }
}

// Document page with the acknowledgement: open the file, tick, confirm.
function showDocumentDetail(item, notice = "") {
    if (!currentUser) return showDocuments();
    currentSection = "documents";
    const ack = documentAck(item);
    document.getElementById("app").innerHTML = `
        <div class="topbar">${userAreaHtml()}</div>
        <div class="detail-buttons"><button id="documentBack">← Dokumentai</button></div>
        <div class="suggestion-box document-detail">
            <div class="category" id="documentDetailCategory"></div>
            <h2 id="documentDetailTitle"></h2>
            <div class="cal-muted" id="documentDetailMeta"></div>
            <button id="documentOpen" class="primary">Atidaryti dokumentą</button>
            <div id="documentAckBox"></div>
            <div id="documentAckMessage" class="message" role="alert"></div>
        </div>
    `;
    document.getElementById("documentDetailCategory").textContent = item.category || "";
    document.getElementById("documentDetailTitle").textContent = item.title || "";
    const date = item.version_at || item.created_at;
    document.getElementById("documentDetailMeta").textContent =
        (item.file_name || "") + (date ? " · versija " + String(date).slice(0, 10) : "");
    document.getElementById("documentBack").addEventListener("click", () => showDocuments());

    const box = document.getElementById("documentAckBox");
    const message = document.getElementById("documentAckMessage");
    if (notice) message.textContent = notice;
    if (ack) {
        appendText(box, "p", "ack-done", `Susipažinote ${formatDateTime(ack.acknowledged_at)}.`);
        document.getElementById("documentOpen").addEventListener("click", () => openDocument(item));
        return;
    }
    const label = document.createElement("label");
    label.className = "form-row ack-check";
    const check = document.createElement("input");
    check.setAttribute("type", "checkbox");
    check.setAttribute("id", "documentAckCheck");
    check.disabled = true;
    const text = document.createElement("span");
    text.textContent = "Susipažinau su dokumento turiniu";
    label.append(check, text);
    const confirmButton = document.createElement("button");
    confirmButton.setAttribute("id", "documentAckConfirm");
    confirmButton.className = "primary";
    confirmButton.textContent = "Patvirtinti";
    confirmButton.disabled = true;
    const hint = appendText(box, "p", "cal-muted", "Pirmiausia atidarykite dokumentą ir su juo susipažinkite.");
    box.append(label, confirmButton);

    document.getElementById("documentOpen").addEventListener("click", async () => {
        if (await openDocument(item)) {
            check.disabled = false;
            hint.textContent = "Perskaitę uždėkite varnelę ir spauskite „Patvirtinti“.";
        }
    });
    check.addEventListener("change", () => { confirmButton.disabled = !check.checked; });
    confirmButton.addEventListener("click", () => acknowledgeDocument(item, check, confirmButton, message));
}

async function acknowledgeDocument(item, check, button, message) {
    if (documentSavePending || !currentUser || !check.checked) return;
    documentSavePending = true;
    button.disabled = true;
    message.textContent = "Saugoma...";
    const version = authVersion;
    try {
        const { data, error } = await supabaseClient.from("document_acks")
            .insert({ document_id: item.id, version_key: documentVersionKey(item) })
            .select("id");
        // A repeated click may hit the unique constraint: it is already saved.
        if (error && error.code !== "23505") throw error;
        if (!error && (!Array.isArray(data) || !data.length)) throw new Error("neturite teisės.");
    } catch (error) {
        documentSavePending = false;
        if (version === authVersion && document.getElementById("documentAckMessage") === message) {
            message.textContent = "Nepavyko išsaugoti: " + errorText(error);
            button.disabled = !check.checked;
        }
        return;
    }
    documentSavePending = false;
    if (version !== authVersion) return;
    clearDocuments();
    await loadDocuments();
    if (version !== authVersion) return;
    const fresh = documentsList.find(d => d.id === item.id) || item;
    showDocumentDetail(fresh, "Ačiū, susipažinimas išsaugotas.");
    renderAckBanner();
}

// Home screen reminder about documents waiting for acknowledgement.
async function renderAckBanner() {
    const banner = document.getElementById("ackBanner");
    if (!banner || !currentUser || authLoading || logoutPending || logoutFailed) return;
    if (!documentsFresh() && !documentsLoading) await loadDocuments();
    const target = document.getElementById("ackBanner");
    if (!target || !documentsFresh()) return;
    const count = documentsList.filter(documentPending).length;
    target.replaceChildren();
    if (!count) return;
    const box = document.createElement("div");
    box.className = "ack-banner";
    appendText(box, "span", "", count === 1
        ? "Turite 1 dokumentą, su kuriuo reikia susipažinti."
        : `Turite ${count} dokumentus, su kuriais reikia susipažinti.`);
    const go = document.createElement("button");
    go.className = "primary";
    go.textContent = "Peržiūrėti";
    go.addEventListener("click", () => { documentCategory = "Reikia susipažinti"; showDocuments(); });
    box.append(go);
    target.append(box);
}

// Admin: who acknowledged the current version and who has not yet.
async function showDocumentAcks(item) {
    if (!isAdmin()) return showDocuments();
    document.getElementById("app").innerHTML = `
        <div class="topbar">${userAreaHtml()}</div>
        <div class="detail-buttons"><button id="documentBack">← Dokumentai</button></div>
        <div class="suggestion-box">
            <h2 id="ackTitle"></h2>
            <div class="cal-muted" id="ackAudience"></div>
            <div id="ackList"><div class="empty" role="status">Kraunama...</div></div>
        </div>
    `;
    document.getElementById("documentBack").addEventListener("click", () => showDocuments());
    document.getElementById("ackTitle").textContent = item.title || "";
    const groups = item.audience_groups?.length ? item.audience_groups.join(", ") : "visos pareigos";
    const departments = item.audience_departments?.length ? item.audience_departments.join(", ") : "visi skyriai";
    document.getElementById("ackAudience").textContent = `Kam skirta: ${groups}; ${departments}.`;
    const version = authVersion;
    let people;
    let acks;
    try {
        [people, acks] = await Promise.all([
            supabaseClient.from("profiles").select("id,full_name,username,email,staff_group,departments").order("full_name"),
            supabaseClient.from("document_acks").select("user_id,full_name,version_key,acknowledged_at")
                .eq("document_id", item.id).order("acknowledged_at")
        ]);
        if (people.error) throw people.error;
        if (acks.error) throw acks.error;
    } catch (error) {
        if (version !== authVersion) return;
        const list = document.getElementById("ackList");
        if (list) list.innerHTML = `<div class="message" role="alert">${escapeHtml("Nepavyko gauti duomenų: " + errorText(error))}</div>`;
        return;
    }
    if (version !== authVersion) return;
    const list = document.getElementById("ackList");
    if (!list) return;
    const current = (acks.data || []).filter(a => a.version_key === documentVersionKey(item));
    const byUser = new Map(current.map(a => [a.user_id, a]));
    const recipients = (people.data || []).filter(p => documentForProfile(item, p));
    const done = recipients.filter(p => byUser.has(p.id));
    list.replaceChildren();
    appendText(list, "p", "ack-summary", `Susipažino ${done.length} iš ${recipients.length}.`);
    const rows = [...recipients].sort((a, b) => Number(byUser.has(a.id)) - Number(byUser.has(b.id)));
    for (const person of rows) {
        const ack = byUser.get(person.id);
        const row = document.createElement("div");
        row.className = "ack-row " + (ack ? "done" : "pending");
        appendText(row, "span", "", person.full_name || person.username || person.email || "—");
        appendText(row, "span", "cal-muted", person.staff_group || "");
        appendText(row, "span", "", ack ? `Susipažino ${formatDateTime(ack.acknowledged_at)}` : "Nesusipažino");
        list.append(row);
    }
    // Acknowledgements of people outside the current audience stay visible.
    const others = current.filter(a => !recipients.some(p => p.id === a.user_id));
    for (const ack of others) {
        const row = document.createElement("div");
        row.className = "ack-row done";
        appendText(row, "span", "", ack.full_name || "—");
        appendText(row, "span", "cal-muted", "ne iš adresatų");
        appendText(row, "span", "", `Susipažino ${formatDateTime(ack.acknowledged_at)}`);
        list.append(row);
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

let documentFormAudience = null;

async function showDocumentForm(item = null) {
    if (!isAdmin()) return showDocuments();
    const editing = Boolean(item);
    document.getElementById("app").innerHTML = `
        <div class="detail-buttons"><button id="documentCancel">← Atšaukti</button></div>
        <form id="documentForm" class="suggestion-box" novalidate>
            <h2>${editing ? "Keisti dokumentą" : "Įkelti dokumentą"}</h2>
            <label class="field-label" for="documentFile">${editing ? "Nauja versija (nebūtina; įkėlus reikės susipažinti iš naujo)" : "Failas (PDF, Word, Excel, iki 20 MB)"}</label>
            <input id="documentFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx">
            <label class="field-label" for="documentTitle">Pavadinimas</label>
            <input id="documentTitle" type="text" placeholder="Pavadinimas">
            <label class="field-label" for="documentCategory">Kategorija</label>
            <input id="documentCategory" type="text" placeholder="Kategorija" list="documentCategoryList">
            <datalist id="documentCategoryList"></datalist>
            <label class="form-row ack-check"><input id="documentRequiresAck" type="checkbox"> <span>Reikia susipažinti</span></label>
            <div id="documentAudience"></div>
            <button id="documentSave" type="submit" class="primary">${editing ? "Išsaugoti" : "Įkelti"}</button>
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
    const titleInput = document.getElementById("documentTitle");
    const requiresAck = document.getElementById("documentRequiresAck");
    if (editing) {
        titleInput.value = item.title || "";
        document.getElementById("documentCategory").value = item.category || "";
        requiresAck.checked = Boolean(item.requires_ack);
    }
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file && !titleInput.value.trim()) titleInput.value = String(file.name || "").replace(/\.[^.]+$/, "");
    });
    document.getElementById("documentCancel").addEventListener("click", () => showDocuments());
    document.getElementById("documentForm").addEventListener("submit", event => {
        event.preventDefault();
        return saveDocument(item);
    });

    // Audience: positions and departments; nothing ticked means everyone.
    const audience = document.getElementById("documentAudience");
    documentFormAudience = null;
    let groups = DEFAULT_STAFF_GROUPS.slice();
    try {
        await ensureDepartments();
        const { data } = await supabaseClient.from("app_settings").select("value").eq("key", "staff_groups").maybeSingle();
        if (Array.isArray(data?.value)) groups = data.value.filter(g => typeof g === "string" && g.trim());
    } catch {
        // Keep the default positions.
    }
    if (document.getElementById("documentAudience") !== audience) return;
    appendText(audience, "div", "cal-muted", "Kam skirta – pareigos (nieko nepažymėjus – visoms):");
    const groupBoxes = [];
    for (const group of groups) {
        const row = document.createElement("label");
        row.className = "form-row";
        const box = document.createElement("input");
        box.setAttribute("type", "checkbox");
        box.setAttribute("data-group", group);
        box.checked = Boolean(item?.audience_groups?.includes(group));
        const text = document.createElement("span");
        text.textContent = group;
        row.append(box, text);
        audience.append(row);
        groupBoxes.push(box);
    }
    const departmentBox = document.createElement("div");
    departmentBox.setAttribute("id", "documentAudienceDepartments");
    audience.append(departmentBox);
    const readDepartments = departmentCheckboxes(departmentBox, item?.audience_departments || []);
    documentFormAudience = () => ({
        audience_groups: groupBoxes.filter(b => b.checked).map(b => b.getAttribute("data-group")),
        audience_departments: readDepartments()
    });
}

async function saveDocument(item = null) {
    if (!isAdmin() || documentSavePending) return;
    const editing = Boolean(item);
    const message = document.getElementById("documentMessage");
    const button = document.getElementById("documentSave");
    const file = document.getElementById("documentFile").files?.[0];
    const title = document.getElementById("documentTitle").value.trim();
    const category = document.getElementById("documentCategory").value.trim();
    const requiresAck = Boolean(document.getElementById("documentRequiresAck")?.checked);
    const audience = documentFormAudience ? documentFormAudience() : { audience_groups: [], audience_departments: [] };
    if (!file && !editing) { message.textContent = "Pasirinkite failą."; return; }
    const extension = file ? DOCUMENT_TYPES[file.type] : "";
    if (file && !extension) { message.textContent = "Leidžiami tik PDF, Word ir Excel failai."; return; }
    if (file && file.size > DOCUMENT_MAX_BYTES) { message.textContent = "Failas per didelis (daugiau nei 20 MB)."; return; }
    if (!title) { message.textContent = "Įrašykite pavadinimą."; return; }

    documentSavePending = true;
    if (button) button.disabled = true;
    message.textContent = file ? "Įkeliama..." : "Saugoma...";
    const version = authVersion;
    const path = file ? `${new Date().getFullYear()}/${Date.now()}.${extension}` : "";
    const fields = { title, category, requires_ack: requiresAck, ...audience };
    let failure = null;
    try {
        if (file) {
            const sha256 = await fileSha256(file);
            const upload = await supabaseClient.storage.from("documents")
                .upload(path, file, { contentType: file.type, upsert: false });
            if (upload.error) throw upload.error;
            Object.assign(fields, { file_path: path, file_name: String(file.name || "").slice(0, 200), sha256 });
            if (editing) fields.version_at = new Date().toISOString();
        }
        const request = editing
            ? supabaseClient.from("documents").update(fields).eq("id", item.id).select("id")
            : supabaseClient.from("documents").insert(fields).select("id");
        const { data, error } = await request;
        if (error || !Array.isArray(data) || !data.length) {
            // Do not leave an orphaned file when the row was not written.
            if (file) await supabaseClient.storage.from("documents").remove([path]);
            throw error || new Error("neturite teisės.");
        }
        // The previous version's file is no longer referenced.
        if (file && editing && item.file_path) {
            await supabaseClient.storage.from("documents").remove([item.file_path]);
        }
    } catch (error) {
        failure = error;
    } finally {
        documentSavePending = false;
        if (button) button.disabled = false;
    }
    if (version !== authVersion || !isAdmin() || document.getElementById("documentMessage") !== message) return;
    if (failure) {
        message.textContent = (file ? "Nepavyko įkelti: " : "Nepavyko išsaugoti: ") + errorText(failure);
        return;
    }
    clearDocuments();
    await showDocuments();
}

async function deleteDocument(item) {
    if (!isAdmin() || !confirm(`Ištrinti dokumentą „${item.title}“? Kartu bus ištrinti ir susipažinimo įrašai. To atšaukti negalima.`)) return;
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
