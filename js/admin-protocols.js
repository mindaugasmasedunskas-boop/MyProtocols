// =============================================
// ADMIN — PROTOCOL ACCESS
// =============================================

async function changeProtocolAccess(id, accessLevel) {

    if (!isAdmin()) {
        alert("Ši funkcija skirta administratoriui.");
        return;
    }

    if (!["public", "restricted"].includes(accessLevel)) {
        alert("Neteisingas prieigos lygis.");
        return;
    }

    const { error } = await supabaseClient
        .from("protocols")
        .update({ access_level: accessLevel })
        .eq("id", id);

    if (error) {
        alert("Nepavyko pakeisti prieigos: " + error.message);
        return;
    }

    await loadProtocols();
    showProtocolList();
}