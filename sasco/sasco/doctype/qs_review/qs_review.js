// Copyright (c) 2025, Sowaan and contributors
// For license information, please see license.txt

frappe.ui.form.on("QS Review", {
    onload(frm) {
        load_sales_order_items(frm);
    },

    refresh(frm) {
        // Optional safety net if doc is loaded via route
        load_sales_order_items(frm);
    },

    sales_order(frm) {
        // Still needed if user changes SO manually
        load_sales_order_items(frm);
    }    
    // sales_order(frm) {
            
    //     if (!frm.doc.sales_order) return;

    //     frappe.call({
    //         method: "sasco.sasco.doctype.qs_review.qs_review.get_qs_items",
    //         args: {
    //             sales_order: frm.doc.sales_order
    //         },
    //         freeze: true,
    //         freeze_message: "Fetching items...",
    //         callback: function (r) {
    //             if (!r.message) return;

    //             const items = r.message;

    //             // Clear existing table rows
    //             frm.clear_table("detail_table");

    //             // Add each row to child table
    //             items.forEach(row => {
    //                 const child = frm.add_child("detail_table");
    //                 //  console.log("current row is----", row);
    //                 // --- Safe defaults ---
    //                 const sod_quantity = row.quantity_sum || 0;  
    //                 const sod_qty = row.qty || 0;                        // SO qty
    //                 const sod_qty_sqm = row.sqm_qty || 0;                        // SO qty
    //                 const sod_qty_kg = row.kg_qty || 0;                        // SO qty

    //                 const rate = row.rate || 0;
    //                 const amount = row.amount || 0;

    //                 const mo_quantity = row.mo_quantity || 0;
    //                 const fl_quantity = row.fl_quantity || 0;

    //                 const mo_qty = row.mo_qty || 0;                      // Manufacture Order qty
    //                 const fl_qty = row.fl_qty || 0;                      // Fabrication List qty

    //                 const mo_qty_sqm   = row.mo_spl_area_sqm   || 0;
    //                 const mo_qty_kg  = row.mo_spl_weight_kg  || 0;
    //                 const fl_qty_sqm   = row.fl_spl_area_sqm   || 0;
    //                 const fl_qty_kg  = row.fl_spl_weight_kg  || 0;

    //                 // Balance based on MO qty (your existing logic)
    //                 const sod_balance        = sod_qty - mo_qty;
    //                 const sod_balance_sqm    = sod_qty_sqm - mo_qty_sqm;
    //                 const sod_balance_kg     = sod_qty_kg - mo_qty_kg;
    //                 const sod_quantity_balance = sod_quantity - mo_quantity;
                    
    //                 const sod_balance_amount = sod_quantity_balance * rate;

    //                 // --- Map fields to child table ---
    //                 child.item_code          = row.item_code;
    //                 child.item_name          = row.item_name;
    //                 child.sod_qty            = sod_qty;
    //                 child.uom                = row.uom;
    //                 child.rate               = rate;
    //                 child.sod_qty_sqm        = sod_qty_sqm;
    //                 child.sod_qty_kg         = sod_qty_kg;
    //                 child.sod_amount             = amount;

    //                 child.quantity = sod_quantity
    //                 child.utilized = mo_quantity
    //                 child.spl = fl_quantity
    //                 child.balance = sod_quantity_balance
                    
    //                 // From Fabrication List
    //                 // (you were using spl_qty for FL qty)
    //                 child.spl_qty            = fl_qty;
    //                 child.spl_qty_sqm        = fl_qty_sqm;   // make sure these fields exist in child doctype
    //                 child.spl_qty_kg         = fl_qty_kg;

    //                 // From Manufacture Order
    //                 child.utilized_from_sod        = mo_qty;
    //                 child.utilized_from_sod_sqm    = mo_qty_sqm;
    //                 child.mutilized_from_sod_kg    = mo_qty_kg;

    //                 // Balances
    //                 child.sod_balance_qty    = sod_balance;
    //                 child.sod_balance_amount = sod_balance_amount;

    //                 child.sod_balance_qty_sqm       = sod_balance_sqm;
    //                 child.sod_balance_qty_kg        = sod_balance_kg;

    //                 // If you want original SO amount instead of recalculated:
    //                 // child.amount = row.amount;
    //             });

    //             frm.refresh_field("detail_table");
    //         }
    //     });
    // }
});

function load_sales_order_items(frm) {
    console.log("Sales Order Number: ", frm.doc.sales_order);
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
            frm.clear_table("detail_table");

            items.forEach(row => {
                const child = frm.add_child("detail_table");

                const sod_quantity = row.quantity_sum || 0;
                const sod_qty = row.qty || 0;
                const sod_qty_sqm = row.sqm_qty || 0;
                const sod_qty_kg = row.kg_qty || 0;

                const rate = row.rate || 0;
                const amount = row.amount || 0;

                const mo_quantity = row.mo_quantity || 0;
                const fl_quantity = row.fl_quantity || 0;

                const mo_qty = row.mo_qty || 0;
                const fl_qty = row.fl_qty || 0;

                const mo_qty_sqm = row.mo_spl_area_sqm || 0;
                const mo_qty_kg = row.mo_spl_weight_kg || 0;
                const fl_qty_sqm = row.fl_spl_area_sqm || 0;
                const fl_qty_kg = row.fl_spl_weight_kg || 0;

                const sod_balance = sod_qty - mo_qty;
                const sod_balance_sqm = sod_qty_sqm - mo_qty_sqm;
                const sod_balance_kg = sod_qty_kg - mo_qty_kg;
                const sod_quantity_balance = sod_quantity - mo_quantity;

                const sod_balance_amount = sod_quantity_balance * rate;

                Object.assign(child, {
                    item_code: row.item_code,
                    item_name: row.item_name,
                    sod_qty,
                    uom: row.uom,
                    rate,
                    sod_qty_sqm,
                    sod_qty_kg,
                    sod_amount: amount,

                    quantity: sod_quantity,
                    utilized: mo_quantity,
                    spl: fl_quantity,
                    balance: sod_quantity_balance,

                    spl_qty: fl_qty,
                    spl_qty_sqm: fl_qty_sqm,
                    spl_qty_kg: fl_qty_kg,

                    utilized_from_sod: mo_qty,
                    utilized_from_sod_sqm: mo_qty_sqm,
                    mutilized_from_sod_kg: mo_qty_kg,

                    sod_balance_qty: sod_balance,
                    sod_balance_qty_sqm: sod_balance_sqm,
                    sod_balance_qty_kg: sod_balance_kg,
                    sod_balance_amount
                });
            });

            frm.refresh_field("detail_table");
        }
    });
}
