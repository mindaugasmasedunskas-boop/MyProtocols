let currentUser = null;
let currentProfile = null;
let authVersion = 0;
let authLoading = false;
let authError = "";
let authSubscription = null;
let authSyncPromise = Promise.resolve();
let loginPending = false;
let logoutPending = false;
let logoutFailed = false;

function showLogin() {
    if (logoutPending || logoutFailed) return;

    document.getElementById("app").innerHTML = `
        <form id="loginForm" class="login-box" novalidate>
            <h2>Prisijungimas</h2>
            <input id="email" type="email" placeholder="El. paštas" autocomplete="username">
            <input id="password" type="password" placeholder="Slaptažodis" autocomplete="current-password">
            <button id="loginButton" type="submit" class="primary">Prisijungti</button>
            <button type="button" onclick="showProtocolList()">Atšaukti</button>
            <div id="loginMessage" class="message" role="alert"></div>
        </form>
    `;
    // A form lets Enter submit from either field; never reload the page.
    document.getElementById("loginForm").addEventListener("submit", event => {
        event.preventDefault();
        login();
    });
}

async function login() {
    if (loginPending || logoutPending || logoutFailed) return;
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const message = document.getElementById("loginMessage");
    const button = document.getElementById("loginButton");
    if (!emailInput || !passwordInput || !message) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
        message.textContent = "Įveskite el. paštą ir slaptažodį.";
        return;
    }

    loginPending = true;
    if (button) button.disabled = true;
    message.textContent = "Jungiamasi...";
    const version = authVersion;
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data?.user) throw new Error("Negauti prisijungusio naudotojo duomenys.");

        // The auth listener normally starts this refresh. Keep a fallback for
        // clients which have not delivered the event before signIn resolves.
        if (version === authVersion) {
            queueAuthSync(data.session || { user: data.user });
        }
        await authSyncPromise;
    } catch (error) {
        if (version !== authVersion) return;
        if (document.getElementById("loginMessage") === message) {
            message.textContent = "Prisijungti nepavyko: " + errorText(error);
        } else {
            authError = "Prisijungti nepavyko: " + errorText(error);
            showProtocolList();
        }
    } finally {
        loginPending = false;
        if (button) button.disabled = false;
    }
}

// Clear the UI and invalidate pending reads BEFORE awaiting any network call.
function beginAuthChange(user) {
    authVersion += 1;
    currentUser = user || null;
    currentProfile = null;
    authLoading = true;
    authError = "";
    clearProtocols();
    showProtocolList();
    return authVersion;
}

function queueAuthSync(session) {
    const user = session?.user || null;
    const version = beginAuthChange(user);

    // Do not await Supabase requests inside its synchronous auth callback:
    // defer them until the callback and the SDK's auth lock have completed.
    authSyncPromise = new Promise(resolve => {
        setTimeout(async () => {
            try {
                if (version !== authVersion) return;
                if (user) await loadProfile(user, version);
                if (version !== authVersion) return;
                await loadProtocols();
            } catch (error) {
                if (version === authVersion) {
                    authError = "Nepavyko atnaujinti prisijungimo būsenos: " + errorText(error);
                }
            } finally {
                if (version === authVersion) {
                    authLoading = false;
                    showProtocolList();
                }
                resolve();
            }
        }, 0);
    });
    return authSyncPromise;
}

async function logout() {
    if (logoutPending) return;
    logoutPending = true;
    logoutFailed = false;
    const version = beginAuthChange(null);

    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
    } catch (error) {
        if (version !== authVersion) return;
        // A failed server logout must not restore cached privileges or data.
        // Keep the UI closed and provide an explicit logout retry.
        logoutFailed = true;
        authError = "Atsijungti nepavyko. Sesija gali būti likusi aktyvi. Bandykite atsijungti dar kartą: " + errorText(error);
        logoutPending = false;
        authLoading = false;
        const pending = loadProtocols();
        showProtocolList();
        await pending;
        if (version === authVersion) showProtocolList();
        return;
    }
    logoutPending = false;
    await queueAuthSync(null);
}

async function refreshSession() {
    if (logoutPending || logoutFailed) return;
    const version = beginAuthChange(null);
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (version === authVersion) queueAuthSync(data?.session || null);
        await authSyncPromise;
    } catch (error) {
        if (version !== authVersion) return;
        authLoading = false;
        authError = "Nepavyko patikrinti prisijungimo būsenos: " + errorText(error);
        showProtocolList();
    }
}

async function startApp() {
    try {
        if (!supabaseClient) throw new Error(supabaseInitializationError);
        if (!authSubscription) {
            const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
                if (logoutPending) return;
                if (logoutFailed && session?.user) return;
                logoutFailed = false;
                queueAuthSync(session);
            });
            authSubscription = data.subscription;
        }
        await refreshSession();
    } catch (error) {
        beginAuthChange(null);
        authLoading = false;
        authError = "Nepavyko paleisti programos: " + errorText(error);
        showProtocolList();
    }
}

async function loadProfile(user = currentUser, version = authVersion) {
    if (!user || version !== authVersion) return;
    try {
        const { data, error } = await supabaseClient
            .from("profiles")
            .select("id,role")
            .eq("id", user.id)
            .maybeSingle();
        if (error) throw error;
        if (version !== authVersion) return;
        currentProfile = data;
        if (!data) {
            authError = "Naudotojo profilis nerastas. Administratoriaus teisės nesuteiktos.";
        }
    } catch (error) {
        if (version !== authVersion) return;
        currentProfile = null;
        authError = "Nepavyko gauti profilio. Administratoriaus teisės nesuteiktos: " + errorText(error);
    }
}

function isAdmin() {
    return Boolean(!authLoading && !logoutPending && !logoutFailed &&
        currentUser && currentProfile?.role === "admin");
}
