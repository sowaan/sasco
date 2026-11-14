frappe.ui.form.on("Item", {
    refresh(frm) {
        set_default_uom_first(frm);
    },

    stock_uom(frm) {
        set_default_uom_first(frm);
    },
});

function set_default_uom_first(frm) {
    if (!frm.doc.stock_uom) return;

    let default_row = (frm.doc.uoms || []).find(row => row.uom === frm.doc.stock_uom);
    if (!default_row) {
        default_row = frm.add_child("uoms", {
            uom: frm.doc.stock_uom,
            conversion_factor: 1,
        });
    }

    const rows = frm.doc.uoms;
    const index = rows.indexOf(default_row);
    if (index > 0) {
        rows.splice(index, 1);
        rows.unshift(default_row);
    }

    rows.forEach((row, index) => { row.idx = index + 1; });
    frm.refresh_field("uoms");
}
