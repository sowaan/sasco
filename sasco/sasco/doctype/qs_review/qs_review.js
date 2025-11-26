// // Copyright (c) 2025, Sowaan and contributors
// // For license information, please see license.txt

frappe.ui.form.on("QS Review", {
    sales_order(frm) {
        if (!frm.doc.sales_order) return;

        frappe.call({
            method: "sasco.sasco.doctype.qs_review.qs_review.get_qs_items",
            args: {
                sales_order: frm.doc.sales_order
            },
            freeze: true,
            freeze_message: "Fetching items...",
            callback: function (r) {

                if (!r.message) return;

                const items = r.message;

                // Clear existing table rows
                frm.clear_table("detail_table");

                // Add each row to child table
                items.forEach(row => {
                    let child = frm.add_child("detail_table");
                    sod_fl_qty = row.fl_qty || 0;
                    sod_mo_qty = row.mo_qty || 0;
                    sod_balance = row.qty -  sod_mo_qty;
                    
                    sod_balance_amount = sod_balance * row.rate;
  

                    child.item_code = row.item_code;
                    child.item_name = row.item_name;
                    child.sod_qty = row.qty;
                    child.uom = row.uom;
                    child.rate = row.rate;
                    child.spl_qty = sod_fl_qty
                    child.utilized_from_sod = sod_mo_qty;
                    child.sod_balance_qty = sod_balance;
                    child.sod_balance_amount = sod_balance_amount;
                    // child.amount = row.amount;
                });

                frm.refresh_field("detail_table");

                // frappe.msgprint("Items loaded successfully!");
            }
        });
    }
});



// frappe.ui.form.on("QS Review", {
// 	refresh(frm) {

// 	},
//     sales_order(frm) {
//         if (!frm.doc.sales_order) {
//             return;
//         }

//         frappe.call({
//             method: "sasco.sasco.doctype.qs_review.qs_review.get_qs_items",
//             args: {
//                 sales_order: frm.doc.sales_order,
//                 doc: frm.doc    // send the current parent doc
//             },
//             freeze: true,
//             freeze_message: "Fetching items...",
//             callback: function(r) {
//                 if (r.message && r.message.status === "success") {
//                     frm.reload_doc();   // refresh child table
//                     frappe.msgprint("Items updated successfully!");
//                 }
//             }
//         });
//     }
// });
