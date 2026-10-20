let currentUser = null;
let currentProfile = null;


function showLogin() {

    const app =
        document.getElementById("app");


    app.innerHTML = `

        <div class="login-box">

            <h2>Prisijungimas</h2>


            <input
                id="email"
                type="email"
                placeholder="El. paštas"
            >


            <input
                id="password"
                type="password"
                placeholder="Slaptažodis"
            >


            <button
                class="primary"
                onclick="login()">

                Prisijungti

            </button>


            <button
                onclick="showProtocolList()">

                Atšaukti

            </button>


            <div
                id="loginMessage"
                class="message">
            </div>

        </div>
    `;
}


async function login() {

    const email =
        document
            .getElementById("email")
            .value
            .trim();


    const password =
        document
            .getElementById("password")
            .value;


    const message =
        document.getElementById(
            "loginMessage"
        );


    if (!email || !password) {

        message.textContent =
            "Įveskite el. paštą ir slaptažodį.";

        return;
    }


    const { data, error } =
        await supabaseClient.auth
            .signInWithPassword({

                email: email,
                password: password

            });


    if (error) {

        message.textContent =
            "Prisijungti nepavyko: " +
            error.message;

        return;
    }


    currentUser = data.user;

    await loadProfile();

    showProtocolList();
}


// =====================================================
// LOGOUT
// =====================================================

async function logout() {

    await supabaseClient.auth.signOut();

    currentUser = null;
    currentProfile = null;

    showProtocolList();
}


// =====================================================
// START
// =====================================================

async function startApp() {

    const {
        data: { session }
    } = await supabaseClient.auth.getSession();

    if (session && session.user) {

        currentUser = session.user;

        await loadProfile();
    }

    await loadProtocols();

    showProtocolList();
}


// =====================================================
// PROFILE
// =====================================================

async function loadProfile() {

    if (!currentUser) {
        currentProfile = null;
        return;
    }

    const { data, error } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();

    if (error) {

        console.error(
            "Nepavyko gauti profilio:",
            error
        );

        currentProfile = null;
        return;
    }

    currentProfile = data;
}


function isAdmin() {

    return (
        currentUser &&
        currentProfile &&
        currentProfile.role === "admin"
    );
}

