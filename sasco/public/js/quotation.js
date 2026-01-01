frappe.ui.form.on('Quotation', {
    refresh(frm) {
      //  console.log("✅Quotation form refreshed");
        update_currency_labels(frm);
        frm.fields_dict["items"].grid.get_field("custom_price_list").get_query = function(doc, cdt, cdn) {
            return {
                filters: {
                    selling: 1   // ✅ Only Selling Price Lists
                }
            };
        };
        toggle_price_list_field(frm);

        if (frm.doc.docstatus === 1) {
            frm.add_custom_button(
                __("Sales Order"),
                () => {
                    frappe.call({
                        method: "sasco.api.quotation_api.make_sales_order_from_quotation",
                        args: {
                            source_name: frm.doc.name
                        },
                        freeze: true,
                        freeze_message: __("Creating Sales Order…"),
                        callback(r) {
                            if (!r.exc) {
                                frappe.model.sync(r.message);
                                frappe.set_route("Form", "Sales Order", r.message.name);
                            }
                        }
                    });
                },
                __("Create")
            );
        }        
    },
    custom_allow_items_price_list: function(frm) {
        // When the checkbox is toggled
        toggle_price_list_field(frm);
    },
	custom_quotation_template(frm) {
	    if (frm.doc.custom_quotation_template) {
		    frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Quotation Template",
                    name: frm.doc.custom_quotation_template,
                },
                callback(r) {
                    if(r.message) {
                        var ftr = r.message.quotation_items;
                        frm.set_value("items", []);
                        for (var i = 0; i < ftr.length; i++) {
                            var ele = ftr[i];
                            var row = frappe.model.add_child(
                              frm.doc,
                              "Quotation Item",
                              "items"
                            );
                            row.item_code = ele.item;
                            row.item_name = ele.item_name;
                            row.description = ele.item_name;
                            row.uom = ele.uom;
                            row.qty = ele.quantity;
                            row.custom_stiffener_total_qty = ele.stiffener_total_qty;
                            row.custom_fixing_1st_side = ele.fixing_1st_side;
                            row.custom_fixing_2nd_side = ele.fixing_2nd_side;
                            row.custom_vanes_nos = ele.vanes_nos;
                            row.custom_stiffener_total_qty = ele.stiffener_total_qty;
                            row.custom_kg = ele.kg;
                            row.custom_area_in_sqm = ele.area_in_sqm;
                            row.custom_lm = ele.lm;
                            
                            // Set custom price list if allowed
                            row.custom_price_list = frm.doc.selling_price_list;
                        }
                        refresh_field("items");
                    }
                }
            });
	    }
	},    
    currency(frm) {
        update_currency_labels(frm);
    }
});

function toggle_price_list_field(frm) {

}
frappe.ui.form.on('Quotation Item', {
    custom_price_list: function(frm, cdt, cdn) {
        if (!frm.doc.custom_allow_items_price_list)
        {
            return;
        }
        
        let row = locals[cdt][cdn];

        if (!row.item_code || !row.custom_price_list) {
            frappe.msgprint("Please select both Item and Price List.");
            return;
        }

        // Call server-side method to fetch rate
        frappe.call({
            method: "frappe.client.get_value",
            args: {
                doctype: "Item Price",
                filters: {
                    item_code: row.item_code,
                    price_list: row.custom_price_list,
                    uom: row.uom || undefined
                },
                fieldname: ["price_list_rate"]
            },
            callback: function (r) {
                let new_rate = (r.message && r.message.price_list_rate) ? r.message.price_list_rate : 0;

                frappe.model.set_value(cdt, cdn, "price_list_rate", new_rate);
               // console.log("💰 Rate updated:", new_rate);
            }
        });
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
