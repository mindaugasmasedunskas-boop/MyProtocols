
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


    const { data, error } =
        await supabaseClient
            .from("suggestions")
            .select("*")
            .order(
                "created_at",
                { ascending: false }
            );


    const container =
        document.getElementById(
            "adminSuggestions"
        );


    if (error) {

        container.innerHTML = `
            <div class="message">
                Nepavyko gauti siūlymų:
                ${escapeHtml(error.message)}
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
                        id="suggestion-${suggestion.id}">

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
                                id="status-${suggestion.id}">

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
                                id="comment-${suggestion.id}"
                                placeholder="Administratoriaus komentaras..."
                            >${escapeHtml(
                                suggestion.admin_comment || ""
                            )}</textarea>

                        </div>


                        <div class="suggestion-buttons">

                            <button
                                class="primary"
                                onclick="saveSuggestion(
                                    '${suggestion.id}'
                                )">

                                Išsaugoti

                            </button>

                        </div>


                        <div
                            id="message-${suggestion.id}"
                            class="message">
                        </div>

                    </div>
                `;

            })
            .join("");
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


    const { error } =
        await supabaseClient
            .from("suggestions")
            .update({

                status: status,

                admin_comment:
                    adminComment || null,

                updated_at:
                    new Date().toISOString()

            })
            .eq("id", id);


    if (error) {

        message.textContent =
            "Nepavyko išsaugoti: " +
            error.message;

        return;
    }


    message.textContent =
        "Išsaugota.";


    setTimeout(
        () => showAdminSuggestions(),
        500
    );
}

