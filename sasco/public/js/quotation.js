frappe.ui.form.on('Quotation', {
    refresh(frm) {
        console.log("Quotation form refreshed");
        update_currency_labels(frm);
    },
    currency(frm) {
        update_currency_labels(frm);
    }
});

// frappe.ui.form.on('Fabrication Parent Item', {
//     spl_area_sqm(frm, cdt, cdn) {
//         calculate_fabrication_totals(frm);
//     },
//     parent_item(frm, cdt, cdn) {
//         frappe.call({
//             method: "frappe.client.get_value",
//             args: {
//                 doctype: "Item Price",
//                 filters: {
//                     item_code: locals[cdt][cdn].parent_item,
//                     price_list: frm.doc.price_list
//                 },
//                 fieldname: "price_list_rate"
//             },
//             callback: function(r) {
//                 if (r.message) {
//                     frappe.model.set_value(cdt, cdn, "rate", r.message.price_list_rate);
//                     const row = locals[cdt][cdn];
//                     frappe.model.set_value(cdt, cdn, "amount", row.spl_area_sqm * r.message.price_list_rate);
//                     calculate_fabrication_totals(frm);
//                 }
//             }
//         });
//     }
// });

// function calculate_fabrication_totals(frm) {
//     let total_qty = 0;
//     let total_amount = 0;

//     frm.doc.fabrication_parent_item.forEach(row => {
//         total_qty += flt(row.qty);
//         total_amount += flt(row.amount);
//     });

//     frm.set_value('custom_parent_total_qty', total_qty);
//     frm.set_value('custom_parent_total', total_amount);

//     let total_item_qty = frm.doc.total_qty || frm.doc.items.reduce((sum, item) => sum + flt(item.qty), 0);

//     if (total_item_qty && total_amount) {
//         frm.doc.items.forEach(item => {
//             if (item.qty) {
//                 let amt = (flt(item.qty) / total_item_qty) * total_amount;
//                 item.rate = amt / flt(item.qty);
//                 item.amount = amt;
//             }
//         });
//         frm.refresh_field('items');
//     }
// }


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
