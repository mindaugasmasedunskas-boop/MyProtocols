// =====================================================
// SUGGESTION FORM
// =====================================================

function showSuggestionForm() {

    const app =
        document.getElementById("app");

    // Siūlymus gali teikti tik prisijungęs vartotojas
    if (!currentUser || authLoading || logoutPending || logoutFailed) {

        app.innerHTML = `

            <div class="detail-buttons">

                <button onclick="showProtocolList()">
                    ← Grįžti
                </button>

            </div>

            <div class="suggestion-box">

                <h2>Siūlymai</h2>

                <p>
                    Norėdami pateikti siūlymą,
                    turite prisijungti.
                </p>

                <button
                    class="primary"
                    onclick="showLogin()">
                    Prisijungti
                </button>

            </div>
        `;

        return;
    }


    app.innerHTML = `

        <div class="detail-buttons">

            <button onclick="showProtocolList()">
                ← Grįžti
            </button>

        </div>


        <div class="suggestion-box">

            <h2>Siūlymai</h2>

            <p>
                Čia galite pateikti pasiūlymą dėl naujo protokolo,
                esamo protokolo papildymo arba pastebėtos klaidos.
            </p>


            <input
                id="suggestionTitle"
                type="text"
                placeholder="Siūlymo pavadinimas..."
            >


            <textarea
                id="suggestionText"
                placeholder="Aprašykite savo siūlymą..."
            ></textarea>


            <button
                class="primary"
                onclick="sendSuggestion()">

                Siųsti siūlymą

            </button>


            <div
                id="suggestionMessage"
                class="message">
            </div>

        </div>
    `;
}


async function sendSuggestion() {

    // Papildoma apsauga:
    // neprisijungęs vartotojas siūlymo išsiųsti negali
    if (!currentUser || authLoading || logoutPending || logoutFailed) {
        showLogin();
        return;
    }


    const title =
        document
            .getElementById("suggestionTitle")
            .value
            .trim();


    const text =
        document
            .getElementById("suggestionText")
            .value
            .trim();


    const message =
        document.getElementById(
            "suggestionMessage"
        );


    if (!title) {

        message.textContent =
            "Įrašykite siūlymo pavadinimą.";

        return;
    }


    if (!text) {

        message.textContent =
            "Aprašykite siūlymą.";

        return;
    }


    const suggestion = {

        title: title,
        content: text,
        status: "new",
        user_id: currentUser.id,
        email: currentUser.email

    };


    const version = authVersion;
    let error;
    try {
        ({ error } = await supabaseClient
            .from("suggestions")
            .insert(suggestion));
    } catch (requestError) {
        error = requestError;
    }
    if (version !== authVersion ||
        document.getElementById("suggestionMessage") !== message) return;


    if (error) {

        message.textContent =
            "Nepavyko išsiųsti: " +
            errorText(error);

        return;
    }


    document
        .getElementById("suggestionTitle")
        .value = "";


    document
        .getElementById("suggestionText")
        .value = "";


    message.textContent =
        "Siūlymas sėkmingai išsiųstas.";
}
