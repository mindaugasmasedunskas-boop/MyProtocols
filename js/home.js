// Home screen: large buttons, one per section ("program").
// Sections that are not built yet open a "Ruošiama" placeholder.
const COMING_SOON = {
    codes: "Skubios pagalbos kodai",
    calculators: "Skaičiuoklės",
    statistics: "Statistikos pildymas",
    documents: "Dokumentai"
};

const HOME_TILES = [
    { key: "protocols", title: "Algoritmai", note: "Patvirtinti gydymo algoritmai" },
    { key: "codes", title: "Skubios pagalbos kodai", note: "Priėmimo skyriui" },
    { key: "calculators", title: "Skaičiuoklės", note: "Kreatinino klirensas ir kt." },
    { key: "statistics", title: "Statistikos pildymas", note: "Pildymo pavyzdžiai" },
    { key: "contacts", title: "Kontaktai", note: "Pagrindiniai telefonai" },
    { key: "suggestions", title: "Pasiūlymai", note: "Darbui gerinti", login: true },
    { key: "documents", title: "Dokumentai", note: "Susipažinimas ir pasirašymas", login: true }
];

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
        <div class="home-grid" id="homeGrid"></div>
    `;
    const grid = document.getElementById("homeGrid");
    for (const tile of HOME_TILES) {
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
        button.addEventListener("click", () => openSection(tile.key));
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
