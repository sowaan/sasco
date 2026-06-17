// Copyright (c) 2026, Sowaan and contributors
// For license information, please see license.txt

frappe.ui.form.on('Fabrication Filter', {

    refresh: function (frm) {
        if (frm.doc.docstatus === 1) {
            frm.add_custom_button(
                __("Sales Quotation"),
                function () {
                    // collect only selected fabrication names
                    let fabrication_names = (frm.fields_dict.filtered_fabrication_list.grid.get_selected_children() || [])
                        .map(row => row.fabrication);

                    if (!fabrication_names.length) {
                        frappe.msgprint("Please select at least one Fabrication List.");
                        return;
                    }

                    frappe.prompt(
                        [
                            {
                                fieldname: "uom",
                                label: "Unit of Measurement",
                                fieldtype: "Select",
                                options: ["SQM", "KG"],
                                reqd: 1,
                                default: "SQM"
                            }
                        ],
                        function (values) {
                            frappe.call({
                                method: "sasco.sasco.utils.fabrication_utils.create_quotation_from_fabrication_filter_aggr",
                                args: {
                                    fabrication_names: fabrication_names,  // only selected names
                                    uom: values.uom
                                },
                                callback: function (r) {
                                    if (!r.exc) {
                                        frappe.set_route("Form", "Quotation", r.message);
                                    }
                                }
                            });
                        },
                        __("Select UOM"),
                        __("Create")
                    );
                },
                __("Create")
            );

            frm.add_custom_button(
                __("Proforma Invoice"),
                function () {
                    createProformaInvoice(frm.doc);
                },
                __("Create")
            );
        }
    },

    // Selecting the Sales Order drives everything: customer (read-only, fetched),
    // the filtered fabrication list, items, parent items and totals.
    sales_order: function (frm) {
        if (!frm.doc.sales_order) {
            frm.clear_table('filtered_fabrication_list');
            frm.clear_table('fabrication_filter_items');
            frm.clear_table('parent_item');
            frm.refresh_field('filtered_fabrication_list');
            frm.refresh_field('fabrication_filter_items');
            frm.refresh_field('parent_item');
            frm.set_value('net_total', 0);
            frm.set_value('tax_amount', 0);
            frm.set_value('grand_total', 0);
            return;
        }

        frappe.call({
            method: "sasco.sasco.doctype.fabrication_filter.fabrication_filter.load_from_sales_order",
            args: {
                sales_order: frm.doc.sales_order,
                taxes_and_charges: frm.doc.taxes_and_charges || null
            },
            freeze: true,
            freeze_message: __("Loading fabrication records..."),
            callback: function (r) {
                if (r.exc || !r.message) return;
                let data = r.message;

                fill_table(frm, 'filtered_fabrication_list', data.filtered_fabrication_list);
                fill_table(frm, 'fabrication_filter_items', data.fabrication_filter_items);
                fill_table(frm, 'parent_item', data.parent_item);

                frm.set_value('net_total', data.net_total || 0);
                frm.set_value('tax_amount', data.tax_amount || 0);
                frm.set_value('grand_total', data.grand_total || 0);

                if (!data.filtered_fabrication_list || !data.filtered_fabrication_list.length) {
                    frappe.msgprint(__('No submitted Fabrication Lists found for this Sales Order.'));
                }
            }
        });
    },

    // Recompute tax + grand total live from the loaded parent_item amounts.
    taxes_and_charges: function (frm) {
        calculate_totals(frm);
    }

});


// Replace a child table with the given rows and refresh it.
function fill_table(frm, fieldname, rows) {
    frm.clear_table(fieldname);
    (rows || []).forEach(row => {
        frm.add_child(fieldname, row);
    });
    frm.refresh_field(fieldname);
}


// Live tax/grand-total recompute using existing parent_item amounts.
function calculate_totals(frm) {
    let net_total = 0;
    (frm.doc.parent_item || []).forEach(row => { net_total += (row.amount || 0); });
    frm.set_value('net_total', net_total);

    if (!frm.doc.taxes_and_charges) {
        frm.set_value('tax_amount', 0);
        frm.set_value('grand_total', net_total);
        return;
    }

    frappe.db.get_doc('Sales Taxes and Charges Template', frm.doc.taxes_and_charges).then(tax_doc => {
        let tax_amount = 0;
        (tax_doc.taxes || []).forEach(tax => {
            if (tax.charge_type === 'On Net Total') {
                tax_amount += net_total * (tax.rate || 0) / 100;
            } else if (tax.charge_type === 'Actual') {
                tax_amount += (tax.tax_amount || 0);
            }
        });
        frm.set_value('tax_amount', tax_amount);
        frm.set_value('grand_total', net_total + tax_amount);
    });
}


async function createQuotation(fabrication_filter) {
    frappe.new_doc("Quotation", { "quotation_to": "Customer" }, async (doc) => {
        doc.company = fabrication_filter.company;
        doc.transaction_date = frappe.datetime.get_today();
        doc.custom_quotation_status = 'Under Negotiation';
        doc.party_name = fabrication_filter.customer;
        doc.project = fabrication_filter.project;
        doc.custom_multi_fabrication = 1;
        doc.custom_fabrication_filter = fabrication_filter.name;
        doc.custom_parent_item = fabrication_filter.parent_item;
        doc.items = [];

        fabrication_filter.fabrication_filter_items.forEach(item => {
            let row = frappe.model.add_child(doc, "items");
            frappe.model.set_value(row.doctype, row.name, 'item_code', item.item);
            frappe.model.set_value(row.doctype, row.name, 'custom_parent_item_1', item.parent_item);

            row.rate = 0;
            row.uom = "";

            if (row.item_code) {
                frappe.call({
                    method: "erpnext.stock.get_item_details.get_item_details",
                    args: {
                        args: {
                            item_code: row.item_code,
                            from_warehouse: row.from_warehouse,
                            warehouse: row.warehouse,
                            doctype: 'Quotation',
                            buying_price_list: frappe.defaults.get_default("buying_price_list"),
                            currency: frappe.defaults.get_default("Currency"),
                            name: doc.name,
                            qty: item.quantity,
                            stock_qty: row.stock_qty,
                            company: doc.company,
                            conversion_rate: 1,
                            plc_conversion_rate: 1,
                            rate: row.rate,
                            uom: item.uom,
                            conversion_factor: row.conversion_factor,
                            project: row.project,
                        },
                        overwrite_warehouse: true,
                    },
                    callback: function (r) {
                        const d = row;
                        const allow_to_change_fields = [
                            "actual_qty",
                            "projected_qty",
                            "min_order_qty",
                            "item_name",
                            "description",
                            "stock_uom",
                            "uom",
                            "conversion_factor",
                            "stock_qty",
                        ];

                        if (!r.exc) {
                            $.each(r.message, function (key, value) {
                                if (!d[key] || allow_to_change_fields.includes(key)) {
                                    d[key] = value;
                                }
                            });

                            if (d.price_list_rate != r.message.price_list_rate) {
                                d.rate = 0.0;
                                d.price_list_rate = r.message.price_list_rate;
                                frappe.model.set_value(d.doctype, d.name, "rate", d.price_list_rate);
                            }
                            refresh_field("items");
                        }
                    },
                });
            }
        });
    });
}


async function createProformaInvoice(fabrication_filter) {
    frappe.new_doc("Proforma Invoice", {}, async (doc) => {
        doc.company = fabrication_filter.company;
        doc.customer = fabrication_filter.customer;
        doc.custom_fabrication_filter = fabrication_filter.name;
        doc.custom_multi_fabrication = 1;
        doc.custom_parent_item = fabrication_filter.parent_item;
        doc.transaction_date = frappe.datetime.get_today();

        doc.items = [];

        fabrication_filter.fabrication_filter_items.forEach(item => {
            let row = frappe.model.add_child(doc, "items");
            frappe.model.set_value(row.doctype, row.name, 'item_code', item.item);
            frappe.model.set_value(row.doctype, row.name, 'custom_parent_item_1', item.parent_item);

            row.rate = 0;
            row.uom = "";

            if (row.item_code) {
                frappe.call({
                    method: "erpnext.stock.get_item_details.get_item_details",
                    args: {
                        args: {
                            item_code: row.item_code,
                            from_warehouse: row.from_warehouse,
                            warehouse: row.warehouse,
                            doctype: 'Quotation',
                            buying_price_list: frappe.defaults.get_default("buying_price_list"),
                            currency: frappe.defaults.get_default("Currency"),
                            name: doc.name,
                            qty: item.quantity,
                            stock_qty: row.stock_qty,
                            company: doc.company,
                            conversion_rate: 1,
                            plc_conversion_rate: 1,
                            rate: row.rate,
                            uom: item.uom,
                            conversion_factor: row.conversion_factor,
                            project: row.project
                        },
                        overwrite_warehouse: true
                    },
                    callback: function (r) {
                        const d = row;
                        const allow_to_change_fields = [
                            "actual_qty",
                            "projected_qty",
                            "min_order_qty",
                            "item_name",
                            "description",
                            "stock_uom",
                            "uom",
                            "conversion_factor",
                            "stock_qty"
                        ];

                        if (!r.exc) {
                            $.each(r.message, function (key, value) {
                                if (!d[key] || allow_to_change_fields.includes(key)) {
                                    d[key] = value;
                                }
                            });

                            if (d.price_list_rate != r.message.price_list_rate) {
                                d.rate = 0.0;
                                d.price_list_rate = r.message.price_list_rate;
                                frappe.model.set_value(d.doctype, d.name, "rate", d.price_list_rate);
                            }

                            refresh_field("items");
                        }
                    }
                });
            }
        });
    });
}
