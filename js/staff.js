// Admin view "Darbuotojai": assign each user to a staff group (doctors,
// nurses, assistants ...). Groups are used later for vacation limits and
// document recipients. Server protection: profiles are readable by admins
// via public.is_admin(); only the staff_group and full_name columns are
// updatable, and only by admins. The role column cannot be changed here.

const DEFAULT_STAFF_GROUPS = ["Gydytojai", "Slaugytojai", "Slaugytojų padėjėjai"];

let staffProfiles = [];
let staffGroups = null;
let staffLoading = false;
let staffError = "";

async function loadStaff() {
    staffLoading = true;
    staffError = "";
    const version = authVersion;
    try {
        const [people, groups] = await Promise.all([
            supabaseClient.from("profiles").select("id,email,full_name,role,staff_group").order("email"),
            supabaseClient.from("app_settings").select("value").eq("key", "staff_groups").maybeSingle()
        ]);
        if (version !== authVersion) return;
        if (people.error) throw people.error;
        staffProfiles = people.data || [];
        staffGroups = Array.isArray(groups.data?.value)
            ? groups.data.value.filter(g => typeof g === "string" && g.trim())
            : DEFAULT_STAFF_GROUPS.slice();
    } catch (error) {
        if (version !== authVersion) return;
        staffProfiles = [];
        staffError = "Nepavyko gauti darbuotojų: " + errorText(error);
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
        <h2>Darbuotojai ir skyriai</h2>
        <div id="staffBody"><div class="empty" role="status">Kraunama...</div></div>
    `;
    renderSectionNav();
    await loadStaff();
    if (currentSection === "staff" && document.getElementById("staffBody")) renderStaff();
}

function renderStaff() {
    const body = document.getElementById("staffBody");
    if (!body) return;
    body.replaceChildren();
    if (staffError) {
        appendText(body, "div", "message", staffError);
        return;
    }

    const table = document.createElement("div");
    table.className = "staff-table";
    table.setAttribute("id", "staffTable");
    for (const person of staffProfiles) {
        const row = document.createElement("div");
        row.className = "staff-row";
        row.setAttribute("data-profile", String(person.id));
        const who = document.createElement("div");
        appendText(who, "strong", "", person.full_name || person.email || "");
        if (person.full_name) appendText(who, "div", "cal-muted", person.email || "");
        if (person.role === "admin") appendText(who, "span", "tile-badge staff-admin", "admin");

        const select = document.createElement("select");
        select.setAttribute("aria-label", "Grupė");
        const groups = [...new Set([...(staffGroups || []), person.staff_group].filter(Boolean))];
        for (const [value, label] of [["", "— nepriskirta —"], ...groups.map(g => [g, g])]) {
            const option = document.createElement("option");
            option.setAttribute("value", value);
            option.textContent = label;
            select.append(option);
        }
        select.value = person.staff_group || "";
        const status = document.createElement("span");
        status.className = "cal-muted";
        select.addEventListener("change", () => saveStaffGroup(person, select, status));
        row.append(who, select, status);
        table.append(row);
    }
    if (!staffProfiles.length) appendText(table, "div", "cal-empty", "Naudotojų nėra.");
    body.append(table);

    const box = document.createElement("div");
    box.className = "suggestion-box staff-groups";
    appendText(box, "h3", "", "Grupių sąrašas");
    appendText(box, "p", "cal-muted", "Po vieną grupę eilutėje. Šios grupės bus naudojamos atostogų limitams ir dokumentų gavėjams.");
    const area = document.createElement("textarea");
    area.setAttribute("id", "staffGroupsInput");
    area.value = (staffGroups || []).join("\n");
    const save = document.createElement("button");
    save.className = "primary";
    save.textContent = "Išsaugoti grupes ir skyrius";
    const message = document.createElement("div");
    message.className = "message";
    message.setAttribute("id", "staffGroupsMessage");
    save.addEventListener("click", () => saveStaffGroups(area, message));
    box.append(area);
    appendText(box, "h3", "", "Skyrių sąrašas");
    appendText(box, "p", "cal-muted", "Po vieną skyrių eilutėje. Pagal skyrius filtruojami algoritmai.");
    const departmentsArea = document.createElement("textarea");
    departmentsArea.setAttribute("id", "departmentsInput");
    departmentsArea.setAttribute("placeholder", "Priėmimo\nTerapinis\nChirurginis");
    departmentsArea.value = departmentsList.join("\n");
    box.append(departmentsArea, save, message);
    body.append(box);
}

async function saveStaffGroup(person, select, status) {
    if (!isAdmin()) return;
    const value = select.value;
    const previous = person.staff_group || "";
    status.textContent = "Saugoma...";
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient.from("profiles")
            .update({ staff_group: value || null })
            .eq("id", person.id)
            .select("id"));
    } catch (requestError) {
        error = requestError;
    }
    if (error || !Array.isArray(data) || !data.length) {
        select.value = previous;
        status.textContent = "Nepavyko: " + (error ? errorText(error) : "neturite teisės.");
        return;
    }
    person.staff_group = value || null;
    status.textContent = "Išsaugota";
}

async function saveStaffGroups(area, message) {
    if (!isAdmin()) return;
    const groups = [...new Set(String(area.value || "").split("\n").map(g => g.trim()).filter(Boolean))].slice(0, 30);
    if (!groups.length) {
        message.textContent = "Įrašykite bent vieną grupę.";
        return;
    }
    message.textContent = "Saugoma...";
    let data;
    let error;
    try {
        ({ data, error } = await supabaseClient.from("app_settings")
            .upsert({ key: "staff_groups", value: groups, updated_at: new Date().toISOString() })
            .select("key"));
        if (!error && Array.isArray(data) && data.length) {
            const departments = [...new Set(String(document.getElementById("departmentsInput")?.value || "")
                .split("\n").map(d => d.trim()).filter(Boolean))].slice(0, 50);
            const saved = await supabaseClient.from("app_settings")
                .upsert({ key: "departments", value: departments, updated_at: new Date().toISOString() })
                .select("key");
            if (saved.error || !Array.isArray(saved.data) || !saved.data.length) error = saved.error || new Error("neturite teisės.");
            else {
                departmentsList = departments;
                departmentsLoaded = true;
            }
        }
    } catch (requestError) {
        error = requestError;
    }
    if (error || !Array.isArray(data) || !data.length) {
        message.textContent = "Nepavyko išsaugoti: " + (error ? errorText(error) : "neturite teisės.");
        return;
    }
    staffGroups = groups;
    renderStaff();
    document.getElementById("staffGroupsMessage").textContent = "Grupės ir skyriai išsaugoti.";
}
