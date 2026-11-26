// Contacts: public phone book, readable without login (RLS allows SELECT
// for anon and authenticated; only admins may change rows).
let contacts = [];
let contactsLoaded = false;
let contactsLoading = false;
let contactsError = "";
let contactsRequestVersion = 0;

// Only digits and a leading "+" may reach a tel: link.
function phoneHref(phone) {
    const digits = String(phone || "").replace(/[^\d+]/g, "");
    return /^\+?\d{3,}$/.test(digits) ? "tel:" + digits : "";
}

function emailHref(email) {
    const value = String(email || "").trim();
    return /^[^\s@<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]+$/.test(value) ? "mailto:" + value : "";
}

async function loadContacts() {
    const requestVersion = ++contactsRequestVersion;
    contactsLoading = true;
    contactsError = "";
    try {
        const { data, error } = await supabaseClient
            .from("contacts")
            .select("id,department,name,job_title,phone,email,note,sort_order")
            .order("sort_order");
        if (error) throw error;
        if (requestVersion !== contactsRequestVersion) return;
        contacts = (data || []).slice().sort((a, b) =>
            String(a.department || "").localeCompare(String(b.department || ""), "lt") ||
            (a.sort_order || 0) - (b.sort_order || 0) ||
            String(a.name || "").localeCompare(String(b.name || ""), "lt"));
        contactsLoaded = true;
    } catch (error) {
        if (requestVersion !== contactsRequestVersion) return;
        contacts = [];
        contactsError = "Nepavyko gauti kontaktų: " + errorText(error);
    } finally {
        if (requestVersion === contactsRequestVersion) contactsLoading = false;
    }
}

async function showContacts() {
    // Contacts are for logged-in staff only; forget cached rows on logout.
    if (!currentUser || authLoading || logoutPending || logoutFailed) {
        contacts = [];
        contactsLoaded = false;
        if (!currentUser) {
            currentSection = "home";
            showHome();
            return;
        }
    }
    currentSection = "contacts";
    const app = document.getElementById("app");
    app.innerHTML = `
        <div class="topbar">${userAreaHtml()}</div>
        ${authErrorHtml()}
        <nav class="sections" id="sectionNav"></nav>
        <input id="contactSearch" class="search" type="text" placeholder="Ieškoti kontakto...">
        <div id="contactList"></div>
    `;
    renderSectionNav();
    document.getElementById("contactSearch").addEventListener("input", renderContacts);
    renderContacts();

    if (!contactsLoaded && !contactsLoading) {
        await loadContacts();
        if (currentSection === "contacts" && document.getElementById("contactList")) renderContacts();
    }
}

function renderContacts() {
    const list = document.getElementById("contactList");
    if (!list) return;

    if (contactsLoading || (!contactsLoaded && !contactsError)) {
        list.innerHTML = '<div class="empty" role="status">Kraunama...</div>';
        return;
    }
    if (contactsError) {
        list.innerHTML = `<div class="message" role="alert">${escapeHtml(contactsError)}</div>`;
        const retry = document.createElement("button");
        retry.textContent = "Bandyti dar kartą";
        retry.addEventListener("click", () => { contactsLoaded = false; contactsError = ""; showContacts(); });
        list.append(retry);
        return;
    }

    const search = normalizeSearchText(document.getElementById("contactSearch")?.value.trim() || "");
    const filtered = contacts.filter(contact => !search || normalizeSearchText(
        [contact.department, contact.name, contact.job_title, contact.phone, contact.email, contact.note]
            .filter(Boolean).join(" ")).includes(search));

    list.replaceChildren();
    if (!filtered.length) {
        list.innerHTML = '<div class="empty">Kontaktų nerasta.</div>';
        return;
    }

    let department = null;
    for (const contact of filtered) {
        const group = contact.department || "Kiti";
        if (group !== department) {
            department = group;
            const heading = document.createElement("h3");
            heading.className = "contact-group";
            heading.textContent = group;
            list.append(heading);
        }
        list.append(contactCard(contact));
    }
}

function contactCard(contact) {
    const card = document.createElement("div");
    card.className = "contact";

    const name = document.createElement("strong");
    name.textContent = contact.name || "";
    card.append(name);

    if (contact.job_title) {
        const title = document.createElement("div");
        title.className = "category";
        title.textContent = contact.job_title;
        card.append(title);
    }

    for (const [value, href] of [[contact.phone, phoneHref(contact.phone)], [contact.email, emailHref(contact.email)]]) {
        if (!value) continue;
        const line = document.createElement(href ? "a" : "div");
        line.className = "contact-link";
        if (href) line.setAttribute("href", href);
        line.textContent = value;
        card.append(line);
    }

    if (contact.note) {
        const note = document.createElement("div");
        note.className = "contact-note";
        note.textContent = contact.note;
        card.append(note);
    }
    return card;
}
