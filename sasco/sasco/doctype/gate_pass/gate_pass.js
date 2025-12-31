// Copyright (c) 2025, Sowaan and contributors
// For license information, please see license.txt

frappe.ui.form.on("Gate Pass", {
	before_save(frm) {
        frm._prev_delivery_notes = (frm.doc.delivery_details || [])
            .map(d => d.delivery_note);
    },
    delivery_details_remove(frm) {
        let current_dns = (frm.doc.delivery_details || [])
            .map(d => d.delivery_note);

        let removed_dns = (frm._prev_delivery_notes || []).filter(
            dn => !current_dns.includes(dn)
        );

        removed_dns.forEach(dn => {
            frm.doc.detail_items = (frm.doc.detail_items || []).filter(
                item => item.delivery_note !== dn
            );
        });

        frm.refresh_field("detail_items");
        frm._prev_delivery_notes = current_dns;
    },
	refresh(frm) {
		if (!frm.is_new()) {
			frm.add_custom_button(
				__("Add Delivery Note Items"),
				() => {
					open_dn_items_dialog(frm);
				},
				__("Actions")
			);
		}
        set_delivery_note_filter(frm);
	},
    onload(frm) {
        set_delivery_note_filter(frm);
    }
	
});
frappe.ui.form.on("Delivery Stops on Gate Pass", {
    delivery_note(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (!row.delivery_note) return;

        add_dn_items_to_gate_pass(frm, row.delivery_note);
    },
    delivery_details_remove(frm) {
        let active_dns = (frm.doc.delivery_details || [])
            .map(d => d.delivery_note);

        frm.doc.detail_items = (frm.doc.detail_items || []).filter(
            item => active_dns.includes(item.delivery_note)
        );

        frm.refresh_field("detail_items");
    }
});
function add_dn_items_to_gate_pass(frm, delivery_note) {

    frappe.call({
        method: "sasco.sasco.doctype.gate_pass.gate_pass.get_pending_dn_items",
        args: { delivery_note },
        callback(r) {
            if (!r.message) return;

            let existing_dn_items = (frm.doc.detail_items || [])
                .map(i => i.delivery_note_item);

            r.message.forEach(item => {

                // 🚫 Prevent duplicates
                if (existing_dn_items.includes(item.delivery_note_item)) {
                    return;
                }

                let child = frm.add_child("detail_items");
                child.delivery_note = delivery_note;
                child.delivery_note_item = item.delivery_note_item;
                child.item_code = item.item_code;
                child.qty = item.pending_qty;
                child.uom = item.uom;
                child.warehouse = item.warehouse;
                child.item_name = item.item_name;
            });

            frm.refresh_field("detail_items");
        }
    });
}


function set_delivery_note_filter(frm) {
    frm.set_query("delivery_note", "delivery_details", function () {
        return {
            filters: {
                docstatus: 1   // ✅ Submitted only
            }
        };
    });
}



//-----------------------------------------------------------------------

function open_dn_items_dialog(frm) {

    let delivery_notes = (frm.doc.delivery_details || [])
        .map(d => d.delivery_note)
        .filter(Boolean);

    if (!delivery_notes.length) {
        frappe.msgprint(__("Please add at least one Delivery Note first."));
        return;
    }

    let dialog = new frappe.ui.Dialog({
        title: __("Select Delivery Note Items"),
        size: "extra-large",
        fields: [

            // FILTERS
            {
                fieldtype: "Link",
                fieldname: "delivery_note",
                label: __("Delivery Note"),
                options: "Delivery Note",
                reqd: 1,
                get_query() {
                    return { filters: { name: ["in", delivery_notes] } };
                },
                onchange() {
                    load_dn_items_html(dialog);
                }
            },
            {
                fieldtype: "Link",
                fieldname: "item_code",
                label: __("Item"),
                options: "Item",
                onchange() {
                    load_dn_items_html(dialog);
                }
            },
            {
                fieldtype: "Link",
                fieldname: "warehouse",
                label: __("Warehouse"),
                options: "Warehouse",
                onchange() {
                    load_dn_items_html(dialog);
                }
            },

            { fieldtype: "Section Break" },

            // HTML TABLE
            {
                fieldtype: "HTML",
                fieldname: "items_html"
            }
        ],

        primary_action_label: __("Add Items"),
        primary_action() {
            add_items_from_html_table(frm, dialog);
            dialog.hide();
        }
    });

    dialog.show();
}

function load_dn_items_html(dialog) {

    frappe.call({
        method: "sasco.sasco.doctype.gate_pass.gate_pass.get_pending_dn_items",
        args: {
            delivery_note: dialog.get_value("delivery_note"),
            item_code: dialog.get_value("item_code"),
            warehouse: dialog.get_value("warehouse")
        },
        callback(r) {
            render_items_table(dialog, r.message || []);
        }
    });
}
function render_items_table(dialog, items) {

    let html = `
        <style>
            .dn-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
            }
            .dn-table th, .dn-table td {
                border: 1px solid #ddd;
                padding: 6px;
                font-size: 12px;
            }
            .dn-table th {
                background: #f7f7f7;
                text-align: left;
            }
            .text-right { text-align: right; }
        </style>

        <table class="dn-table">
            <thead>
                <tr>
                    <th style="width:3%">
                        <input type="checkbox" id="select-all">
                    </th>
                    <th>Item</th>
                    <th>Item Name</th>
                    <th class="text-right">Pending</th>
                    <th class="text-right">Qty to Add</th>
                    <th>UOM</th>
                    <th>Warehouse</th>
                </tr>
            </thead>
            <tbody>
    `;

items.forEach(row => {
    html += `
        <tr
            data-dn-item="${row.delivery_note_item}"
            data-item-code="${row.item_code}"
            data-item-name="${row.item_name || ""}"
            data-uom="${row.uom || ""}"
            data-warehouse="${row.warehouse || ""}"
        >
            <td>
                <input type="checkbox" class="row-check">
            </td>
            <td>${row.item_code}</td>
            <td>${row.item_name || ""}</td>
            <td class="text-right">${row.pending_qty}</td>
            <td>
                <input type="number"
                       class="qty-input"
                       value="${row.pending_qty}"
                       min="0"
                       max="${row.pending_qty}"
                       style="width:70px">
            </td>
            <td>${row.uom || ""}</td>
            <td>${row.warehouse || ""}</td>
        </tr>
    `;
});

    html += `</tbody></table>`;

    dialog.fields_dict.items_html.$wrapper.html(html);

    // Select All behavior
    dialog.fields_dict.items_html.$wrapper
        .find("#select-all")
        .on("change", function () {
            dialog.fields_dict.items_html.$wrapper
                .find(".row-check")
                .prop("checked", this.checked);
        });
}

function add_items_from_html_table(frm, dialog) {

    let wrapper = dialog.fields_dict.items_html.$wrapper;
    let delivery_note = dialog.get_value("delivery_note");

    if (!delivery_note) {
        frappe.throw(__("Delivery Note is required."));
    }

    // ------------------------------------------------------------------
    // Ensure Delivery Note exists in delivery_details
    // ------------------------------------------------------------------
    let dn_exists = (frm.doc.delivery_details || []).some(
        d => d.delivery_note === delivery_note
    );

    if (!dn_exists) {
        let dn_row = frm.add_child("delivery_details");
        dn_row.delivery_note = delivery_note;
        frm.refresh_field("delivery_details");
    }

    // ------------------------------------------------------------------
    // Add selected items
    // ------------------------------------------------------------------
    wrapper.find("tbody tr").each(function () {

        let row = $(this);

        if (!row.find(".row-check").is(":checked")) {
            return; // continue
        }

        let qty = flt(row.find(".qty-input").val());
        let pending = flt(row.find(".qty-input").attr("max"));

        if (!qty || qty <= 0) {
            return; // continue
        }

        if (qty > pending) {
            frappe.throw(__("Qty exceeds pending quantity"));
        }

        let dn_item = row.data("dn-item");

        // 🚫 Skip if item already exists
        let exists = (frm.doc.detail_items || []).some(
            i => i.delivery_note_item === dn_item
        );

        if (exists) {
            return; // continue safely
        }

        let child = frm.add_child("detail_items");
        child.delivery_note = delivery_note;
        child.delivery_note_item = dn_item;
        child.item_code = row.data("item-code");
        child.item_name = row.data("item-name");
        child.qty = qty;
        child.uom = row.data("uom");
        child.warehouse = row.data("warehouse");
    });

    frm.refresh_field("detail_items");
}



// function toggle_select_all(dialog) {
// 	let select_all = dialog.get_value("select_all");
// 	let rows = dialog.fields_dict.items.df.data || [];

// 	rows.forEach(row => {
// 		row.select = select_all ? 1 : 0;
// 		row.qty = select_all ? row.pending_qty : null;
// 	});

// 	dialog.fields_dict.items.grid.refresh();
// }

// function load_dn_items(dialog) {
// 	frappe.call({
// 		method: "sasco.sasco.doctype.gate_pass.gate_pass.get_pending_dn_items",
// 		args: {
// 			delivery_note: dialog.get_value("delivery_note"),
// 			item_code: dialog.get_value("item_code"),
// 			warehouse: dialog.get_value("warehouse")
// 		},
// 		callback(r) {
// 			if (!r.message) return;

// 			// Auto-fill qty = pending
// 			r.message.forEach(row => {
// 				row.qty = row.pending_qty;
// 			});

// 			dialog.fields_dict.items.df.data = r.message;
// 			dialog.fields_dict.items.grid.refresh();
// 		}
// 	});
// }


// function add_items_to_gate_pass(frm, dialog) {
// 	let grid = dialog.fields_dict.items.grid;
// 	let selected_rows = grid.get_selected_children();

// 	if (!selected_rows.length) {
// 		frappe.msgprint(__("Please select at least one item."));
// 		return;
// 	}

// 	selected_rows.forEach(row => {
// 		if (!row.qty || row.qty <= 0) return;

// 		if (row.qty > row.pending_qty) {
// 			frappe.throw(
// 				__("Qty for item {0} exceeds pending quantity", [row.item_code])
// 			);
// 		}

// 		let child = frm.add_child("detail_items");
// 		child.delivery_note = dialog.get_value("delivery_note");
// 		child.delivery_note_item = row.delivery_note_item;
// 		child.item_code = row.item_code;
// 		child.qty = row.qty;
// 		child.uom = row.uom;
// 		child.warehouse = row.warehouse;

// 	});

// 	frm.refresh_field("detail_items");
// }
