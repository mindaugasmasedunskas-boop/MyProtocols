let protocols = [];
let currentCategory = "Visi";
let protocolRequestVersion = 0;
let protocolsLoading = false;
let protocolsError = "";
// Which main view is open: "home" (tiles), "protocols", "contacts" or a
// section that is not built yet (see COMING_SOON in home.js).
let currentSection = "home";

// Every section view starts with a way back to the home screen.
function renderSectionNav() {
    const nav = document.getElementById("sectionNav");
    if (!nav) return;
    const button = document.createElement("button");
    button.textContent = "← Pradžia";
    button.addEventListener("click", () => { currentSection = "home"; showProtocolList(); });
    nav.append(button);
}

function canReadProtocol(protocol) {
    // Individual auditor permissions are not implemented yet. Admin status
    // deliberately does not grant restricted access. Unknown levels are denied.
    return protocol?.access_level === "public";
}

function clearProtocols() {
    protocolRequestVersion += 1;
    protocols = [];
    currentCategory = "Visi";
    protocolsError = "";
    protocolsLoading = false;
}

async function loadProtocols() {
    const requestVersion = ++protocolRequestVersion;
    const sessionVersion = authVersion;
    protocols = [];
    protocolsLoading = true;
    protocolsError = "";
    try {
        const { data, error } = await supabaseClient
            .from("protocols")
            .select("id,title,category,content,access_level")
            .eq("access_level", "public")
            .order("title");
        if (error) throw error;
        if (requestVersion !== protocolRequestVersion || sessionVersion !== authVersion) return false;
        // Defense in depth for an unexpected response. This does not replace RLS.
        protocols = (data || []).filter(canReadProtocol);
        return true;
    } catch (error) {
        if (requestVersion !== protocolRequestVersion || sessionVersion !== authVersion) return false;
        protocols = [];
        protocolsError = "Nepavyko gauti protokolų: " + errorText(error);
        return false;
    } finally {
        if (requestVersion === protocolRequestVersion && sessionVersion === authVersion) {
            protocolsLoading = false;
        }
    }
}

async function reloadProtocols() {
    const version = authVersion;
    const pending = loadProtocols();
    showProtocolList();
    await pending;
    if (version === authVersion) showProtocolList();
}

function selectCategory(category) {
    currentCategory = category;
    showProtocolList();
}

function renderProtocols() {
    const list = document.getElementById("protocolList");
    if (!list) return;

    if (authLoading || protocolsLoading) {
        list.innerHTML = '<div class="empty" role="status">Kraunama...</div>';
        return;
    }
    if (protocolsError) {
        list.innerHTML = `
            <div class="message" role="alert">${escapeHtml(protocolsError)}</div>
            <button onclick="reloadProtocols()">Bandyti dar kartą</button>
        `;
        return;
    }

    const search = normalizeSearchText(document.getElementById("searchInput")?.value.trim() || "");
    const filtered = protocols.filter(protocol => {
        if (!canReadProtocol(protocol)) return false;
        const categoryMatch = currentCategory === "Visi" || protocol.category === currentCategory;
        const text = normalizeSearchText(`${protocol.title || ""} ${protocol.category || ""} ${protocol.content || ""}`);
        return categoryMatch && (!search || text.includes(search));
    });

    list.replaceChildren();
    if (!filtered.length) {
        list.innerHTML = '<div class="empty">Protokolų nerasta.</div>';
        return;
    }
    for (const protocol of filtered) {
        const card = document.createElement("div");
        card.className = "protocol";
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        const category = document.createElement("div");
        category.className = "category";
        category.textContent = protocol.category || "";
        const title = document.createElement("h2");
        title.textContent = protocol.title || "";
        card.append(category, title);
        card.addEventListener("click", () => showProtocol(protocol.id));
        card.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                showProtocol(protocol.id);
            }
        });
        list.append(card);
    }
}

function showProtocol(id) {
    const protocol = protocols.find(p => String(p.id) === String(id) && canReadProtocol(p));
    if (!protocol || authLoading || logoutPending) {
        showProtocolList();
        return;
    }
    document.getElementById("app").innerHTML = `
        <div class="detail-buttons">
            <button onclick="showProtocolList()">← Grįžti</button>
            <button id="copyProtocolButton" class="primary">Kopijuoti tekstą</button>
        </div>
        <div class="detail">
            <div class="category">${escapeHtml(protocol.category || "")}</div>
            <h2>${escapeHtml(protocol.title || "")}</h2>
            <div class="detail-content">${escapeHtml(protocol.content || "")}</div>
        </div>
    `;
    document.getElementById("copyProtocolButton").addEventListener("click", () => copyProtocol(protocol.id));
}

async function copyProtocol(id) {
    const protocol = protocols.find(p => String(p.id) === String(id) && canReadProtocol(p));
    if (!protocol || authLoading || logoutPending) return;
    try {
        await navigator.clipboard.writeText(protocol.content || "");
        alert("Tekstas nukopijuotas.");
    } catch {
        alert("Nepavyko nukopijuoti teksto.");
    }
}

// Shared by every section so auth/logout errors are never hidden.
function authErrorHtml() {
    if (!authError) return "";
    return `<div class="message" role="alert">${escapeHtml(authError)}</div>
        ${!logoutPending && !logoutFailed ? '<button onclick="startApp()">Bandyti dar kartą</button>' : ""}`;
}

function userAreaHtml() {
    let userArea;
    if (logoutPending || logoutFailed) {
        userArea = `<button onclick="logout()" ${logoutPending ? "disabled" : ""}>
            ${logoutPending ? "Atsijungiama..." : "Bandyti atsijungti dar kartą"}
        </button>`;
    } else if (currentUser) {
        userArea = `
            <span class="user-info">${escapeHtml(currentUser.email || "")}${isAdmin() ? " (admin)" : ""}</span>
            <button onclick="logout()">Atsijungti</button>
        `;
    } else {
        userArea = `<button onclick="showLogin()" ${authLoading ? "disabled" : ""}>Prisijungti</button>`;
    }
    return userArea;
}

function adminAreaHtml() {
    return isAdmin() ? `
        <div class="admin-box">
            <strong>Administratoriaus režimas</strong>
            <div style="margin-top:8px;">Galite peržiūrėti naudotojų pasiūlymus.</div>
            <div class="admin-actions">
                <button class="primary" onclick="showAdminSuggestions()">Gauti siūlymai</button>
            </div>
        </div>
    ` : "";
}

// Main view router. Auth refreshes and "back" buttons call this, so the
// user stays in the section they opened.
function showProtocolList() {
    if (currentSection === "home") {
        showHome();
        return;
    }
    if (currentSection === "contacts") {
        showContacts();
        return;
    }
    if (COMING_SOON[currentSection]) {
        showComingSoon(currentSection);
        return;
    }
    const app = document.getElementById("app");
    const categories = ["Visi", ...new Set(protocols.filter(canReadProtocol).map(p => p.category).filter(Boolean))];
    if (!categories.includes(currentCategory)) currentCategory = "Visi";
    const userArea = userAreaHtml();

    app.innerHTML = `
        <div class="topbar">${userArea}</div>
        ${authErrorHtml()}
        <nav class="sections" id="sectionNav"></nav>
        <input id="searchInput" class="search" type="text" placeholder="Ieškoti protokolo..." oninput="renderProtocols()">
        <div class="categories" id="categoryButtons"></div>
        <div id="protocolList"></div>
    `;

    renderSectionNav();
    const categoryButtons = document.getElementById("categoryButtons");
    for (const category of categories) {
        const button = document.createElement("button");
        button.className = "category-button" + (category === currentCategory ? " active" : "");
        button.textContent = category;
        button.addEventListener("click", () => selectCategory(category));
        categoryButtons.append(button);
    }
    renderProtocols();
}
