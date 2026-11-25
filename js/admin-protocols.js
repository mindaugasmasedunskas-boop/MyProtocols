// =============================================
// ADMIN — ALGORITHMS (protocols): add, edit, delete
// =============================================
// The UI checks isAdmin(); the real protection is the server RLS policies
// protocols_admin_insert/update/delete (role = 'admin'). New rows are always
// "public": restricted rows are readable by nobody until auditor rights exist.

let protocolSavePending = false;

function showProtocolForm(id = null) {
    if (!isAdmin()) {
        showProtocolList();
        return;
    }
    const protocol = id === null ? null : protocols.find(p => String(p.id) === String(id));
    if (id !== null && !protocol) {
        showProtocolList();
        return;
    }
    const categories = [...new Set(protocols.map(p => p.category).filter(Boolean))];

    document.getElementById("app").innerHTML = `
        <div class="detail-buttons">
            <button id="protocolFormCancel">← Atšaukti</button>
        </div>
        <form id="protocolForm" class="suggestion-box" novalidate>
            <h2 id="protocolFormHeading"></h2>
            <input id="protocolTitle" type="text" placeholder="Pavadinimas">
            <input id="protocolCategory" type="text" placeholder="Kategorija (pvz., Kardiologija)" list="protocolCategories">
            <datalist id="protocolCategories"></datalist>
            <textarea id="protocolContent" placeholder="Algoritmo tekstas"></textarea>
            <button id="protocolSaveButton" type="submit" class="primary">Išsaugoti</button>
            <div id="protocolFormMessage" class="message" role="alert"></div>
        </form>
    `;
    document.getElementById("protocolFormHeading").textContent = protocol ? "Redaguoti algoritmą" : "Naujas algoritmas";
    document.getElementById("protocolTitle").value = protocol?.title || "";
    document.getElementById("protocolCategory").value = protocol?.category || "";
    document.getElementById("protocolContent").value = protocol?.content || "";
    const list = document.getElementById("protocolCategories");
    for (const category of categories) {
        const option = document.createElement("option");
        option.setAttribute("value", category);
        list.append(option);
    }
    document.getElementById("protocolFormCancel").addEventListener("click", () =>
        protocol ? showProtocol(protocol.id) : showProtocolList());
    document.getElementById("protocolForm").addEventListener("submit", event => {
        event.preventDefault();
        return saveProtocol(protocol ? protocol.id : null);
    });
}

async function saveProtocol(id) {
    if (protocolSavePending || !isAdmin()) return;
    const message = document.getElementById("protocolFormMessage");
    const button = document.getElementById("protocolSaveButton");
    const values = {
        title: document.getElementById("protocolTitle").value.trim(),
        category: document.getElementById("protocolCategory").value.trim(),
        content: document.getElementById("protocolContent").value.trim()
    };
    if (!values.title) {
        message.textContent = "Įrašykite pavadinimą.";
        return;
    }
    if (!values.content) {
        message.textContent = "Įrašykite algoritmo tekstą.";
        return;
    }

    protocolSavePending = true;
    if (button) button.disabled = true;
    message.textContent = "Saugoma...";
    const version = authVersion;
    let data;
    let error;
    try {
        const table = supabaseClient.from("protocols");
        const request = id === null
            ? table.insert({ ...values, access_level: "public" })
            : table.update(values).eq("id", id);
        // Return written rows: RLS can silently write nothing.
        ({ data, error } = await request.select("id"));
    } catch (requestError) {
        error = requestError;
    } finally {
        protocolSavePending = false;
        if (button) button.disabled = false;
    }
    if (version !== authVersion || !isAdmin() ||
        document.getElementById("protocolFormMessage") !== message) return;

    if (error) {
        message.textContent = "Nepavyko išsaugoti: " + errorText(error);
        return;
    }
    if (!Array.isArray(data) || !data.length) {
        message.textContent = "Nepavyko išsaugoti: įrašas nerastas arba neturite teisės jo keisti.";
        return;
    }

    const savedId = data[0].id;
    await loadProtocols();
    if (version !== authVersion) return;
    if (protocols.some(p => String(p.id) === String(savedId))) showProtocol(savedId);
    else showProtocolList();
}

async function deleteProtocol(id) {
    if (!isAdmin()) return;
    const protocol = protocols.find(p => String(p.id) === String(id));
    if (!protocol) return;
    if (!confirm(`Ištrinti algoritmą „${protocol.title}“? To atšaukti negalima.`)) return;

    const version = authVersion;
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient
            .from("protocols")
            .delete()
            .eq("id", id)
            .select("id"));
    } catch (requestError) {
        error = requestError;
    }
    if (version !== authVersion || !isAdmin()) return;

    if (error || !Array.isArray(data) || !data.length) {
        alert("Nepavyko ištrinti: " + (error ? errorText(error) : "įrašas nerastas arba neturite teisės jo trinti."));
        return;
    }
    await loadProtocols();
    if (version === authVersion) showProtocolList();
}
