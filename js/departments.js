// Departments: a convenience FILTER, not access control. Content tagged
// with departments (empty = for everyone) is hidden when it does not match
// the chosen departments, but anyone can switch to "Visi skyriai".
// The choice is stored in user_preferences for logged-in users and in this
// browser (localStorage) for guests on a shared ward computer.

const DEPARTMENTS_STORAGE_KEY = "myprotocols.departments";

let departmentsList = [];
let departmentsLoaded = false;
let departmentsLoading = false;
let selectedDepartments = [];
let departmentPrefsUser = undefined;   // user id whose choice is loaded
let departmentPickerOpen = false;

function readLocalDepartments() {
    try {
        const value = JSON.parse(localStorage.getItem(DEPARTMENTS_STORAGE_KEY) || "[]");
        return Array.isArray(value) ? value.filter(d => typeof d === "string") : [];
    } catch {
        return [];
    }
}

function writeLocalDepartments(list) {
    try {
        localStorage.setItem(DEPARTMENTS_STORAGE_KEY, JSON.stringify(list));
    } catch {
        // Private mode or blocked storage: the choice lasts until reload.
    }
}

// Item filter. Untagged items are for everyone; no choice means all.
function matchesDepartments(item) {
    const tags = Array.isArray(item?.departments) ? item.departments : [];
    if (!tags.length || !selectedDepartments.length) return true;
    return tags.some(tag => selectedDepartments.includes(tag));
}

async function ensureDepartments() {
    const userId = currentUser?.id || null;
    const tasks = [];
    if (!departmentsLoaded && !departmentsLoading) {
        departmentsLoading = true;
        tasks.push((async () => {
            try {
                const { data, error } = await supabaseClient.from("app_settings")
                    .select("value").eq("key", "departments").maybeSingle();
                if (!error && Array.isArray(data?.value)) {
                    departmentsList = data.value.filter(d => typeof d === "string" && d.trim());
                }
            } catch {
                departmentsList = [];
            } finally {
                departmentsLoaded = true;
                departmentsLoading = false;
            }
        })());
    }
    if (departmentPrefsUser !== userId) {
        departmentPrefsUser = userId;
        if (!userId) {
            selectedDepartments = readLocalDepartments();
        } else {
            tasks.push((async () => {
                try {
                    const { data, error } = await supabaseClient.from("user_preferences")
                        .select("departments").eq("user_id", userId).maybeSingle();
                    if (departmentPrefsUser !== userId) return;
                    selectedDepartments = !error && Array.isArray(data?.departments)
                        ? data.departments.filter(d => typeof d === "string")
                        : readLocalDepartments();
                } catch {
                    if (departmentPrefsUser === userId) selectedDepartments = readLocalDepartments();
                }
            })());
        }
    }
    if (!tasks.length) return false;
    await Promise.all(tasks);
    return true;
}

function departmentLabel() {
    const shown = selectedDepartments.filter(d => departmentsList.includes(d));
    return shown.length ? shown.join(", ") : "Visi skyriai";
}

function renderDepartmentPicker() {
    const host = document.getElementById("departmentPicker");
    if (!host) return;
    // Load lazily; re-render the current view once the list/choice is known.
    ensureDepartments().then(changed => {
        if (changed && document.getElementById("departmentPicker")) showProtocolList();
    });
    host.replaceChildren();
    if (!departmentsList.length) return;

    const toggle = document.createElement("button");
    toggle.className = "department-toggle";
    toggle.setAttribute("id", "departmentToggle");
    toggle.textContent = "Skyrius: " + departmentLabel() + " ▾";
    toggle.addEventListener("click", () => {
        departmentPickerOpen = !departmentPickerOpen;
        renderDepartmentPicker();
    });
    host.append(toggle);
    if (!departmentPickerOpen) return;

    const panel = document.createElement("div");
    panel.className = "department-panel";
    panel.setAttribute("id", "departmentPanel");
    const boxes = [];
    for (const name of departmentsList) {
        const row = document.createElement("label");
        row.className = "form-row";
        const box = document.createElement("input");
        box.setAttribute("type", "checkbox");
        box.checked = selectedDepartments.includes(name);
        box.setAttribute("data-department", name);
        const text = document.createElement("span");
        text.textContent = name;
        row.append(box, text);
        panel.append(row);
        boxes.push(box);
    }
    const hint = document.createElement("div");
    hint.className = "cal-muted";
    hint.textContent = "Nieko nepažymėjus rodomi visi skyriai.";
    const save = document.createElement("button");
    save.className = "primary";
    save.textContent = "Rodyti";
    save.addEventListener("click", () => saveDepartmentChoice(
        boxes.filter(b => b.checked).map(b => b.getAttribute("data-department"))));
    const all = document.createElement("button");
    all.textContent = "Visi skyriai";
    all.addEventListener("click", () => saveDepartmentChoice([]));
    panel.append(hint, save, all);
    host.append(panel);
}

async function saveDepartmentChoice(list) {
    selectedDepartments = list.filter(d => departmentsList.includes(d));
    departmentPickerOpen = false;
    writeLocalDepartments(selectedDepartments);
    showProtocolList();
    if (!currentUser) return;
    try {
        await supabaseClient.from("user_preferences").upsert({
            user_id: currentUser.id,
            departments: selectedDepartments,
            updated_at: new Date().toISOString()
        }).select("user_id");
    } catch {
        // The filter still works for this session; it is only not remembered.
    }
}

// Checkbox group for admin forms: which departments an item belongs to.
function departmentCheckboxes(container, selected = []) {
    if (!departmentsList.length) return () => [];
    const title = document.createElement("div");
    title.className = "cal-muted";
    title.textContent = "Skyriai (nieko nepažymėjus – visiems):";
    container.append(title);
    const boxes = [];
    for (const name of departmentsList) {
        const row = document.createElement("label");
        row.className = "form-row";
        const box = document.createElement("input");
        box.setAttribute("type", "checkbox");
        box.setAttribute("data-department", name);
        box.checked = selected.includes(name);
        const text = document.createElement("span");
        text.textContent = name;
        row.append(box, text);
        container.append(row);
        boxes.push(box);
    }
    return () => boxes.filter(b => b.checked).map(b => b.getAttribute("data-department"));
}
