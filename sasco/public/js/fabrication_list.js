//The scripts are not working as expected. Please fix the issues and make sure the code is functional.
//The code is not called even when we add in hooks.py doctype_js = {"Sales Inquiry": "public/js/sales_inquiry.js"}
//For now I've included the code in client script on website. Please fix the issues in this file and remove from client script.


frappe.ui.form.on('Fabrication List', {
    refresh(frm) {
        if (frm.doc.docstatus === 1) {
            frm.add_custom_button(
                __("Sales Quotation"),
                function () {
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
                                method: "sasco.sasco.utils.fabrication_utils.create_quotation_from_fabrication",
                                args: {
                                    fabrication_name: frm.doc.name,
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
            // frm.add_custom_button(
            //     __("Sales Quotation"),
            //     function () {
            //         //sufyancreateQuotationChildItems(frm.doc);
            //         frappe.call({
            //             method: "sasco.sasco.utils.fabrication_utils.create_quotation_from_fabrication",
            //             args: { fabrication_name: cur_frm.doc.name },
            //             callback: function (r) {
            //                 if (!r.exc) {
            //                     frappe.set_route("Form", "Quotation", r.message);
            //                 }
            //             }
            //         });
            //     },
            //     __("Create")
            // );
            frm.add_custom_button(
                __("Manufacture Order"),
                function () {
                    sufyancreateManufactureOrder(frm.doc);
                    // frappe.call({
                    //     method: "sasco.sasco.utils.fabrication_utils.create_manufacture_order",
                    //     args: { fabrication_name: frm.doc.name },
                    //     callback: function(r) {
                    //         if (r.message) {
                    //             frappe.set_route("Form", "Manufacture Order", r.message);
                    //         }
                    //     }
                    // });  
                },
                __("Create")
            );
            frm.add_custom_button(
                __("Costing Sheet"),
                function () {
                    sufyancreateCostingSheet(frm.doc);
                },
                __("Create")
            );
        }
    },


    fabrication_type: function (frm) {
        if (frm.doc.fabrication_type == 'Sales Inquiry') {
            frm.set_value('sales_order', null);
        }
        else if (frm.doc.fabrication_type == 'Sales Order') {
            frm.set_value('priority', null);
        }
        else {
            frm.set_value('sales_order', null);
            frm.set_value('priority', null);
        }
    },


    sales_order: async function (frm) {
        if (frm.doc.sales_order) {
            if (frm.doc.fabrication_type == 'Sales Order') {
                so_doc = await frappe.db.get_doc('Sales Order', frm.doc.sales_order);
                frm.set_value('client_ref', so_doc.customer);
                frm.set_value('project_ref', so_doc.project);
                frm.set_value('company', so_doc.company);
            }
        }

    },




});


async function sufyancreateQuotation(fabrication) {


    frappe.new_doc("Quotation", { "quotation_to": "Customer" }, doc => {

        doc.company = fabrication.company;
        doc.transaction_date = frappe.datetime.get_today();
        doc.custom_quotation_status = 'Under Negotiation';
        doc.custom_refrence = fabrication.priority;
        doc.party_name = fabrication.client_ref;
        doc.project = fabrication.project_ref;
        doc.custom_fabrication_list = fabrication.name;
        doc.custom_job_number = fabrication.job_number;
        doc.items = [];


        let unique_codes = {};

        if (fabrication.fabrication_table) {
            fabrication.fabrication_table.forEach(row => {
                let key = row.spl_item_fg_code;

                if (!unique_codes[key]) {
                    unique_codes[key] = {
                        spl_item_fg_code: row.spl_item_fg_code,
                        spl_qty_in_pcs: parseFloat(row.spl_qty_in_pcs) || 0,
                        spl_area_sqm: parseFloat(row.spl_area_sqm) || 0,
                        spl_weight_kg: parseFloat(row.spl_weight_kg) || 0
                    };
                } else {
                    unique_codes[key].spl_qty_in_pcs += parseFloat(row.spl_qty_in_pcs) || 0;
                    unique_codes[key].spl_area_sqm += parseFloat(row.spl_area_sqm) || 0;
                    unique_codes[key].spl_weight_kg += parseFloat(row.spl_weight_kg) || 0;
                }
            });
        }

        // console.log(unique_codes);


        Object.values(unique_codes).forEach(item => {


            let row = frappe.model.add_child(doc, "items");
            frappe.model.set_value(row.doctype, row.name, 'item_code', item.spl_item_fg_code);

            frappe.model.set_value(row.doctype, row.name, 'custom_spl_area_sqm', item.spl_area_sqm);
            frappe.model.set_value(row.doctype, row.name, 'custom_spl_weight_kg', item.spl_weight_kg);


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
                            qty: item.spl_qty_in_pcs,
                            stock_qty: row.stock_qty,
                            company: doc.company,
                            conversion_rate: 1,
                            // 	material_request_type: 'Purchase',
                            plc_conversion_rate: 1,
                            rate: row.rate,
                            uom: row.uom,
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
                            // frappe.model.set_value(d.doctype, d.name, "qty", item.qty);
                            refresh_field("items");
                        }
                    },
                });
            }



        });


        let acc_unique_codes = {};

        if (fabrication.accessory) {
            fabrication.accessory.forEach(row => {
                let key = `${row.child_finished_good_item}-${row.child_finished_good_uom}`; // Composite Key

                if (!acc_unique_codes[key]) {
                    acc_unique_codes[key] = {
                        child_finished_good_item: row.child_finished_good_item,
                        child_finished_good_uom: row.child_finished_good_uom,
                        child_finished_good_qty: parseFloat(row.child_finished_good_qty) || 0,
                    };
                } else {
                    acc_unique_codes[key].child_finished_good_qty += parseFloat(row.child_finished_good_qty) || 0;
                }
            });
        }

        // console.log(acc_unique_codes);



        Object.values(acc_unique_codes).forEach(item => {


            // console.log(item.child_finished_good_item);

            let row = frappe.model.add_child(doc, "items");
            frappe.model.set_value(row.doctype, row.name, 'item_code', item.child_finished_good_item);



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
                            qty: item.child_finished_good_qty,
                            stock_qty: row.stock_qty,
                            company: doc.company,
                            conversion_rate: 1,
                            // 	material_request_type: 'Purchase',
                            plc_conversion_rate: 1,
                            rate: row.rate,
                            uom: item.child_finished_good_uom,
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
                            // frappe.model.set_value(d.doctype, d.name, "qty", item.qty);
                            refresh_field("items");
                        }
                    },
                });
            }



        });









    });
}





async function sufyancreateManufactureOrder(fabrication) {
    frappe.new_doc("Manufacture Order", { company: fabrication.company }, doc => {
        // Basic fields
        Object.assign(doc, {
            company: fabrication.company,
            date: fabrication.normal,
            fabrication_list: fabrication.name,
            total_fl_item_qty: fabrication.total_fl_item_qty,
            total_coil_item_qty: fabrication.total_coil_item_qty
        });

        // 1. Costing Sheet Items
        fabrication.fabrication_table.forEach(item => {
            let row = frappe.model.add_child(doc, "Costing Sheet Item", "item_table");
            Object.assign(row, {
                item_code: item.fg_batch_sr,
                item_name: item.fl_item_name,
                parent_finished_goods_item: item.spl_item_fg_code,
                quantity: item.fl_item_qty,
                uom: item.fl_item_uom,
                item_guage: item.fl_item_gauge,
                spl_area_sqm: item.spl_area_sqm,
                spl_weight_kg: item.spl_weight_kg,
                cam_item_vanes_splitter_qty_1: item.cam_item_vanes_splitter_qty_1,
                cam_item_duct_seam_1: item.cam_item_duct_seam_1,
                duct_range: item.duct_range,
                duct_connector_1: item.duct_connector_1,
                duct_connector_2: item.duct_connector_2,
                pl_item_length__angle: item.pl_item_length__angle,
                fabrication_cost: item.operation_cost
            });
        });

        // 2. Material List
        fabrication.material_list1.forEach(item => {
            let row = frappe.model.add_child(doc, "Manufacture Order Material List", "raw_material_item");
            Object.assign(row, {
                fl_item: item.fl_item,
                fl_item_gauge: item.fl_item_gauge,
                sum_of_fl_item_qty: item.sum_of_fl_item_qty,
                spl_item_fg_code: item.spl_item_fg_code,
                spl_item_fg_name: item.spl_item_fg_name,
                coil_item_code_rm: item.coil_item_code_rm,
                coil_item_uom: item.coil_item_uom,
                coil_item_brand: item.coil_item_brand,
                coil_item_specification: item.coil_item_specification,
                item_group: item.coil_item_group,
                coil_item_qty: item.coil_item_qty,
                coil_item_remaining_qty: item.coil_item_qty,
                sum_of_duct_weight: item.sum_of_duct_weight,
                sum_of_duct_area_with_seam: item.sum_of_duct_area_with_seam,
                fg_batch_sr: item.fg_batch_sr
            });
        });

        // 3. Material Summary
        fabrication.material_summary.forEach(item => {
            let row = frappe.model.add_child(doc, "Manufacture Order Material Summary", "raw_material_summary");
            Object.assign(row, {
                parent_finished_good: item.parent_finished_good,
                material_item_code: item.material_item_code,
                material_item_brand: item.material_item_brand,
                material_item_uom: item.material_item_uom,
                material_item_qty: item.material_item_qty,
                material_item_max_qty: 0,
                material_item_used_qty: 0,
                material_item_remaining_qty: 0,
                sum_of_fl_item_qty: item.sum_of_fl_item_qty,
                fl_item_gauge: item.fl_item_gauge,
                sum_of_duct_weight: item.sum_of_duct_weight,
                sum_of_duct_area_with_seam: item.sum_of_duct_area_with_seam,
                fl_item_specification: item.fl_item_specification
            });
        });

        // 4. Accessory Summary
        fabrication.acc_item.forEach(item => {
            let row = frappe.model.add_child(doc, "Accessory Item Summary", "accessory_summary");
            Object.assign(row, {
                item_code: item.item_code,
                item_code_linked: item.item_code,
                item_name: item.item_name,
                uom: item.uom,
                qty: item.qty
            });
        });

        // 5. Auto Fold Summary (fixed)
        fabrication.auto_fold_summary.forEach(item => {
            let row = frappe.model.add_child(doc, "Auto Fold Summary", "auto_fold_summary");
            Object.assign(row, {
                item_code: item.item_code,
                item_name: item.item_name,
                uom: item.uom,
                qty: item.qty
            });
        });

        // 6. Fabrication Item Summary
        fabrication.duct_and_acc_item.forEach(item => {
            let row = frappe.model.add_child(doc, "Fabrication Item Summary", "duct_and_acc_item");
            Object.assign(row, {
                item_code: item.item_code,
                item_name: item.item_name,
                uom: item.uom,
                qty: item.qty,
                spl_area_sqm: item.spl_area_sqm,
                spl_weight_kg: item.spl_weight_kg,
                duct_range: item.duct_range
            });
        });

        // Navigate to the new Manufacture Order form
        frappe.set_route("Form", "Manufacture Order", doc.name);
    });
}





async function sufyancreateCostingSheet(fabrication) {


    frappe.new_doc("Costing Sheet", { "fabrication_list": fabrication.name }, doc => {
        doc.company = fabrication.company;
        doc.date = fabrication.normal;
        doc.customer = fabrication.client_ref;
        doc.project = fabrication.project_ref;
        doc.item_group = fabrication.item_group;

        // doc.table_rpga = [];


    });
}



async function sufyancreateQuotationChildItems(fabrication) {

    frappe.new_doc("Quotation", { "quotation_to": "Customer" }, doc => {

        doc.company = fabrication.company;
        doc.transaction_date = frappe.datetime.get_today();
        doc.custom_quotation_status = 'Under Negotiation';
        doc.custom_refrence = fabrication.priority;
        doc.party_name = fabrication.client_ref;
        doc.project = fabrication.project_ref;
        doc.custom_fabrication_list = fabrication.name;
        doc.custom_job_number = fabrication.job_number;
        doc.items = [];


        let unique_codes = {};
        let defaultBuyingPriceList = frappe.defaults.get_default("buying_price_list");
        let defaultSellingPriceList = frappe.defaults.get_default("selling_price_list");

        if (fabrication.fabrication_table) {
            fabrication.fabrication_table.forEach(row => {
                let key = row.fg_batch_sr;

                if (!unique_codes[key]) {
                    unique_codes[key] = {
                        parent_item: row.spl_item_fg_code,
                        fg_batch_sr: row.fg_batch_sr,
                        fl_item_qty: parseFloat(row.fl_item_qty) || 0
                    };
                } else {
                    unique_codes[key].fl_item_qty += parseFloat(row.fl_item_qty) || 0;
                    unique_codes[key].parent_item += row.spl_item_fg_code;

                }
            });
        }

        Object.values(unique_codes).forEach(item => {


            let row = frappe.model.add_child(doc, "items");
            frappe.model.set_value(row.doctype, row.name, 'item_code', item.fg_batch_sr);

            frappe.model.set_value(row.doctype, row.name, 'custom_parent_item_1', item.parent_item);
            // row.custome_parent_item = item.parent_item ;


            row.rate = 0;
            row.uom = "";

            if (row.item_code) {
                // Print args values for testing


                frappe.call({
                    method: "erpnext.stock.get_item_details.get_item_details",
                    args: {
                        args: {
                            item_code: row.item_code,
                            from_warehouse: row.from_warehouse,
                            warehouse: row.warehouse,
                            doctype: 'Quotation',
                            buying_price_list: defaultBuyingPriceList,
                            currency: frappe.defaults.get_default("Currency"),
                            name: doc.name,
                            qty: item.fl_item_qty,
                            stock_qty: row.stock_qty,
                            company: doc.company,
                            conversion_rate: 1,
                            // 	material_request_type: 'Purchase',
                            plc_conversion_rate: 1,
                            rate: row.rate,
                            uom: row.uom,
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
                            // frappe.model.set_value(d.doctype, d.name, "qty", item.qty);
                            refresh_field("items");
                        }
                    },
                });
            }


            // frappe.model.set_value(row.doctype, row.name, 'custome_parent_item', item.parent_item);
            // refresh_field("items");


        });




        let acc_unique_codes = {};

        if (fabrication.accessory) {
            fabrication.accessory.forEach(row => {
                let key = `${row.child_finished_good_item}-${row.child_finished_good_uom}`; // Composite Key

                if (!acc_unique_codes[key]) {
                    acc_unique_codes[key] = {
                        parent_item: row.parent_finished_good_item,
                        child_finished_good_item: row.child_finished_good_item,
                        child_finished_good_uom: row.child_finished_good_uom,
                        child_finished_good_qty: parseFloat(row.child_finished_good_qty) || 0,
                    };
                } else {
                    acc_unique_codes[key].child_finished_good_qty += parseFloat(row.child_finished_good_qty) || 0;
                }
            });
        }

        Object.values(acc_unique_codes).forEach(item => {



            let row = frappe.model.add_child(doc, "items");
            frappe.model.set_value(row.doctype, row.name, 'item_code', item.child_finished_good_item);
            frappe.model.set_value(row.doctype, row.name, 'custom_parent_item_1', item.parent_item);


            row.rate = 0;
            row.uom = "";
            if (item.child_finished_good_item == "HDFSRI0000001 - M") {
                console.log("item", item);
                console.log("row on top", row);
            }
            if (row.item_code) {
                //                 console.log("frappe.call args:", {
                //     item_code: row.item_code,
                //     from_warehouse: row.from_warehouse,
                //     warehouse: row.warehouse,
                //     doctype: 'Quotation',
                //     buying_price_list: defaultBuyingPriceList,
                //     currency: frappe.defaults.get_default("Currency"),
                //     name: doc.name,
                //     qty: item.fl_item_qty,
                //     stock_qty: row.stock_qty,
                //     company: doc.company,
                //     conversion_rate: 1,
                //     plc_conversion_rate: 1,
                //     rate: row.rate,
                //     uom: row.uom,
                //     conversion_factor: row.conversion_factor,
                //     project: row.project,
                // });
                frappe.call({
                    method: "erpnext.stock.get_item_details.get_item_details",
                    args: {
                        args: {
                            item_code: row.item_code,
                            from_warehouse: row.from_warehouse,
                            warehouse: row.warehouse,
                            doctype: 'Quotation',
                            buying_price_list: defaultBuyingPriceList,
                            currency: frappe.defaults.get_default("Currency"),
                            name: doc.name,
                            qty: item.child_finished_good_qty,
                            stock_qty: row.stock_qty,
                            company: doc.company,
                            conversion_rate: 1,
                            // 	material_request_type: 'Purchase',
                            plc_conversion_rate: 1,
                            rate: row.rate,
                            uom: item.child_finished_good_uom,
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
                            if (item.child_finished_good_item == "HDFSRI0000001 - M") {
                                console.log("result", r.message);
                                console.log("row", d);
                            }

                            // frappe.model.set_value(d.doctype, d.name, "qty", item.qty);
                            // console.log("pricelistrate", d.item_code, d.price_list_rate)
                            refresh_field("items");
                        }
                    },
                });
            }



        });



        let parent_unique_codes = {};

        if (fabrication.fabrication_table) {
            fabrication.fabrication_table.forEach(row => {
                let key = row.spl_item_fg_code;

                if (!parent_unique_codes[key]) {
                    parent_unique_codes[key] = {
                        spl_item_fg_code: row.spl_item_fg_code,
                        spl_qty_in_pcs: parseFloat(row.spl_qty_in_pcs) || 0,
                        spl_area_sqm: parseFloat(row.spl_area_sqm) || 0,
                        spl_item_fg_uom: row.spl_item_fg_uom,
                        spl_weight_kg: row.spl_weight_kg
                    };
                } else {
                    parent_unique_codes[key].spl_qty_in_pcs += parseFloat(row.spl_qty_in_pcs) || 0;
                    parent_unique_codes[key].spl_area_sqm += parseFloat(row.spl_area_sqm) || 0;
                    parent_unique_codes[key].spl_weight_kg += parseFloat(row.spl_weight_kg) || 0;
                }
            });
        }

        Object.values(parent_unique_codes).forEach(item => {


            let row = frappe.model.add_child(doc, "custom_parent_item");
            frappe.model.set_value(row.doctype, row.name, 'parent_item', item.spl_item_fg_code);

            frappe.model.set_value(row.doctype, row.name, 'spl_area_sqm', item.spl_area_sqm);
            frappe.model.set_value(row.doctype, row.name, 'cam_item_qty', item.spl_qty_in_pcs);
            frappe.model.set_value(row.doctype, row.name, 'total_kg', item.spl_weight_kg);
            frappe.model.set_value(row.doctype, row.name, 'fg_item_uom', item.spl_item_fg_uom);

            frappe.model.set_value(row.doctype, row.name, 'price_list', defaultSellingPriceList);
            refresh_field("custom_parent_item");


        });

        //again to add accessory items to parent items

        Object.values(acc_unique_codes).forEach(item => {


            let row = frappe.model.add_child(doc, "custom_parent_item");
            frappe.model.set_value(row.doctype, row.name, 'parent_item', item.child_finished_good_item);
            // frappe.model.set_value(row.doctype, row.name, 'total_kg', item.child_finished_good_qty);

            frappe.model.set_value(row.doctype, row.name, 'spl_area_sqm', item.child_finished_good_qty);
            frappe.model.set_value(row.doctype, row.name, 'cam_item_qty', item.child_finished_good_qty);
            frappe.model.set_value(row.doctype, row.name, 'total_kg', 0);
            frappe.model.set_value(row.doctype, row.name, 'fg_item_uom', item.child_finished_good_uom);
            frappe.model.set_value(row.doctype, row.name, 'price_list', defaultSellingPriceList);
            refresh_field("custom_parent_item");

        });



    });

}
