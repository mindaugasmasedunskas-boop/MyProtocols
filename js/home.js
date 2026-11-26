// Home screen: large buttons, one per section ("program").
// Sections that are not built yet open a "Ruošiama" placeholder.
const COMING_SOON = {
    codes: "Skubios pagalbos kodai",
    statistics: "Statistikos pildymas"
};

const HOME_TILES = [
    { key: "protocols", title: "Algoritmai", note: "Patvirtinti gydymo algoritmai" },
    { key: "codes", title: "Skubios pagalbos kodai", note: "Priėmimo skyriui" },
    { key: "calculators", title: "Skaičiuoklės", note: "Kreatinino klirensas ir kt." },
    { key: "statistics", title: "Statistikos pildymas", note: "Pildymo pavyzdžiai" },
    { key: "calendar", title: "Kalendorius", note: "Skelbimai ir budėjimų grafikai", login: true },
    { key: "contacts", title: "Kontaktai", note: "Pagrindiniai telefonai", login: true },
    { key: "suggestions", title: "Pasiūlymai", note: "Darbui gerinti", login: true },
    { key: "documents", title: "Dokumentai", note: "Susipažinimas ir pasirašymas", login: true }
];

// Tile order set by an admin, stored in app_settings ("home_tile_order").
let homeOrder = null;
let homeOrderLoaded = false;
let homeOrderLoading = false;
let homeReorder = null;
let homeSavePending = false;

function orderedTiles(order = homeReorder || homeOrder) {
    const keys = Array.isArray(order) ? order : [];
    const rank = tile => {
        const index = keys.indexOf(tile.key);
        return index < 0 ? keys.length + HOME_TILES.indexOf(tile) : index;
    };
    return HOME_TILES.slice().sort((a, b) => rank(a) - rank(b));
}

async function loadHomeOrder() {
    homeOrderLoading = true;
    try {
        const { data, error } = await supabaseClient
            .from("app_settings")
            .select("value")
            .eq("key", "home_tile_order")
            .maybeSingle();
        if (!error && Array.isArray(data?.value)) {
            homeOrder = data.value.filter(key => typeof key === "string");
        }
    } catch {
        // Keep the default order; the home screen must work without settings.
    } finally {
        homeOrderLoaded = true;
        homeOrderLoading = false;
    }
}

async function saveHomeOrder(message, button) {
    if (!isAdmin() || !homeReorder || homeSavePending) return;
    homeSavePending = true;
    button.disabled = true;
    message.textContent = "Saugoma...";
    const version = authVersion;
    const order = homeReorder.slice();
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient
            .from("app_settings")
            .upsert({ key: "home_tile_order", value: order, updated_at: new Date().toISOString() })
            .select("key"));
    } catch (requestError) {
        error = requestError;
    } finally {
        homeSavePending = false;
        button.disabled = false;
    }
    if (version !== authVersion || !isAdmin()) return;
    if (error || !Array.isArray(data) || !data.length) {
        message.textContent = "Nepavyko išsaugoti: " + (error ? errorText(error) : "neturite teisės keisti nustatymų.");
        return;
    }
    homeOrder = order;
    homeReorder = null;
    showHome();
}

function openSection(key) {
    if (key === "suggestions") {
        // The form returns to the home screen and asks guests to log in.
        currentSection = "home";
        showSuggestionForm();
        return;
    }
    if (key === "contacts") {
        showContacts();
        return;
    }
    if (key === "calendar") {
        showCalendar();
        return;
    }
    currentSection = key;
    showProtocolList();
}

function showHome() {
    currentSection = "home";
    const app = document.getElementById("app");
    app.innerHTML = `
        <div class="topbar">${userAreaHtml()}</div>
        ${authErrorHtml()}
        ${adminAreaHtml()}
        <div id="homeTools"></div>
        <div class="home-grid" id="homeGrid"></div>
        <h3 class="home-group">Prisijungusiems darbuotojams</h3>
        <div class="home-grid" id="homeGridLogin"></div>
    `;
    renderDepartmentPicker();
    if (!isAdmin()) homeReorder = null;
    if (isAdmin()) {
        const tools = document.getElementById("homeTools");
        if (homeReorder) {
            tools.append(reorderBar("Tempkite mygtukus į norimą vietą.", saveHomeOrder, () => {
                homeReorder = null;
                showHome();
            }));
        } else {
            const start = document.createElement("button");
            start.textContent = "Keisti mygtukų tvarką";
            start.addEventListener("click", () => {
                homeReorder = orderedTiles().map(tile => tile.key);
                showHome();
            });
            tools.append(start);
        }
    }
    if (!homeOrderLoaded && !homeOrderLoading) {
        loadHomeOrder().then(() => {
            if (currentSection === "home" && document.getElementById("homeGrid")) showHome();
        });
    }

    // Public sections first; login-only sections in their own row.
    for (const tile of orderedTiles()) {
        const grid = document.getElementById(tile.login ? "homeGridLogin" : "homeGrid");
        const locked = tile.login && !currentUser;
        const button = document.createElement("button");
        button.className = "tile" + (locked ? " locked" : "");
        button.setAttribute("data-section", tile.key);

        const title = document.createElement("span");
        title.className = "tile-title";
        title.textContent = tile.title;
        const note = document.createElement("span");
        note.className = "tile-note";
        note.textContent = locked ? "Reikia prisijungti" : tile.note;
        button.append(title, note);

        if (COMING_SOON[tile.key]) {
            const badge = document.createElement("span");
            badge.className = "tile-badge";
            badge.textContent = "Ruošiama";
            button.append(badge);
        }
        if (homeReorder) {
            makeDraggable(button, tile.key, (from, to) => {
                homeReorder = moveKey(homeReorder, from, to);
                showHome();
            });
        } else {
            button.addEventListener("click", () => locked ? showLogin() : openSection(tile.key));
        }
        grid.append(button);
    }
}

function showComingSoon(key) {
    const app = document.getElementById("app");
    app.innerHTML = `
        <div class="topbar">${userAreaHtml()}</div>
        ${authErrorHtml()}
        <nav class="sections" id="sectionNav"></nav>
        <div class="empty">
            <h2 id="comingSoonTitle"></h2>
            <p>Ši skiltis ruošiama.</p>
        </div>
    `;
    document.getElementById("comingSoonTitle").textContent = COMING_SOON[key] || "";
    renderSectionNav();
}
