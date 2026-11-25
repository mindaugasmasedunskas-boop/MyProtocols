
// =====================================================
// ADMIN — SUGGESTIONS
// =====================================================

async function showAdminSuggestions() {

    if (!isAdmin()) {

        alert(
            "Ši funkcija skirta administratoriui."
        );

        return;
    }


    const app =
        document.getElementById("app");


    app.innerHTML = `

        <div class="detail-buttons">

            <button onclick="showProtocolList()">
                ← Grįžti
            </button>

        </div>

        <div class="admin-panel">

            <h2>Gauti siūlymai</h2>

            <div id="adminSuggestions">
                Kraunama...
            </div>

        </div>
    `;


    const version = authVersion;
    const expectedContainer = document.getElementById("adminSuggestions");
    let data, error;
    try {
        ({ data, error } = await supabaseClient
            .from("suggestions")
            .select("*")
            .order(
                "created_at",
                { ascending: false }
            ));
    } catch (requestError) {
        error = requestError;
    }
    if (version !== authVersion || !isAdmin() ||
        document.getElementById("adminSuggestions") !== expectedContainer) return;


    const container =
        document.getElementById(
            "adminSuggestions"
        );


    if (error) {

        container.innerHTML = `
            <div class="message">
                Nepavyko gauti siūlymų:
                ${escapeHtml(errorText(error))}
            </div>
        `;

        return;
    }


    const suggestions = data || [];


    if (suggestions.length === 0) {

        container.innerHTML = `
            <div class="empty">
                Siūlymų nėra.
            </div>
        `;

        return;
    }


    container.innerHTML =
        suggestions
            .map(suggestion => {

                const date =
                    suggestion.created_at
                        ? new Date(
                            suggestion.created_at
                        ).toLocaleString("lt-LT")
                        : "";


                return `

                    <div
                        class="suggestion-card"
                        id="suggestion-${escapeHtml(suggestion.id)}">

                        <h3>

                            ${escapeHtml(
                                suggestion.title || ""
                            )}

                            <span class="status-badge">
                                ${escapeHtml(
                                    statusLabel(
                                        suggestion.status
                                    )
                                )}
                            </span>

                        </h3>


                        <div class="suggestion-meta">

                            ${escapeHtml(
                                suggestion.email ||
                                "Neprisijungęs naudotojas"
                            )}

                            ${date ? " • " + escapeHtml(date) : ""}

                        </div>


                        <div class="suggestion-content">
${escapeHtml(suggestion.content || "")}
                        </div>


                        <div class="suggestion-controls">

                            <select
                                id="status-${escapeHtml(suggestion.id)}">

                                <option
                                    value="new"
                                    ${suggestion.status === "new" ? "selected" : ""}>
                                    Naujas
                                </option>

                                <option
                                    value="reviewing"
                                    ${suggestion.status === "reviewing" ? "selected" : ""}>
                                    Nagrinėjamas
                                </option>

                                <option
                                    value="accepted"
                                    ${suggestion.status === "accepted" ? "selected" : ""}>
                                    Priimtas
                                </option>

                                <option
                                    value="rejected"
                                    ${suggestion.status === "rejected" ? "selected" : ""}>
                                    Atmestas
                                </option>

                            </select>


                            <textarea
                                id="comment-${escapeHtml(suggestion.id)}"
                                placeholder="Administratoriaus komentaras..."
                            >${escapeHtml(
                                suggestion.admin_comment || ""
                            )}</textarea>

                        </div>


                        <div class="suggestion-buttons">

                            <button
                                class="primary"
                                data-save-suggestion>

                                Išsaugoti

                            </button>

                        </div>


                        <div
                            id="message-${escapeHtml(suggestion.id)}"
                            class="message">
                        </div>

                    </div>
                `;

            })
            .join("");
    container.querySelectorAll("[data-save-suggestion]").forEach((button, index) => {
        button.addEventListener("click", () => saveSuggestion(suggestions[index].id));
    });
}


function statusLabel(status) {

    switch (status) {

        case "reviewing":
            return "Nagrinėjamas";

        case "accepted":
            return "Priimtas";

        case "rejected":
            return "Atmestas";

        default:
            return "Naujas";
    }
}


async function saveSuggestion(id) {

    if (!isAdmin()) return;


    const status =
        document
            .getElementById(
                "status-" + id
            )
            .value;


    const adminComment =
        document
            .getElementById(
                "comment-" + id
            )
            .value
            .trim();


    const message =
        document.getElementById(
            "message-" + id
        );


    message.textContent =
        "Saugoma...";


    const version = authVersion;
    let error;
    let data;
    try {
        ({ data, error } = await supabaseClient
            .from("suggestions")
            .update({

                status: status,

                admin_comment:
                    adminComment || null,

                updated_at:
                    new Date().toISOString()

            })
            .eq("id", id)
            // Return changed rows: RLS or a deleted row yields an empty
            // result without an error, which must not look like success.
            .select("id"));
    } catch (requestError) {
        error = requestError;
    }
    if (version !== authVersion || !isAdmin() ||
        document.getElementById("message-" + id) !== message) return;


    if (error) {

        message.textContent =
            "Nepavyko išsaugoti: " +
            errorText(error);

        return;
    }

    if (!Array.isArray(data) || !data.length) {
        message.textContent =
            "Nepavyko išsaugoti: įrašas nerastas arba neturite teisės jo keisti.";
        return;
    }


    message.textContent =
        "Išsaugota.";


    setTimeout(
        () => {
            if (version === authVersion && isAdmin() &&
                document.getElementById("message-" + id) === message) showAdminSuggestions();
        },
        500
    );
}

