frappe.ui.form.on('Quotation', {
    refresh(frm) {
      //  console.log("✅Quotation form refreshed");
        update_currency_labels(frm);
        // let grid = frm.fields_dict["custom_parent_item"].grid;

        // // Prevent adding new rows
        // grid.cannot_add_rows = true;
        // grid.wrapper.find('.grid-add-row').hide(); // hide "Add Row" button
        // grid.wrapper.find('.grid-footer').hide();  // hide footer entirely (including multi-select delete)

        // // Prevent deleting rows
        // grid.wrapper.find('.grid-remove-rows').hide(); // hide "Delete" in footer
        // grid.wrapper.find('.grid-remove-row').hide();  // hide "trash" icon in each row

        // grid.wrapper.find('.grid-delete-row').hide();
    },
    currency(frm) {
        update_currency_labels(frm);
    }
});

frappe.ui.form.on('Fabrication Parent Item', {
    price_list: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (!row.parent_item || !row.price_list) {
            frappe.msgprint("Please select both Parent Item and Price List.");
            return;
        }

       // console.log("🔔 Price List changed:", row.price_list, "for Parent Item:", row.parent_item);

        // Call server-side method to fetch rate
        frappe.call({
            method: "frappe.client.get_value",
            args: {
                doctype: "Item Price",
                filters: {
                    item_code: row.parent_item,
                    price_list: row.price_list,
                    uom: row.fg_item_uom || undefined
                },
                fieldname: ["price_list_rate"]
            },
            callback: function (r) {
                let new_rate = (r.message && r.message.price_list_rate) ? r.message.price_list_rate : 0;

                frappe.model.set_value(cdt, cdn, "rate", new_rate);
               // console.log("💰 Rate updated:", new_rate);
            }
        });
    },
    uom_type: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (row.uom_type === "SQM") {
            // set quantity = spl_area_sqm
            frappe.model.set_value(cdt, cdn, "quantity", row.spl_area_sqm || 0);

            // hide KG, show SQM
            frm.fields_dict["custom_parent_item"].grid.toggle_display("spl_area_sqm", true);
            frm.fields_dict["custom_parent_item"].grid.toggle_display("total_kg", false);

        } else if (row.uom_type === "KG") {
            // set quantity = total_kg
            frappe.model.set_value(cdt, cdn, "quantity", row.total_kg || 0);

            // hide SQM, show KG
            frm.fields_dict["custom_parent_item"].grid.toggle_display("spl_area_sqm", false);
            frm.fields_dict["custom_parent_item"].grid.toggle_display("total_kg", true);
        }

        // calculate amount based on unified quantity
        let amount = (row.quantity || 0) * (row.rate || 0);
        frappe.model.set_value(cdt, cdn, "amount", amount);
    },

    // recalc if quantity or rate changes
    quantity: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        let amount = (row.quantity || 0) * (row.rate || 0);
        frappe.model.set_value(cdt, cdn, "amount", amount);
    },
    rate: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        let amount = (row.quantity || 0) * (row.rate || 0);
        frappe.model.set_value(cdt, cdn, "amount", amount);
    }    
    // uom_type: function(frm, cdt, cdn) {
    //     let row = locals[cdt][cdn];

    //     if (row.uom_type === "SQM") {
    //         frappe.model.set_value(cdt, cdn, "spl_area_sqm", row.spl_area_sqm || 0);
    //         frappe.model.set_value(cdt, cdn, "total_kg", 0);

    //         // show/hide fields dynamically
    //         frm.fields_dict["custom_parent_item"].grid.toggle_display("spl_area_sqm", true);
    //         frm.fields_dict["custom_parent_item"].grid.toggle_display("total_kg", false);

    //         // calculate amount
    //         let amount = (row.spl_area_sqm || 0) * (row.rate || 0);
    //         frappe.model.set_value(cdt, cdn, "amount", amount);

    //     } else if (row.uom_type === "KG") {
    //         frappe.model.set_value(cdt, cdn, "total_kg", row.total_kg || 0);
    //         frappe.model.set_value(cdt, cdn, "spl_area_sqm", 0);

    //         frm.fields_dict["custom_parent_item"].grid.toggle_display("spl_area_sqm", false);
    //         frm.fields_dict["custom_parent_item"].grid.toggle_display("total_kg", true);

    //         let amount = (row.total_kg || 0) * (row.rate || 0);
    //         frappe.model.set_value(cdt, cdn, "amount", amount);
    //     }
    // },

    // spl_area_sqm: function(frm, cdt, cdn) {
    //     let row = locals[cdt][cdn];
    //     if (row.uom_type === "SQM") {
    //         let amount = (row.spl_area_sqm || 0) * (row.rate || 0);
    //         frappe.model.set_value(cdt, cdn, "amount", amount);
    //     }
    // },

    // total_kg: function(frm, cdt, cdn) {
    //     let row = locals[cdt][cdn];
    //     if (row.uom_type === "KG") {
    //         let amount = (row.total_kg || 0) * (row.rate || 0);
    //         frappe.model.set_value(cdt, cdn, "amount", amount);
    //     }
    // },

    // rate: function(frm, cdt, cdn) {
    //     let row = locals[cdt][cdn];
    //     if (row.uom_type === "SQM") {
    //         let amount = (row.spl_area_sqm || 0) * (row.rate || 0);
    //         frappe.model.set_value(cdt, cdn, "amount", amount);
    //     } else if (row.uom_type === "KG") {
    //         let amount = (row.total_kg || 0) * (row.rate || 0);
    //         frappe.model.set_value(cdt, cdn, "amount", amount);
    //     }
    // }
});


function update_currency_labels(frm) {
    const currency = frm.doc.currency || "";
    
    frm.fields_dict.custom_parent_item.grid.update_docfield_property(
        "amount", "label", `Amount (${currency})`
    );

    frm.fields_dict.custom_parent_item.grid.update_docfield_property(
        "rate", "label", `Rate (${currency})`
    );
    
    frm.set_df_property("custom_parent_total", "label", `Parent Total (${currency})`);

    frm.refresh_field("fabrication_parent_item");
    frm.refresh_field("custom_parent_item");
}
