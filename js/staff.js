// Admin section "Personalas": create staff accounts (nickname + temporary
// password), set each person's position (staff_group) and departments
// (several allowed), reset forgotten passwords, and edit the position and
// department name lists.
// Server protection: accounts are created only by the "admin-users" Edge
// Function, which checks that the caller is an admin. Profiles are readable
// by admins via public.is_admin(); only staff_group, full_name and
// departments are updatable by admins. The role column cannot be changed.

const DEFAULT_STAFF_GROUPS = ["Gydytojai", "Slaugytojai", "Slaugytojų padėjėjai"];

let staffProfiles = [];
let staffGroups = null;
let staffLoading = false;
let staffError = "";
let staffEditing = null;        // profile id whose departments are being edited
let staffResetting = null;      // profile id whose password is being reset
let staffCreating = false;
let staffSavePending = false;

async function loadStaff() {
    staffLoading = true;
    staffError = "";
    const version = authVersion;
    try {
        const [people, groups] = await Promise.all([
            supabaseClient.from("profiles")
                .select("id,email,full_name,username,role,staff_group,departments")
                .order("email"),
            supabaseClient.from("app_settings").select("value").eq("key", "staff_groups").maybeSingle()
        ]);
        await ensureDepartments();
        if (version !== authVersion) return;
        if (people.error) throw people.error;
        staffProfiles = people.data || [];
        staffGroups = Array.isArray(groups.data?.value)
            ? groups.data.value.filter(g => typeof g === "string" && g.trim())
            : DEFAULT_STAFF_GROUPS.slice();
    } catch (error) {
        if (version !== authVersion) return;
        staffProfiles = [];
        staffError = "Nepavyko gauti personalo: " + errorText(error);
    } finally {
        if (version === authVersion) staffLoading = false;
    }
}

async function showStaff() {
    if (!isAdmin()) {
        currentSection = "home";
        showHome();
        return;
    }
    currentSection = "staff";
    document.getElementById("app").innerHTML = `
        <div class="topbar">${userAreaHtml()}</div>
        ${authErrorHtml()}
        <nav class="sections" id="sectionNav"></nav>
        <h2>Personalas</h2>
        <div id="staffBody"><div class="empty" role="status">Kraunama...</div></div>
    `;
    renderSectionNav();
    const add = document.createElement("button");
    add.className = "primary";
    add.textContent = "+ Naujas darbuotojas";
    add.addEventListener("click", () => { staffCreating = true; renderStaff(); });
    document.getElementById("sectionNav").append(add);
    await loadStaff();
    if (currentSection === "staff" && document.getElementById("staffBody")) renderStaff();
}

function personName(person) {
    return person.full_name || person.username || person.email || "";
}

function personLogin(person) {
    if (person.username) return person.username;
    const email = String(person.email || "");
    return email.endsWith("@" + LOGIN_DOMAIN) ? email.slice(0, -(LOGIN_DOMAIN.length + 1)) : email;
}

function groupSelect(value) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Pareigos");
    const groups = [...new Set([...(staffGroups || []), value].filter(Boolean))];
    for (const [optionValue, label] of [["", "— pareigos nenurodytos —"], ...groups.map(g => [g, g])]) {
        const option = document.createElement("option");
        option.setAttribute("value", optionValue);
        option.textContent = label;
        select.append(option);
    }
    select.value = value || "";
    return select;
}

function renderStaff(notice = "") {
    const body = document.getElementById("staffBody");
    if (!body) return;
    body.replaceChildren();
    if (staffError) {
        appendText(body, "div", "message", staffError);
        return;
    }
    if (notice) {
        const done = appendText(body, "div", "message staff-done", notice);
        done.setAttribute("id", "staffDone");
    }
    if (staffCreating) body.append(newStaffForm());

    const table = document.createElement("div");
    table.className = "staff-table";
    table.setAttribute("id", "staffTable");
    for (const person of staffProfiles) table.append(staffRow(person));
    if (!staffProfiles.length) appendText(table, "div", "cal-empty", "Darbuotojų nėra.");
    body.append(table);
    body.append(listsEditor());
}

function staffRow(person) {
    const row = document.createElement("div");
    row.className = "staff-row";
    row.setAttribute("data-profile", String(person.id));

    const who = document.createElement("div");
    appendText(who, "strong", "", personName(person));
    appendText(who, "div", "cal-muted", personLogin(person));
    if (person.role === "admin") appendText(who, "span", "tile-badge staff-admin", "admin");

    const select = groupSelect(person.staff_group);
    const status = document.createElement("span");
    status.className = "cal-muted staff-status";
    select.addEventListener("change", () => saveStaffFields(person, { staff_group: select.value || null }, status,
        () => { select.value = person.staff_group || ""; }));

    const departments = document.createElement("div");
    departments.className = "staff-departments";
    const tags = Array.isArray(person.departments) ? person.departments : [];
    appendText(departments, "span", "", tags.length ? tags.join(", ") : "Skyriai nepriskirti");
    const edit = document.createElement("button");
    edit.className = "link-button";
    edit.textContent = "Keisti skyrius";
    edit.addEventListener("click", () => {
        staffEditing = staffEditing === person.id ? null : person.id;
        renderStaff();
    });
    const reset = document.createElement("button");
    reset.className = "link-button";
    reset.textContent = "Atstatyti slaptažodį";
    reset.addEventListener("click", () => {
        staffResetting = staffResetting === person.id ? null : person.id;
        renderStaff();
    });
    departments.append(edit, reset);

    row.append(who, select, departments, status);

    if (staffEditing === person.id) {
        const panel = document.createElement("div");
        panel.className = "staff-panel";
        if (!departmentsList.length) appendText(panel, "div", "cal-muted", "Pirmiausia apačioje įrašykite skyrių sąrašą.");
        const read = departmentCheckboxes(panel, tags);
        const save = document.createElement("button");
        save.className = "primary";
        save.textContent = "Išsaugoti skyrius";
        save.addEventListener("click", async () => {
            const ok = await saveStaffFields(person, { departments: read() }, status);
            if (ok) {
                staffEditing = null;
                renderStaff();
            }
        });
        panel.append(save);
        row.append(panel);
    }
    if (staffResetting === person.id) row.append(resetPasswordPanel(person, status));
    return row;
}

async function saveStaffFields(person, values, status, restore) {
    if (!isAdmin() || staffSavePending) return false;
    staffSavePending = true;
    status.textContent = "Saugoma...";
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient.from("profiles").update(values).eq("id", person.id).select("id"));
    } catch (requestError) {
        error = requestError;
    } finally {
        staffSavePending = false;
    }
    if (error || !Array.isArray(data) || !data.length) {
        if (restore) restore();
        status.textContent = "Nepavyko: " + (error ? errorText(error) : "neturite teisės.");
        return false;
    }
    Object.assign(person, values);
    status.textContent = "Išsaugota";
    return true;
}

// Readable temporary password for the admin to hand over in person.
function generatePassword() {
    const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(10);
    if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return [...bytes].map(b => alphabet[b % alphabet.length]).join("");
}

function passwordField(id) {
    const wrap = document.createElement("div");
    wrap.className = "form-row";
    const input = document.createElement("input");
    input.setAttribute("id", id);
    input.setAttribute("type", "text");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("placeholder", "Laikinas slaptažodis (bent 8 simboliai)");
    const generate = document.createElement("button");
    generate.setAttribute("type", "button");
    generate.textContent = "Sugeneruoti";
    generate.addEventListener("click", () => { input.value = generatePassword(); });
    wrap.append(input, generate);
    return wrap;
}

// Calls the admin-users Edge Function and returns { data } or { error }.
async function callAdminUsers(payload) {
    try {
        const { data, error } = await supabaseClient.functions.invoke("admin-users", { body: payload });
        if (error) {
            let message = errorText(error);
            try {
                const details = await error.context?.json?.();
                if (details?.error) message = details.error;
            } catch {
                // Keep the generic message.
            }
            return { error: message };
        }
        if (data?.error) return { error: data.error };
        return { data };
    } catch (error) {
        return { error: errorText(error) };
    }
}

function resetPasswordPanel(person, status) {
    const panel = document.createElement("div");
    panel.className = "staff-panel";
    appendText(panel, "div", "cal-muted",
        "Įveskite naują laikiną slaptažodį ir perduokite jį darbuotojui. Prisijungęs jis turės susikurti savo slaptažodį.");
    const fieldId = "resetPassword-" + person.id;
    const field = passwordField(fieldId);
    const save = document.createElement("button");
    save.className = "primary";
    save.textContent = "Nustatyti slaptažodį";
    save.addEventListener("click", async () => {
        if (!isAdmin() || staffSavePending) return;
        const password = document.getElementById(fieldId).value;
        if (password.length < 8) {
            status.textContent = "Slaptažodis turi būti bent 8 simbolių.";
            return;
        }
        staffSavePending = true;
        status.textContent = "Saugoma...";
        const result = await callAdminUsers({ action: "reset_password", user_id: person.id, password });
        staffSavePending = false;
        if (result.error) {
            status.textContent = "Nepavyko: " + result.error;
            return;
        }
        staffResetting = null;
        renderStaff(`Slaptažodis pakeistas: ${personName(person)}. Perduokite naują laikiną slaptažodį darbuotojui.`);
    });
    panel.append(field, save);
    return panel;
}

function newStaffForm() {
    const form = document.createElement("div");
    form.className = "suggestion-box staff-new";
    form.setAttribute("id", "newStaffForm");
    appendText(form, "h3", "", "Naujas darbuotojas");
    const name = document.createElement("input");
    name.setAttribute("id", "newStaffName");
    name.setAttribute("placeholder", "Vardas ir pavardė");
    const login = document.createElement("input");
    login.setAttribute("id", "newStaffLogin");
    login.setAttribute("placeholder", "Prisijungimo vardas (pvz., minmas)");
    login.setAttribute("autocapitalize", "none");
    name.addEventListener("input", () => {
        // Suggest the usual nickname: first 3 letters of name and surname.
        if (login.getAttribute("data-touched")) return;
        const parts = String(name.value || "").trim().split(/\s+/);
        login.value = parts.length >= 2
            ? normalizeSearchText(parts[0].slice(0, 3) + parts[parts.length - 1].slice(0, 3))
            : "";
    });
    login.addEventListener("input", () => login.setAttribute("data-touched", "1"));
    const group = groupSelect("");
    group.setAttribute("id", "newStaffGroup");
    const departments = document.createElement("div");
    departments.setAttribute("id", "newStaffDepartments");
    const read = departmentCheckboxes(departments, []);
    const message = document.createElement("div");
    message.className = "message";
    message.setAttribute("id", "newStaffMessage");
    const save = document.createElement("button");
    save.className = "primary";
    save.textContent = "Sukurti paskyrą";
    const cancel = document.createElement("button");
    cancel.textContent = "Atšaukti";
    cancel.addEventListener("click", () => {
        staffCreating = false;
        renderStaff();
    });
    save.addEventListener("click", () => createStaff(read, message));
    form.append(name, login, passwordField("newStaffPassword"), group, departments, save, cancel, message);
    return form;
}

async function createStaff(readDepartments, message) {
    if (!isAdmin() || staffSavePending) return;
    const fullName = document.getElementById("newStaffName").value.trim();
    const username = document.getElementById("newStaffLogin").value.trim().toLowerCase();
    const password = document.getElementById("newStaffPassword").value;
    if (!fullName) {
        message.textContent = "Įrašykite vardą ir pavardę.";
        return;
    }
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        message.textContent = "Prisijungimo vardas: 3–32 simboliai (a–z, skaičiai, taškas, brūkšnys).";
        return;
    }
    if (password.length < 8) {
        message.textContent = "Slaptažodis turi būti bent 8 simbolių.";
        return;
    }

    staffSavePending = true;
    message.textContent = "Kuriama...";
    const result = await callAdminUsers({
        action: "create",
        full_name: fullName,
        username,
        password,
        staff_group: document.getElementById("newStaffGroup").value || "",
        departments: readDepartments()
    });
    staffSavePending = false;
    if (result.error) {
        message.textContent = "Nepavyko sukurti: " + result.error;
        return;
    }
    staffCreating = false;
    await loadStaff();
    renderStaff(`Paskyra sukurta. Perduokite darbuotojui prisijungimo vardą „${username}“ ir laikiną slaptažodį.`);
}

function listsEditor() {
    const box = document.createElement("div");
    box.className = "suggestion-box staff-groups";
    appendText(box, "h3", "", "Sąrašų redagavimas");
    appendText(box, "p", "cal-muted", "Keičiama retai. Po vieną pavadinimą eilutėje.");

    appendText(box, "h4", "", "Pareigos");
    const groups = document.createElement("textarea");
    groups.setAttribute("id", "staffGroupsInput");
    groups.value = (staffGroups || []).join("\n");
    box.append(groups);

    appendText(box, "h4", "", "Skyriai");
    const departments = document.createElement("textarea");
    departments.setAttribute("id", "departmentsInput");
    departments.setAttribute("placeholder", "Priėmimo\nTerapinis\nChirurginis");
    departments.value = departmentsList.join("\n");
    box.append(departments);

    const message = document.createElement("div");
    message.className = "message";
    message.setAttribute("id", "staffGroupsMessage");
    const save = document.createElement("button");
    save.className = "primary";
    save.textContent = "Išsaugoti sąrašus";
    save.addEventListener("click", () => saveStaffLists(groups, departments, message));
    box.append(save, message);
    return box;
}

function splitLines(value, limit) {
    return [...new Set(String(value || "").split("\n").map(v => v.trim()).filter(Boolean))].slice(0, limit);
}

async function saveStaffLists(groupsArea, departmentsArea, message) {
    if (!isAdmin()) return;
    const groups = splitLines(groupsArea.value, 30);
    const departments = splitLines(departmentsArea.value, 50);
    if (!groups.length) {
        message.textContent = "Įrašykite bent vienas pareigas.";
        return;
    }
    message.textContent = "Saugoma...";
    let failure = null;
    try {
        for (const [key, value] of [["staff_groups", groups], ["departments", departments]]) {
            const { data, error } = await supabaseClient.from("app_settings")
                .upsert({ key, value, updated_at: new Date().toISOString() })
                .select("key");
            if (error || !Array.isArray(data) || !data.length) throw error || new Error("neturite teisės.");
        }
    } catch (error) {
        failure = error;
    }
    if (failure) {
        message.textContent = "Nepavyko išsaugoti: " + errorText(failure);
        return;
    }
    staffGroups = groups;
    departmentsList = departments;
    departmentsLoaded = true;
    renderStaff("Sąrašai išsaugoti.");
}
