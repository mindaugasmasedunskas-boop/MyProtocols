let protocols = [];
let currentCategory = "Visi";

// =====================================================
// PROTOCOLS
// =====================================================

async function loadProtocols() {

    const { data, error } =
        await supabaseClient
            .from("protocols")
            .select("*")
            .order("title");

    if (error) {

        console.error(
            "Nepavyko gauti protokolų:",
            error
        );

        protocols = [];
        return;
    }

    protocols = data || [];
}

function selectCategory(category) {

    currentCategory = category;

    showProtocolList();
}

function renderProtocols() {

    const list =
        document.getElementById("protocolList");

    if (!list) return;


    const searchInput =
        document.getElementById("searchInput");

    const search =
        searchInput
            ? searchInput.value.trim().toLowerCase()
            : "";


    const filtered =
        protocols.filter(protocol => {

            const categoryMatch =
                currentCategory === "Visi" ||
                protocol.category === currentCategory;


            const searchableText = `
                ${protocol.title || ""}
                ${protocol.category || ""}
                ${protocol.content || ""}
            `.toLowerCase();


            const searchMatch =
                !search ||
                searchableText.includes(search);


            return categoryMatch && searchMatch;
        });


    if (filtered.length === 0) {

        list.innerHTML = `
            <div class="empty">
                Protokolų nerasta.
            </div>
        `;

        return;
    }


    list.innerHTML =
        filtered
            .map(protocol => `

                <div
                    class="protocol"
                    onclick="showProtocol('${protocol.id}')">

                    <div class="category">
                        ${escapeHtml(protocol.category || "")}
                    </div>

                    <h2>
                        ${escapeHtml(protocol.title || "")}
                    </h2>

                </div>

            `)
            .join("");
}


// =====================================================
// PROTOCOL DETAIL
// =====================================================

function showProtocol(id) {

    const protocol =
        protocols.find(
            p => String(p.id) === String(id)
        );

    if (!protocol) return;


    const app =
        document.getElementById("app");


    app.innerHTML = `

        <div class="detail-buttons">

            <button onclick="showProtocolList()">
                ← Grįžti
            </button>

            <button
                class="primary"
                onclick="copyProtocol('${protocol.id}')">

                Kopijuoti tekstą

            </button>

        </div>


        <div class="detail">

            <div class="category">
                ${escapeHtml(protocol.category || "")}
            </div>

            <h2>
                ${escapeHtml(protocol.title || "")}
            </h2>

            <div class="detail-content">${escapeHtml(protocol.content || "")}</div>

        </div>
    `;
}


async function copyProtocol(id) {

    const protocol =
        protocols.find(
            p => String(p.id) === String(id)
        );

    if (!protocol) return;


    try {

        await navigator.clipboard.writeText(
            protocol.content || ""
        );

        alert("Tekstas nukopijuotas.");

    } catch {

        alert(
            "Nepavyko nukopijuoti teksto."
        );
    }
}


function showProtocolList() {

    const app =
        document.getElementById("app");

    const categories =
        [
            "Visi",
            ...new Set(
                protocols
                    .map(p => p.category)
                    .filter(Boolean)
            )
        ];

    let userArea = "";

    if (currentUser) {

        userArea = `
            <span class="user-info">
                ${escapeHtml(currentUser.email || "")}
                ${isAdmin() ? " (admin)" : ""}
            </span>

            <button onclick="logout()">
                Atsijungti
            </button>
        `;

    } else {

        userArea = `
            <button onclick="showLogin()">
                Prisijungti
            </button>
        `;
    }


    let adminArea = "";

    if (isAdmin()) {

        adminArea = `
            <div class="admin-box">

                <strong>
                    Administratoriaus režimas
                </strong>

                <div style="margin-top:8px;">
                    Galite valdyti protokolus ir naudotojų pasiūlymus.
                </div>

                <div class="admin-actions">

                    <button
                        class="primary"
                        onclick="showAdminSuggestions()">
                        Gauti siūlymai
                    </button>

                </div>

            </div>
        `;
    }


    app.innerHTML = `

        <div class="topbar">
            ${userArea}
        </div>

        ${adminArea}

        <input
            id="searchInput"
            class="search"
            type="text"
            placeholder="Ieškoti protokolo..."
            oninput="renderProtocols()"
        >

        <div class="categories">

            ${categories.map(category => `

                <button
                    class="category-button
                    ${category === currentCategory ? "active" : ""}"
                    onclick="selectCategory('${escapeJs(category)}')">

                    ${escapeHtml(category)}

                </button>

            `).join("")}

            <button onclick="showSuggestionForm()">
                Siūlymai
            </button>

        </div>

        <div id="protocolList"></div>
    `;

    renderProtocols();
}