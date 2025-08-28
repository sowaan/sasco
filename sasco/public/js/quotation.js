frappe.ui.form.on('Quotation', {
    refresh(frm) {
      //  console.log("✅Quotation form refreshed");
        update_currency_labels(frm);
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
    }
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
