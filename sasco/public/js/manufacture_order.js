frappe.ui.form.on('Manufacture Order', {
    fabrication_process: async function (frm) {
        const proc_name = frm.doc.fabrication_process;
        // console.log('Selected Manufacturing Process:', proc_name);
        // If nothing selected → do nothing except leave grid as-is
        if (!proc_name) return;

        // ------------------------------------------------------------
        // Function that actually loads new job card rows
        // ------------------------------------------------------------
        async function load_from_process() {
            try {
                const proc = await frappe.db.get_doc('Manufacturing Process', proc_name);

                if (proc && Array.isArray(proc.detail_table)) {

                    // CLEAR only when we are sure we want to load
                    frm.clear_table('job_card');

                    for (const row of proc.detail_table) {
                        if (!row.operation) continue;

                        // add child row
                        const new_row = frm.add_child('job_card');

                        // use frappe.model.set_value so fetch_from on 'operation' fires
                        // Note: new_row.doctype and new_row.name are available
                        frappe.model.set_value(new_row.doctype, new_row.name, 'operation', row.operation);

                        // Give the fetch a moment to populate fetch_from fields.
                        // If you prefer not to wait, you can omit this — but for reliability
                        // when immediately reading the fetched fields, a tiny delay helps.
                        await new Promise(resolve => setTimeout(resolve, 80));

                        // Now set fields that are not fetched-from (or override if needed)
                        // e.g. status / per_hour_rate
                        frappe.model.set_value(new_row.doctype, new_row.name, 'status', 'Hold');

                        // If you want to explicitly read fetched values (operation_name/workstation)
                        // you can access locals:
                        // const latest = locals[new_row.doctype][new_row.name];
                        // console.log('fetched operation_name:', latest.operation_name);
                    }

                    frm.refresh_field('job_card');
                }

            } catch (err) {
                frappe.msgprint(__('Could not load Manufacturing Process: {0}', [proc_name]));
                console.error(err);
            }
        }


        // ------------------------------------------------------------
        // Check if job_card already has data
        // ------------------------------------------------------------
        const hasRows = Array.isArray(frm.doc.job_card) && frm.doc.job_card.length > 0;

        if (hasRows) {
            frappe.confirm(
                __('This action will replace all existing Job Card entries. Do you want to continue?'),

                // YES → Load new data & clear old inside load function
                () => load_from_process(),

                // NO → Do nothing (keep current grid intact)
                () => {
                    // If you want to revert fabrication_process selection, uncomment:
                    // frm.set_value('fabrication_process', frm.doc.__last_value.fabrication_process);
                    // frm.refresh_field('fabrication_process');
                }
            );
        } else {
            // No existing data → load immediately
            await load_from_process();
        }
    },
    async refresh(frm) {
        if (frm.doc.docstatus == 1 && !frm.doc.start_time) {

            frm.add_custom_button('START', () => {

                frm.set_value('start_time', frappe.datetime.now_datetime());


                frm.refresh_field('start_time');
                // frm.save();
                frm.save('Update');
            });
        }

        var fabrication = await frappe.db.get_doc(
            'Fabrication List',
            frm.doc.fabrication_list
        );

        // existing logic ...
        console.log("Building non-auto fold items...");
        await build_non_auto_fold_items(frm);

        if (frm.doc.docstatus == 1 && frm.doc.start_time) {


            frm.add_custom_button('Finished Goods Creation', async () => {

                const table_rpga_data = [...frm.doc.table_rpga] || [];

                var acc_doc = await frappe.db.get_doc('Manufacturing Order Settings');
                var acc = null;


                for (let x of acc_doc.tolerance) {
                    if (frm.doc.company == x.company) {
                        acc = x.over_head_cost_valuation_account;
                        break;
                    }
                }
                // console.log(acc);


                const tableFields = [
                    {
                        fieldtype: 'Link',
                        options: 'Item',
                        fieldname: 'item_code',
                        label: 'FG Item Code',
                        in_list_view: 1,
                        read_only: 1,
                        columns: 1,
                    },
                    {
                        fieldtype: 'Data',
                        fieldname: 'item_name',
                        label: 'FG Item Name',
                        in_list_view: 0,
                        read_only: 1,
                    },
                    {
                        fieldtype: 'Link',
                        options: 'UOM',
                        fieldname: 'uom',
                        label: 'UOM',
                        in_list_view: 0,
                        read_only: 1,
                    },
                    {
                        fieldtype: 'Float',
                        fieldname: 'qty',
                        label: 'Quantity',
                        in_list_view: 1,
                        read_only: 0,
                        columns: 1,
                    },
                    { fieldtype: 'Currency', fieldname: 'per_unit_cost', label: 'Per Unit Cost', in_list_view: 1, read_only: 1, columns: 1, },

                    { fieldtype: 'Link', options: 'Brand', fieldname: 'brand', label: 'Brand', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'item_gauge', label: 'Item Gauge', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'spl_area_sqm', label: 'SPL Area SQM', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'spl_weight_kg', label: 'SPL Weight KG', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'cam_item_vanes_splitter_qty_1', label: 'CAM Item Vanes Splitter Qty 1', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'cam_item_duct_seam_1', label: 'CAM Item Duct Seam 1', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'duct_range', label: 'Duct Range', in_list_view: 1, read_only: 1, columns: 1, },


                    { fieldtype: 'Data', fieldname: 'duct_connector_1', label: 'Duct Connector 1', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'duct_connector_2', label: 'Duct Connector 1', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'pl_item_length__angle', label: 'PL Item Length / Angle', in_list_view: 1, read_only: 1, columns: 1, },


                    { fieldtype: 'Link', options: 'Item', fieldname: 'parent_finished_goods_item', label: 'Parent Finished Good', in_list_view: 1, read_only: 1, columns: 1, },


                ];


                let dialog = new frappe.ui.Dialog({
                    title: 'Finished Goods Creation',
                    fields: [
                        {
                            fieldtype: 'Table',
                            fieldname: 'item_table',
                            label: '',
                            cannot_add_rows: 1,
                            cannot_delete_rows: 1,
                            description: 'This Table lists out only Child Finished Goods Items which are passed on Quality towards Finished Goods Store.',
                            fields: tableFields,
                            data: [],
                            get_data: () => {
                                return dummyData;
                            }
                        }
                    ],
                    size: 'extra-large',
                    primary_action_label: "Select",
                    primary_action(values) {

                        let selected_items = values.item_table.filter(row => row.__checked === 1);

                        for (let item of selected_items) {
                            if (item.qty <= 0) {
                                frappe.msgprint(`Error: Selected quantity for item ${item.item_code} must be at least 1.`);
                                return;
                            }
                        }

                        var total_spl_area_sqm = 0;
                        var per_unit_spl_area_sqm_cost = 0;

                        frm.doc.item_table.forEach(r => {
                            total_spl_area_sqm = total_spl_area_sqm + (r.spl_area_sqm || 0);
                        });

                        per_unit_spl_area_sqm_cost = frm.doc.grand_total / total_spl_area_sqm;
                        // console.log(total_spl_area_sqm);
                        // console.log(per_unit_spl_area_sqm_cost);


                        if (selected_items.length > 0) {

                            frappe.new_doc("Stock Entry", { "stock_entry_type": "Manufacture" }, doc => {

                                doc.company = frm.doc.company;
                                doc.posting_date = frappe.datetime.get_today();
                                doc.custom_manufacture_order = frm.doc.name;
                                doc.custom_manufacture_order_purpose = "Finished Goods Creation";
                                doc.items = [];

                                // let ad_row = frappe.model.add_child(doc, "additional_costs");
                                // frappe.model.set_value(ad_row.doctype, ad_row.name, 'expense_account', acc);
                                // frappe.model.set_value(ad_row.doctype, ad_row.name, 'description', "Finished Goods Item");
                                // frappe.model.set_value(ad_row.doctype, ad_row.name, 'amount', 10);
                                // refresh_field("additional_costs");

                                selected_items.forEach(item => {

                                    frappe.db.set_value('Item', item.item_code, 'valuation_rate', item.per_unit_cost);


                                    let row = frappe.model.add_child(doc, "items");
                                    frappe.model.set_value(row.doctype, row.name, 'item_code', item.item_code);
                                    frappe.model.set_value(row.doctype, row.name, 'item_name', item.item_name);
                                    frappe.model.set_value(row.doctype, row.name, 'qty', item.qty);
                                    frappe.model.set_value(row.doctype, row.name, 'uom', item.uom);
                                    frappe.model.set_value(row.doctype, row.name, 'basic_rate', item.per_unit_cost);
                                    frappe.model.set_value(row.doctype, row.name, 'valuation_rate', item.per_unit_cost);
                                    frappe.model.set_value(row.doctype, row.name, 'manufacture_order', frm.doc.name);

                                    // frappe.model.set_value(row.doctype, row.name, 'custom_finished_goods_item', item.fg_item_code);
                                    frappe.model.set_value(row.doctype, row.name, 'custom_parent_finished_goods_item', item.parent_finished_goods_item);



                                    if (row.item_code) {

                                        var ars = {
                                            item_code: row.item_code,
                                            item_name: row.item_name,
                                            warehouse: cstr(row.s_warehouse) || cstr(row.t_warehouse),
                                            transfer_qty: row.transfer_qty,
                                            serial_no: row.serial_no,
                                            batch_no: row.batch_no,
                                            bom_no: row.bom_no,
                                            expense_account: row.expense_account,
                                            cost_center: row.cost_center,
                                            company: doc.company,
                                            qty: item.qty,
                                            voucher_type: doc.doctype,
                                            voucher_no: row.name,
                                            valuation_rate: row.valuation_rate,
                                            basic_rate: row.valuation_rate,
                                            allow_zero_valuation: 0,
                                        };

                                        frappe.call({
                                            doc: doc,
                                            method: "get_item_details",
                                            args: ars,
                                            callback: function (r) {
                                                if (r.message) {
                                                    var d = locals[cdt][cdn];
                                                    $.each(r.message, function (k, v) {
                                                        if (v) {
                                                            // set_value trigger barcode function and barcode set qty to 1 in stock_controller.js, to avoid this set value manually instead of set value.
                                                            if (k != "barcode") {
                                                                frappe.model.set_value(cdt, cdn, k, v); // qty and it's subsequent fields weren't triggered
                                                            } else {
                                                                d.barcode = v;
                                                            }
                                                        }
                                                    });
                                                    refresh_field("items");

                                                    let no_batch_serial_number_value = false;
                                                    if (d.has_serial_no || d.has_batch_no) {
                                                        no_batch_serial_number_value = true;
                                                    }

                                                    if (
                                                        no_batch_serial_number_value &&
                                                        !frappe.flags.hide_serial_batch_dialog &&
                                                        !frappe.flags.dialog_set
                                                    ) {
                                                        frappe.flags.dialog_set = true;
                                                        erpnext.stock.select_batch_and_serial_no(frm, d);
                                                    } else {
                                                        frappe.flags.dialog_set = false;
                                                    }
                                                }
                                            },
                                        });



                                    }


                                });


                            });

                        }
                        else {
                            frappe.msgprint("Please select at least one item.");
                        }

                        dialog.hide();

                    },


                });


                let dummyData = [];



                (frm.doc.item_table || []).forEach(row => {
                    if (row.pass_count > 0) {
                        dummyData.push({
                            item_code: row.item_code,
                            item_name: row.item_name,
                            qty: row.quantity,
                            uom: row.uom,
                            per_unit_cost: row.per_unit_cost,

                            brand: row.item_brand,
                            item_gauge: row.item_guage,
                            spl_area_sqm: row.spl_area_sqm,
                            spl_weight_kg: row.spl_weight_kg,
                            cam_item_vanes_splitter_qty_1: row.cam_item_vanes_splitter_qty_1,
                            cam_item_duct_seam_1: row.cam_item_duct_seam_1,
                            duct_range: row.duct_range,

                            duct_connector_1: row.duct_connector_1,
                            duct_connector_2: row.duct_connector_2,
                            pl_item_length__angle: row.pl_item_length__angle,

                            parent_finished_goods_item: row.parent_finished_goods_item,

                        });
                    }
                });

                dialog.fields_dict.item_table.df.data = dummyData;
                dialog.fields_dict.item_table.refresh();

                dialog.show();


            });


            frm.add_custom_button('Material Consumption', () => {

                const table_rpga_data = [...frm.doc.table_rpga] || [];


                const tableFields = [
                    {
                        fieldtype: 'Link',
                        options: 'Item',
                        fieldname: 'item_code',
                        label: 'Item Code',
                        in_list_view: 1,
                        read_only: 1,
                        columns: 2,
                    },
                    {
                        fieldtype: 'Data',
                        fieldname: 'item_name',
                        label: 'Item Name',
                        in_list_view: 0,
                        read_only: 1,
                        columns: 1,
                    },
                    {
                        fieldtype: 'Float',
                        fieldname: 'qty',
                        label: 'Quantity',
                        in_list_view: 1,
                        read_only: 1,
                        columns: 1,
                    },
                    {
                        fieldtype: 'Float',
                        fieldname: 'used_qty',
                        label: 'Used Qty',
                        in_list_view: 1,
                        read_only: 1,
                        columns: 1,
                    },
                    {
                        fieldtype: 'Float',
                        fieldname: 'rem_qty',
                        label: 'Remaining Qty',
                        in_list_view: 1,
                        read_only: 1,
                        columns: 1,
                    },
                    {
                        fieldtype: 'Float',
                        fieldname: 'selected_qty',
                        label: 'Select Qty',
                        in_list_view: 1,
                        read_only: 0,
                        columns: 1,
                    },
                    {
                        fieldtype: 'Currency',
                        fieldname: 'rate',
                        label: 'Rate',
                        in_list_view: 1,
                        read_only: 1,
                        columns: 1,
                    },
                    {
                        fieldtype: 'Link',
                        options: 'UOM',
                        fieldname: 'uom',
                        label: 'UOM',
                        in_list_view: 1,
                        read_only: 1,
                        columns: 1,
                    },
                    {
                        fieldtype: 'Link',
                        options: 'Item',
                        fieldname: 'fg_item_code',
                        label: 'Child FG Item',
                        in_list_view: 1,
                        read_only: 1,
                        columns: 1,
                    },
                    {
                        fieldtype: 'Link',
                        options: 'Item',
                        fieldname: 'parent_fg_item_code',
                        label: 'Parent FG Item',
                        in_list_view: 1,
                        read_only: 1,
                        columns: 1,
                    },

                    {
                        fieldtype: 'Check',
                        fieldname: 'rm_check',
                        label: 'Raw Material',
                        in_list_view: 1,
                        read_only: 1,
                    },
                    {
                        fieldtype: 'Check',
                        fieldname: 'ass_check',
                        label: 'Accessory Item',
                        in_list_view: 1,
                        read_only: 1,
                    },
                    {
                        fieldtype: 'Check',
                        fieldname: 'cons_check',
                        label: 'Consumable Item',
                        in_list_view: 1,
                        read_only: 1,
                    },

                ];


                let dialog = new frappe.ui.Dialog({
                    title: 'Material Consumption',
                    fields: [
                        {
                            fieldtype: 'Table',
                            fieldname: 'item_table',
                            label: '',
                            cannot_add_rows: 1,
                            cannot_delete_rows: 1,
                            description: 'This Table contains Coils Item Details List + Accessory Items list + Consumable items for Cost Consumption Recording only.',
                            fields: tableFields,
                            data: [],
                            get_data: () => {
                                return dummyData;
                            }
                        }
                    ],
                    size: 'extra-large',
                    primary_action_label: "Select",
                    primary_action(values) {

                        let selected_items = values.item_table.filter(row => row.__checked === 1);

                        for (let item of selected_items) {
                            if (item.selected_qty > item.rem_qty) {
                                frappe.msgprint(`Error: Selected quantity (${item.selected_qty}) cannot be greater than remaining quantity (${item.rem_qty}) for item ${item.item_code}`);
                                return;
                            }
                            if (item.selected_qty <= 0) {
                                frappe.msgprint(`Error: Selected quantity for item ${item.item_code} must be at least 1.`);
                                return;
                            }
                        }


                        if (selected_items.length > 0) {

                            frappe.new_doc("Stock Entry", { "stock_entry_type": "Material Consumption for Manufacture" }, doc => {

                                doc.company = frm.doc.company;
                                doc.posting_date = frappe.datetime.get_today();
                                doc.custom_manufacture_order = frm.doc.name;
                                doc.custom_manufacture_order_purpose = "Material Consumption";
                                // doc.from_warehouse = "Consumables WH - M" ;
                                doc.items = [];

                                selected_items.forEach(item => {

                                    frappe.db.set_value('Item', item.item_code, 'valuation_rate', item.rate);

                                    let row = frappe.model.add_child(doc, "items");
                                    frappe.model.set_value(row.doctype, row.name, 'item_code', item.item_code);
                                    frappe.model.set_value(row.doctype, row.name, 'item_name', item.item_code);
                                    frappe.model.set_value(row.doctype, row.name, 'qty', item.selected_qty);
                                    frappe.model.set_value(row.doctype, row.name, 'uom', item.uom);
                                    frappe.model.set_value(row.doctype, row.name, 'custom_finished_goods_item', item.fg_item_code);
                                    frappe.model.set_value(row.doctype, row.name, 'custom_parent_finished_goods_item', item.parent_fg_item_code);

                                    frappe.model.set_value(row.doctype, row.name, 'basic_rate', item.rate);
                                    frappe.model.set_value(row.doctype, row.name, 'valuation_rate', item.rate);


                                    frappe.model.set_value(row.doctype, row.name, 'custom_manufacture_order_rate', item.rate);



                                    frappe.model.set_value(row.doctype, row.name, 'custom_raw_material', item.rm_check);
                                    frappe.model.set_value(row.doctype, row.name, 'custom_accessory_item', item.ass_check);
                                    frappe.model.set_value(row.doctype, row.name, 'custom_consumable_item', item.cons_check);

                                    frappe.model.set_value(row.doctype, row.name, 'manufacture_order', frm.doc.name);



                                    if (row.item_code) {

                                        var ars = {
                                            item_code: row.item_code,
                                            item_name: row.item_name,
                                            warehouse: cstr(row.s_warehouse) || cstr(row.t_warehouse),
                                            transfer_qty: row.transfer_qty,
                                            serial_no: row.serial_no,
                                            batch_no: row.batch_no,
                                            bom_no: row.bom_no,
                                            expense_account: row.expense_account,
                                            cost_center: row.cost_center,
                                            company: doc.company,
                                            qty: item.qty,
                                            voucher_type: doc.doctype,
                                            voucher_no: row.name,
                                            allow_zero_valuation: 1,
                                        };

                                        frappe.call({
                                            doc: doc,
                                            method: "get_item_details",
                                            args: ars,
                                            callback: function (r) {
                                                if (r.message) {
                                                    var d = locals[cdt][cdn];
                                                    $.each(r.message, function (k, v) {
                                                        if (v) {
                                                            // set_value trigger barcode function and barcode set qty to 1 in stock_controller.js, to avoid this set value manually instead of set value.
                                                            if (k != "barcode") {
                                                                frappe.model.set_value(cdt, cdn, k, v); // qty and it's subsequent fields weren't triggered
                                                            } else {
                                                                d.barcode = v;
                                                            }
                                                        }
                                                    });
                                                    refresh_field("items");

                                                    let no_batch_serial_number_value = false;
                                                    if (d.has_serial_no || d.has_batch_no) {
                                                        no_batch_serial_number_value = true;
                                                    }

                                                    if (
                                                        no_batch_serial_number_value &&
                                                        !frappe.flags.hide_serial_batch_dialog &&
                                                        !frappe.flags.dialog_set
                                                    ) {
                                                        frappe.flags.dialog_set = true;
                                                        erpnext.stock.select_batch_and_serial_no(frm, d);
                                                    } else {
                                                        frappe.flags.dialog_set = false;
                                                    }
                                                }
                                            },
                                        });



                                    }








                                    let rm_row = frappe.model.add_child(doc, "custom_raw_material");
                                    frappe.model.set_value("Raw Material Item In Stock Entry", rm_row.name, 'raw_material_item', item.item_code);
                                    frappe.model.set_value("Raw Material Item In Stock Entry", rm_row.name, 'finished_goods_item', item.fg_item_code);
                                    frappe.model.set_value("Raw Material Item In Stock Entry", rm_row.name, 'incoming_quantity', item.selected_qty);

                                    refresh_field("custom_raw_material");

                                    // rm_row.raw_material_item = item.item_code ;
                                    // rm_row.finished_goods_item = item.fg_item_code ;
                                    // rm_row.incoming_quantity = item.selected_qty ; 


                                });

                            });

                        }
                        else {
                            frappe.msgprint("Please select at least one item.");
                        }

                        dialog.hide();

                    },


                });


                let dummyData = [];


                (frm.doc.raw_material_item || []).forEach(row => {
                    dummyData.push({
                        item_code: row.coil_item_code_rm,
                        item_name: row.coil_item_code_rm,
                        qty: row.coil_item_qty,
                        used_qty: row.coil_item_used_qty,
                        rem_qty: row.coil_item_remaining_qty,
                        selected_qty: row.coil_item_remaining_qty,
                        rate: row.costing_rate,
                        uom: row.coil_item_uom,
                        fg_item_code: row.fl_item,
                        parent_fg_item_code: row.spl_item_fg_code,
                        rm_check: 1,
                        ass_check: 0,
                        cons_check: 0,
                    });
                });

                (frm.doc.accessory_summary || []).forEach(row => {
                    dummyData.push({
                        item_code: row.item_code_linked,
                        item_name: row.item_name,
                        qty: row.qty,
                        used_qty: row.se_used_qty,
                        rem_qty: row.se_remaining_qty,
                        selected_qty: row.se_remaining_qty,
                        uom: row.uom,
                        rate: row.rate,
                        fg_item_code: null,
                        parent_fg_item_code: null,
                        rm_check: 0,
                        ass_check: 1,
                        cons_check: 0,
                    });
                });

                (frm.doc.consumable_cost || []).forEach(row => {
                    dummyData.push({
                        item_code: row.item,
                        item_name: row.item_name,
                        qty: row.quantity,
                        uom: row.uom,
                        used_qty: row.se_used_quantity,
                        rem_qty: row.se_remaining_quantity,
                        selected_qty: row.se_remaining_quantity,
                        rate: row.rate,
                        fg_item_code: null,
                        parent_fg_item_code: null,
                        rm_check: 0,
                        ass_check: 0,
                        cons_check: 1,
                    });
                });

                dialog.fields_dict.item_table.df.data = dummyData;
                dialog.fields_dict.item_table.refresh();

                dialog.show();


            });


            frm.add_custom_button('Material Request', () => {
                const tableFields = [
                    { fieldtype: 'Link', options: 'Item', fieldname: 'item_code', label: 'Item Code', read_only: 1, columns: 2 },
                    { fieldtype: 'Data', fieldname: 'item_name', label: 'Item Name', in_list_view: 1, read_only: 1 },
                    { fieldtype: 'Float', fieldname: 'qty', label: 'Quantity', in_list_view: 1, read_only: 1, columns: 1 },
                    { fieldtype: 'Float', fieldname: 'max_qty', label: 'Allowed Qty', in_list_view: 1, read_only: 1, columns: 1 },
                    { fieldtype: 'Float', fieldname: 'used_qty', label: 'Used Qty', in_list_view: 1, read_only: 1, columns: 1 },
                    { fieldtype: 'Float', fieldname: 'rem_qty', label: 'Remaining Qty', in_list_view: 1, read_only: 1, columns: 1 },
                    { fieldtype: 'Float', fieldname: 'selected_qty', label: 'Select Qty', in_list_view: 1, columns: 1 },
                    { fieldtype: 'Float', fieldname: 'fl_item_gauge', label: 'FL Item Gauge', in_list_view: 1, read_only: 1, columns: 1 },
                    { fieldtype: 'Float', fieldname: 'sum_of_duct_weight', label: 'Sum of Duct Weight', in_list_view: 1, read_only: 1, columns: 1 },
                    { fieldtype: 'Data', fieldname: 'fl_item_specification', label: 'CAM Specification', in_list_view: 1, read_only: 1, columns: 1 },
                    { fieldtype: 'Float', fieldname: 'sum_of_duct_area_with_seam', label: 'Sum of Duct Area with seam', in_list_view: 1, read_only: 1, columns: 1 },
                    { fieldtype: 'Link', fieldname: 'uom', label: 'UOM', options: 'UOM', in_list_view: 1, read_only: 1 },
                    { fieldtype: 'Check', fieldname: 'rm_check', label: 'Raw Material', in_list_view: 1, read_only: 1 },
                    { fieldtype: 'Check', fieldname: 'acc_check', label: 'Accessory Item', in_list_view: 1, read_only: 1 },
                    { fieldtype: 'Check', fieldname: 'cons_check', label: 'Consumable Item', in_list_view: 1, read_only: 1 }
                ];

                // 🔹 Helper: aggregate rows by item_code + type (rm/acc/cons)
                function aggregateData(rows) {
                    let map = {};
                    rows.forEach(row => {
                        let key = `${row.item_code}-${row.rm_check}-${row.acc_check}-${row.cons_check}`;
                        if (!map[key]) {
                            map[key] = { ...row };
                        } else {
                            map[key].qty += row.qty || 0;
                            map[key].max_qty += row.max_qty || 0;
                            map[key].used_qty += row.used_qty || 0;
                            map[key].rem_qty += row.rem_qty || 0;
                            map[key].selected_qty += row.selected_qty || 0;
                            // keep first meta fields (name, gauge, etc.)
                        }
                    });
                    return Object.values(map);
                }

                // 🔹 Collect rows
                let raw_materials = (frm.doc.raw_material_summary || []).map(r => ({
                    item_code: r.material_item_code,
                    item_name: r.material_item_code,
                    qty: r.material_item_qty,
                    max_qty: r.material_item_max_qty,
                    used_qty: r.material_item_used_qty,
                    rem_qty: r.material_item_remaining_qty,
                    selected_qty: r.material_item_remaining_qty,
                    fl_item_gauge: r.fl_item_gauge,
                    sum_of_duct_weight: r.sum_of_duct_weight,
                    sum_of_duct_area_with_seam: r.sum_of_duct_area_with_seam,
                    fl_item_specification: r.fl_item_specification,
                    uom: r.material_item_uom,
                    rm_check: 1, acc_check: 0, cons_check: 0
                }));

                let accessories = (frm.doc.accessory_summary || []).map(r => ({
                    item_code: r.item_code_linked,
                    item_name: r.item_name,
                    qty: r.qty,
                    max_qty: r.max_qty,
                    used_qty: r.used_qty,
                    rem_qty: r.remaining_qty,
                    selected_qty: r.remaining_qty,
                    uom: r.uom,
                    rm_check: 0, acc_check: 1, cons_check: 0
                }));

                let consumables = (frm.doc.consumable_cost || []).map(r => ({
                    item_code: r.item,
                    item_name: r.item_name,
                    qty: r.quantity,
                    max_qty: r.max_quantity,
                    used_qty: r.used_quantity,
                    rem_qty: r.remaining_quantity,
                    selected_qty: r.remaining_quantity,
                    uom: r.uom,
                    rm_check: 0, acc_check: 0, cons_check: 1
                }));

                // 🔹 Merge & aggregate
                let dummyData = aggregateData([...raw_materials, ...accessories, ...consumables]);

                // 🔹 Build dialog
                let dialog = new frappe.ui.Dialog({
                    title: 'Material Request',
                    size: 'extra-large',
                    fields: [
                        {
                            fieldtype: 'Table',
                            fieldname: 'item_table',
                            label: 'Items Summary',
                            cannot_add_rows: 1,
                            cannot_delete_rows: 1,
                            description: 'Summary of Raw Materials + Accessories + Consumables.',
                            fields: tableFields,
                            data: dummyData,
                            get_data: () => dummyData
                        }
                    ],
                    primary_action_label: "Select",
                    primary_action(values) {
                        let selected_items = values.item_table.filter(r => r.__checked === 1);

                        // Validation
                        for (let item of selected_items) {
                            if (item.selected_qty > item.rem_qty) {
                                frappe.msgprint(`❌ Selected quantity (${item.selected_qty}) > remaining quantity (${item.rem_qty}) for ${item.item_code}`);
                                return;
                            }
                            if (item.selected_qty <= 0) {
                                frappe.msgprint(`❌ Quantity for ${item.item_code} must be at least 1.`);
                                return;
                            }
                        }

                        if (!selected_items.length) {
                            frappe.msgprint("Please select at least one item.");
                            return;
                        }

                        // Create MR
                        frappe.new_doc("Material Request", { material_request_type: "Material Transfer" }, doc => {
                            doc.company = frm.doc.company;
                            doc.transaction_date = frappe.datetime.get_today();
                            doc.custom_manufacture_order = frm.doc.name;
                            doc.items = [];

                            selected_items.forEach(item => {
                                let row = frappe.model.add_child(doc, "items");
                                frappe.model.set_value(row.doctype, row.name, 'item_code', item.item_code);
                                frappe.model.set_value(row.doctype, row.name, 'qty', item.selected_qty);

                                frappe.model.set_value(row.doctype, row.name, 'custom_raw_material', item.rm_check);
                                frappe.model.set_value(row.doctype, row.name, 'custom_accessory_item', item.acc_check);
                                frappe.model.set_value(row.doctype, row.name, 'custom_consumable_item', item.cons_check);

                                if (row.item_code) {
                                    frappe.call({
                                        method: "erpnext.stock.get_item_details.get_item_details",
                                        args: {
                                            args: {
                                                item_code: row.item_code,
                                                from_warehouse: row.from_warehouse,
                                                warehouse: row.warehouse,
                                                doctype: 'Material Request',
                                                buying_price_list: frappe.defaults.get_default("buying_price_list"),
                                                currency: frappe.defaults.get_default("Currency"),
                                                name: doc.name,
                                                qty: item.selected_qty,
                                                stock_qty: row.stock_qty,
                                                company: frm.doc.company,
                                                conversion_rate: 1,
                                                material_request_type: 'Material Transfer',
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


                                // Finished Goods link
                                let fg_row = frappe.model.add_child(doc, "custom_finished_goods");
                                frappe.model.set_value(fg_row.doctype, fg_row.name, 'finished_goods_item', item.item_code);
                                frappe.model.set_value(fg_row.doctype, fg_row.name, 'incoming_quantity', item.selected_qty);
                            });
                        });

                        dialog.hide();
                    }
                });

                dialog.show();
            });



        }



    },


    // on_submit : function(frm)
    // {
    //     frm.get_field("job_card").grid.cannot_add_rows = true;
    //     frm.fields_dict["job_card"].$wrapper.find('.btn.btn-xs.btn-secondary.grid-upload').addClass("hidden");
    // }



    order_type: async function (frm) {


        if (frm.doc.order_type == 'Sales Order') {

            frm.set_value("document_id", "");
            frm.set_query("document_id", function () {
                return {
                    filters: [
                        ["Sales Order", "docstatus", "=", 1]
                    ],
                };
            });

        }


    },

    fg_based_operating_cost: async function (frm) {
        frm.set_value('total_over_head_cost_', 0);
        frm.set_value('total_over_head_cost', 0);

    },


    fabrication_list: async function (frm) {

        frm.set_value('item_table', []);
        frm.set_value('raw_material_item', []);
        frm.set_value('raw_material_summary', []);
        frm.set_value('accessory_summary', []);
        frm.set_value('duct_and_acc_item', []);
        frm.set_value('auto_fold_summary', []);

        frm.set_value('total_fl_item_qty', 0);
        frm.set_value('total_coil_item_qty', 0);

        frm.set_value('non_auto_fold_items', []);



        if (frm.doc.fabrication_list) {

            build_non_auto_fold_items(frm);
            var fabrication = await frappe.db.get_doc('Fabrication List', frm.doc.fabrication_list);
            // console.log(fabrication.fabrication_table) ;


            frm.set_value('duct_and_acc_item', fabrication.duct_and_acc_item);

            frm.set_value('auto_fold_summary', fabrication.auto_fold_summary);
            frm.set_value('total_fl_item_qty', fabrication.total_fl_item_qty);
            frm.set_value('total_coil_item_qty', fabrication.total_coil_item_qty);

            let nonAutoFoldMap = {};

            fabrication.fabrication_table.forEach(item => {

                var row = frappe.model.add_child(frm.doc, "Costing Sheet Item", "item_table");

                row.item_code = item.fg_batch_sr;
                row.item_name = item.fl_item_name;
                row.parent_finished_goods_item = item.spl_item_fg_code;
                row.quantity = item.fl_item_qty;
                row.uom = item.fl_item_uom;
                row.item_guage = item.fl_item_gauge;
                row.spl_area_sqm = item.spl_area_sqm;
                row.spl_weight_kg = item.spl_weight_kg;
                row.cam_item_vanes_splitter_qty_1 = item.cam_item_vanes_splitter_qty_1;
                row.cam_item_duct_seam_1 = item.cam_item_duct_seam_1;
                row.duct_range = item.duct_range;
                row.duct_connector_1 = item.duct_connector_1;
                row.duct_connector_2 = item.duct_connector_2;
                row.pl_item_length__angle = item.pl_item_length__angle;
                row.fabrication_cost = item.operation_cost;


            });




            fabrication.material_list1.forEach(item => {

                var row = frappe.model.add_child(frm.doc, "Manufacture Order Material List", "raw_material_item");

                row.fl_item = item.fl_item;
                row.fl_item_gauge = item.fl_item_gauge;
                row.sum_of_fl_item_qty = item.sum_of_fl_item_qty;


                row.spl_item_fg_code = item.spl_item_fg_code;
                row.spl_item_fg_name = item.spl_item_fg_name;


                row.coil_item_code_rm = item.coil_item_code_rm;
                row.coil_item_uom = item.coil_item_uom;
                row.coil_item_brand = item.coil_item_brand;
                row.coil_item_specification = item.coil_item_specification;
                row.item_group = item.coil_item_group;
                row.coil_item_qty = item.coil_item_qty;
                row.coil_item_remaining_qty = item.coil_item_qty;

                row.sum_of_duct_weight = item.sum_of_duct_weight;
                row.sum_of_duct_area_with_seam = item.sum_of_duct_area_with_seam;
                row.fg_batch_sr = item.fg_batch_sr;

            });


            fabrication.material_summary.forEach(item => {
                var row = frappe.model.add_child(frm.doc, "Manufacture Order Material Summary", "raw_material_summary");

                row.parent_finished_good = item.parent_finished_good;
                row.material_item_code = item.material_item_code;
                row.material_item_brand = item.material_item_brand;
                row.material_item_uom = item.material_item_uom;
                row.material_item_qty = item.material_item_qty;
                row.material_item_max_qty = 0;
                row.material_item_used_qty = 0;
                row.material_item_remaining_qty = 0;
                row.sum_of_fl_item_qty = item.sum_of_fl_item_qty;
                row.fl_item_gauge = item.fl_item_gauge;


                row.sum_of_duct_weight = item.sum_of_duct_weight;
                row.sum_of_duct_area_with_seam = item.sum_of_duct_area_with_seam;
                row.fl_item_specification = item.fl_item_specification;

            })


            fabrication.acc_item.forEach(item => {
                var row = frappe.model.add_child(frm.doc, "Accessory Item Summary", "accessory_summary");

                row.item_code = item.item_code;
                row.item_code_linked = item.item_code;
                row.item_name = item.item_name;
                row.uom = item.uom;
                row.qty = item.qty;
            });



            frm.refresh_field('item_table');
            frm.refresh_field('raw_material_item');
            frm.refresh_field('raw_material_summary');
            frm.refresh_field('accessory_summary');
            frm.refresh_field('duct_and_acc_item');
            frm.refresh_field('auto_fold_summary');
            frm.refresh_field('total_fl_item_qty');
            frm.refresh_field('total_coil_item_qty');


        }
    },


    job_operations_complete: async function (frm) {
        if (!frm.doc.job_card || frm.doc.job_card.length === 0) {
            frappe.throw("Job Card table is empty.");
        }

        for (let row of frm.doc.job_card) {
            if (row.end !== 1) {
                frappe.throw(`Row ${row.idx} is not marked as completed.`);
            }
        }

        frm.set_value('job_operations_completed', 1);
        if (frm.doc.docstatus == 1) {
            frm.save('Update');
        }
        else if (frm.doc.docstatus == 0) {
            frm.save();
        }
    },








    before_submit: async function (frm) {

        let mo_settings_doc = await frappe.db.get_doc('Manufacturing Order Settings');

        let account_entries = [];

        let mat_acc = null;
        let ass_acc = null;
        let cons_acc = null;
        let del_acc = null;
        let ad_ov_acc = null;
        let fab_acc = null;

        let credit_acc = null;

        if (mo_settings_doc.table_icuu && mo_settings_doc.table_icuu.length > 0) {
            for (let row of mo_settings_doc.table_icuu) {
                if (row.company === frm.doc.company) {
                    if (row.cost_type === 'Material Cost') {
                        mat_acc = row.expense_gl_account;
                        if (frm.doc.total_raw_material_cost > 0) {
                            account_entries.push({ 'account': row.expense_gl_account, 'credit': frm.doc.total_raw_material_cost, 'debit': 0 });
                        }
                    }
                    if (row.cost_type === 'Accessory Cost') {
                        ass_acc = row.expense_gl_account;
                        if (frm.doc.total_accessory_item_amount_ > 0) {
                            account_entries.push({ 'account': row.expense_gl_account, 'credit': frm.doc.total_accessory_item_amount_, 'debit': 0 });
                        }

                    }
                    if (row.cost_type === 'Consumable Cost') {
                        cons_acc = row.expense_gl_account;
                        if (frm.doc.total_consumable_cost_1 > 0) {
                            account_entries.push({ 'account': row.expense_gl_account, 'credit': frm.doc.total_consumable_cost_1, 'debit': 0 });
                        }
                    }
                    if (row.cost_type === 'Delivery Cost') {
                        del_acc = row.expense_gl_account;
                        if (frm.doc.total_delivery_cost1 > 0) {
                            account_entries.push({ 'account': row.expense_gl_account, 'credit': frm.doc.total_delivery_cost1, 'debit': 0 });
                        }
                    }
                    if (row.cost_type === 'Additional OH Cost') {
                        ad_ov_acc = row.expense_gl_account;
                        if (frm.doc.total_over_head_cost > 0) {
                            account_entries.push({ 'account': row.expense_gl_account, 'credit': frm.doc.total_over_head_cost, 'debit': 0 });
                        }
                    }
                    if (row.cost_type === 'Fabrication Cost') {
                        fab_acc = row.expense_gl_account;
                        if (frm.doc.total_operation_cost_ > 0) {
                            account_entries.push({ 'account': row.expense_gl_account, 'credit': frm.doc.total_operation_cost_, 'debit': 0 });
                        }
                    }
                }
            }
        }

        if (mo_settings_doc.table_juan && mo_settings_doc.table_juan.length > 0) {
            for (let row of mo_settings_doc.table_juan) {
                if (row.company === frm.doc.company) {
                    if (row.cost_type === 'Material Cost') {
                        mat_acc = row.expense_gl_account;
                        if (frm.doc.total_raw_material_cost > 0) {
                            account_entries.push({ 'account': row.expense_gl_account, 'credit': frm.doc.total_raw_material_cost, 'debit': 0 });
                        }
                    }
                    if (row.cost_type === 'Accessory Cost') {
                        ass_acc = row.expense_gl_account;
                        if (frm.doc.total_accessory_item_amount_ > 0) {
                            account_entries.push({ 'account': row.expense_gl_account, 'credit': frm.doc.total_accessory_item_amount_, 'debit': 0 });
                        }

                    }
                    if (row.cost_type === 'Consumable Cost') {
                        cons_acc = row.expense_gl_account;
                        if (frm.doc.total_consumable_cost_1 > 0) {
                            account_entries.push({ 'account': row.expense_gl_account, 'credit': frm.doc.total_consumable_cost_1, 'debit': 0 });
                        }
                    }
                    if (row.cost_type === 'Delivery Cost') {
                        del_acc = row.expense_gl_account;
                        if (frm.doc.total_delivery_cost1 > 0) {
                            account_entries.push({ 'account': row.expense_gl_account, 'credit': frm.doc.total_delivery_cost1, 'debit': 0 });
                        }
                    }
                    if (row.cost_type === 'Additional OH Cost') {
                        ad_ov_acc = row.expense_gl_account;
                        if (frm.doc.total_over_head_cost > 0) {
                            account_entries.push({ 'account': row.expense_gl_account, 'credit': frm.doc.total_over_head_cost, 'debit': 0 });
                        }
                    }
                    if (row.cost_type === 'Fabrication Cost') {
                        fab_acc = row.expense_gl_account;
                        if (frm.doc.total_operation_cost_ > 0) {
                            account_entries.push({ 'account': row.expense_gl_account, 'credit': frm.doc.total_operation_cost_, 'debit': 0 });
                        }
                    }
                }
            }
        }


        if (mo_settings_doc.sasco_company == frm.doc.company) {
            credit_acc = mo_settings_doc.standard_cost_parking_gl_account;
            account_entries.push({ 'account': mo_settings_doc.standard_cost_parking_gl_account, 'credit': 0, 'debit': frm.doc.grand_total });
        }
        else if (mo_settings_doc.mabani_company == frm.doc.company) {
            credit_acc = mo_settings_doc.standard_cost_parking_gl_accounts;
            account_entries.push({ 'account': mo_settings_doc.standard_cost_parking_gl_accounts, 'credit': 0, 'debit': frm.doc.grand_total });
        }





        // console.log(mat_acc);
        // console.log(ass_acc);
        // console.log(cons_acc);
        // console.log(del_acc);
        // console.log(ad_ov_acc);
        // console.log(fab_acc);
        // console.log(credit_acc);


        console.log(account_entries);








        if (mat_acc && ass_acc && cons_acc && del_acc && ad_ov_acc && fab_acc && credit_acc) {
            frappe.call({
                method: 'frappe.client.insert',
                args: {
                    doc: {
                        doctype: 'Journal Entry',
                        voucher_type: 'Journal Entry',
                        custom_manufacture_order: frm.doc.name,
                        company: frm.doc.company,
                        posting_date: frappe.datetime.get_today(),
                        docstatus: 1,

                        accounts: account_entries.map(acc => ({
                            account: acc.account,
                            debit_in_account_currency: acc.debit,
                            credit_in_account_currency: acc.credit,
                            manufacture_order: frm.doc.name,
                        }))
                    }
                },
                callback: function (r) {
                    if (!r.exc) {
                        frappe.msgprint(`Journal Entry ${r.message.name} saved successfully!`);

                        // frm.refresh_field('job_card');
                        // frm.refresh();

                        frm.set_value('jv_created', 1);

                        if (frm.doc.docstatus == 1) {
                            frm.save('Update');
                        }
                        else if (frm.doc.docstatus == 0) {
                            frm.save();
                        }
                    } else {
                        frappe.msgprint(`Error: ${r.exc}`);
                    }
                }
            });

        }
        else {
            frappe.throw("Define all types of cost accounts in Manufacture Order Settings.");
        }















    },










});

async function build_non_auto_fold_items (frm) {

    // Clear table
    frm.set_value('non_auto_fold_items', []);

    if (!frm.doc.fabrication_list) return;

    // Fetch once
    let fabrication = await frappe.db.get_doc(
        'Fabrication List',
        frm.doc.fabrication_list
    );

    let nonAutoFoldMap = {};

    fabrication.fabrication_table.forEach(item => {

        // NON AUTO FOLD CONDITION
        if (
            item.pl_item_length__angle !== 1220 ||
            item.fl_item_specification !== "straight"
        ) {

            let spec = item.fl_item_specification || "Unknown";
            let range = item.duct_range || "Unknown";

            let key = `${spec}||${range}`;

            if (!nonAutoFoldMap[key]) {
                nonAutoFoldMap[key] = {
                    fl_item_specification: spec,
                    duct_range: range,
                    fl_item_gauge: item.fl_item_gauge,
                    pl_item_length__angle: item.pl_item_length__angle,
                    coil_item_uom: item.coil_item_uom,
                    fl_item_qty: 0,
                    coil_item_qty: 0
                };
            }

            nonAutoFoldMap[key].fl_item_qty += flt(item.fl_item_qty);
            nonAutoFoldMap[key].coil_item_qty += flt(item.coil_item_qty);
        }
    });

    // Push grouped rows
    Object.values(nonAutoFoldMap).forEach(group => {

        let row = frappe.model.add_child(
            frm.doc,
            "Non AutoFold Summary",
            "non_auto_fold_items"
        );

        // Spec shown as description
        row.fl_item_name_description = group.fl_item_specification;
        row.fl_item_gauge = group.fl_item_gauge;
        row.fl_item_qty = group.fl_item_qty;
        row.pl_item_length__angle = group.pl_item_length__angle;
        row.duct_range = group.duct_range;
        row.coil_item_uom = group.coil_item_uom;
        row.coil_item_qty = group.coil_item_qty;
    });

    frm.refresh_field('non_auto_fold_items');
}


frappe.ui.form.on('Manufacture Order Job Card', {

    start: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        let cur_date_time = frappe.datetime.now_datetime(); // Corrected method

        frappe.model.set_value(cdt, cdn, 'start_time', cur_date_time);
        frappe.model.set_value(cdt, cdn, 'status', 'Start');

        frm.refresh_field('items');
    },

    end: function (frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        let cur_date_time = frappe.datetime.now_datetime(); // Corrected method

        frappe.model.set_value(cdt, cdn, 'end_time', cur_date_time);
        frappe.model.set_value(cdt, cdn, 'status', 'Close');

        frm.refresh_field('items');

        // let duration = frappe.datetime.get_hour_diff(cur_date_time, row.start_time);
        // frappe.model.set_value(cdt, cdn, 'time_spent', duration);


        let time_diff_in_seconds = moment(cur_date_time).diff(row.start_time, 'seconds', true);
        frappe.model.set_value(cdt, cdn, 'time_spent', time_diff_in_seconds);

        frm.refresh_field('items');
    },


    operation_transfer: async function (frm, cdt, cdn) {
        var sel_row = locals[cdt][cdn];
        var res = await frappe.db.get_value("Operation", sel_row.operation, 'is_corrective_operation');
        var q_st_check = res.message.is_corrective_operation;

        if (sel_row.start == true && sel_row.end != true) {
            console.log(q_st_check);

            if (q_st_check == 1) {

                const table_rpga_data = [...frm.doc.table_rpga] || [];


                const tableFields = [
                    { fieldtype: 'Link', options: 'Item', fieldname: 'item_code', label: 'FG Item Code', in_list_view: 1, read_only: 1, columns: 2, },
                    { fieldtype: 'Data', fieldname: 'item_name', label: 'FG Item Name', in_list_view: 0, read_only: 1, columns: 1, },
                    { fieldtype: 'Link', options: 'UOM', fieldname: 'uom', label: 'UOM', in_list_view: 0, read_only: 1, columns: 1, },

                    { fieldtype: 'Select', fieldname: 'quality_status', label: 'Quality Status', options: 'Pass\nFails', in_list_view: 1, read_only: 0, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'item_gauge', label: 'Item Gauge', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'qty', label: 'Quantity', in_list_view: 1, read_only: 0, columns: 1, },

                    { fieldtype: 'Link', options: 'Brand', fieldname: 'brand', label: 'Brand', in_list_view: 0, read_only: 1, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'spl_area_sqm', label: 'SPL Area SQM', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'spl_weight_kg', label: 'SPL Weight KG', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'cam_item_vanes_splitter_qty_1', label: 'CAM Item Vanes Splitter Qty 1', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'cam_item_duct_seam_1', label: 'CAM Item Duct Seam 1', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'duct_range', label: 'Duct Range', in_list_view: 1, read_only: 1, columns: 1, },


                    { fieldtype: 'Data', fieldname: 'duct_connector_1', label: 'Duct Connector 1', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'duct_connector_2', label: 'Duct Connector 1', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'pl_item_length__angle', label: 'PL Item Length / Angle', in_list_view: 1, read_only: 1, columns: 1, },


                ];


                let dialog = new frappe.ui.Dialog({
                    title: 'Finished Goods Item',
                    fields: [
                        {
                            fieldtype: 'Table',
                            fieldname: 'item_table',
                            label: 'Items',
                            cannot_add_rows: 1,
                            cannot_delete_rows: 1,
                            description: 'This is a table with finished goods data.',
                            fields: tableFields,
                            data: [],
                            get_data: () => {
                                return dummyData;
                            }
                        }
                    ],
                    size: 'extra-large',
                    primary_action_label: "Create Operations Transfer",
                    primary_action(values) {

                        let selected_items = values.item_table.filter(row => row.__checked === 1);

                        for (let item of selected_items) {
                            if (item.qty <= 0) {
                                frappe.msgprint(`Error: Selected quantity for item ${item.item_code} must be at least 1.`);
                                return;
                            }
                        }


                        if (selected_items.length > 0) {

                            frappe.call({
                                method: 'frappe.client.insert',
                                args: {
                                    doc: {
                                        doctype: 'Operations Transfers',
                                        manufacture_order: frm.doc.name,
                                        fabrication_list: frm.doc.fabrication_list,
                                        project: frm.doc.project,
                                        company: frm.doc.company,
                                        operation: sel_row.operation,
                                        operation_name: sel_row.operation_name,
                                        machine_name: sel_row.machine_name,
                                        status: sel_row.status,
                                        start_time: sel_row.start_time,
                                        end_time: sel_row.end_time,
                                        time_spent: sel_row.time_spent,
                                        docstatus: 1,
                                        job_operation_row_name: sel_row.name,
                                        quality_operation: 1,
                                        item: selected_items.map(item => ({
                                            item_code: item.item_code,
                                            item_name: item.item_name,
                                            quantity: item.qty,
                                            uom: item.uom,
                                            quality_status: item.quality_status,
                                            brand: item.brand,
                                            item_gauge: item.item_gauge,
                                            spl_area_sqm: item.spl_area_sqm,
                                            spl_weight_kg: item.spl_weight_kg,
                                            cam_item_vanes_splitter_qty_1: item.cam_item_vanes_splitter_qty_1,
                                            cam_item_duct_seam_1: item.cam_item_duct_seam_1,
                                            duct_range: item.duct_range,
                                            duct_connector_1: item.duct_connector_1,
                                            duct_connector_2: item.duct_connector_2,
                                            pl_item_length__angle: item.pl_item_length__angle,
                                        }))
                                    }
                                },
                                callback: function (r) {
                                    if (!r.exc) {
                                        frappe.msgprint(`Operations Transfer ${r.message.name} saved successfully!`);
                                        frappe.model.set_value(sel_row.doctype, sel_row.name, 'operations_transfers_created', sel_row.operations_transfers_created + 1);
                                        // frm.refresh_field('job_card');
                                        // frm.refresh();



                                        for (let item of selected_items) {

                                            (frm.doc.item_table || []).forEach(x => {

                                                if (x.item_code == item.item_code && item.quality_status == 'Pass') {
                                                    frappe.model.set_value(x.doctype, x.name, 'pass_count', x.pass_count + 1);
                                                    // break ;
                                                }


                                            });
                                        }







                                        if (frm.doc.docstatus == 1) {
                                            frm.save('Update');
                                        }
                                        else if (frm.doc.docstatus == 0) {
                                            frm.save();
                                        }
                                    } else {
                                        frappe.msgprint(`Error: ${r.exc}`);
                                    }
                                }
                            });

                        }
                        else {
                            frappe.msgprint("Please select at least one item.");
                        }

                        dialog.hide();

                    },


                });


                let dummyData = [];


                (frm.doc.item_table || []).forEach(row => {
                    dummyData.push({
                        item_code: row.item_code,
                        item_name: row.item_name,
                        qty: row.quantity,
                        uom: row.uom,
                        quality_status: "Pass",
                        brand: row.brand,
                        item_gauge: row.item_guage,
                        spl_area_sqm: row.spl_area_sqm,
                        spl_weight_kg: row.spl_weight_kg,
                        cam_item_vanes_splitter_qty_1: row.cam_item_vanes_splitter_qty_1,
                        cam_item_duct_seam_1: row.cam_item_duct_seam_1,
                        duct_range: row.duct_range,
                        duct_connector_1: row.duct_connector_1,
                        duct_connector_2: row.duct_connector_2,
                        pl_item_length__angle: row.pl_item_length__angle,
                    });
                });

                dialog.fields_dict.item_table.df.data = dummyData;
                dialog.fields_dict.item_table.refresh();

                dialog.show();
            }

            else {

                const table_rpga_data = [...frm.doc.table_rpga] || [];
                const tableFields = [

                    { fieldtype: 'Link', options: 'Item', fieldname: 'item_code', label: 'FG Item Code', in_list_view: 1, read_only: 1, columns: 2, },


                    { fieldtype: 'Data', fieldname: 'item_name', label: 'FG Item Name', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Link', options: 'UOM', fieldname: 'uom', label: 'UOM', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'qty', label: 'Quantity', in_list_view: 1, read_only: 0, columns: 1, },




                    { fieldtype: 'Float', fieldname: 'item_gauge', label: 'Item Gauge', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Link', options: 'Brand', fieldname: 'brand', label: 'Brand', in_list_view: 0, read_only: 1, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'spl_area_sqm', label: 'SPL Area SQM', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'spl_weight_kg', label: 'SPL Weight KG', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'cam_item_vanes_splitter_qty_1', label: 'CAM Item Vanes Splitter Qty 1', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'cam_item_duct_seam_1', label: 'CAM Item Duct Seam 1', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'duct_range', label: 'Duct Range', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'duct_connector_1', label: 'Duct Connector 1', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Data', fieldname: 'duct_connector_2', label: 'Duct Connector 1', in_list_view: 1, read_only: 1, columns: 1, },
                    { fieldtype: 'Float', fieldname: 'pl_item_length__angle', label: 'PL Item Length / Angle', in_list_view: 1, read_only: 1, columns: 1, },




                ];
                let dialog = new frappe.ui.Dialog({
                    title: 'Finished Goods Item',
                    fields: [
                        {
                            fieldtype: 'Table',
                            fieldname: 'item_table',
                            label: 'Items',
                            cannot_add_rows: 1,
                            cannot_delete_rows: 1,
                            description: 'This is a table with finished goods data.',
                            fields: tableFields,
                            data: [],
                            get_data: () => {
                                return dummyData;
                            }
                        }
                    ],
                    size: 'extra-large',
                    primary_action_label: "Create Operations Transfer",
                    primary_action(values) {

                        let selected_items = values.item_table.filter(row => row.__checked === 1);

                        for (let item of selected_items) {
                            if (item.qty <= 0) {
                                frappe.msgprint(`Error: Selected quantity for item ${item.item_code} must be at least 1.`);
                                return;
                            }
                        }


                        if (selected_items.length > 0) {


                            frappe.call({
                                method: 'frappe.client.insert',
                                args: {
                                    doc: {
                                        doctype: 'Operations Transfers',
                                        manufacture_order: frm.doc.name,
                                        fabrication_list: frm.doc.fabrication_list,
                                        project: frm.doc.project,
                                        company: frm.doc.company,
                                        operation: sel_row.operation,
                                        operation_name: sel_row.operation_name,
                                        machine_name: sel_row.machine_name,
                                        status: sel_row.status,
                                        start_time: sel_row.start_time,
                                        end_time: sel_row.end_time,
                                        time_spent: sel_row.time_spent,
                                        docstatus: 1,
                                        job_operation_row_name: sel_row.name,
                                        item: selected_items.map(item => ({
                                            item_code: item.item_code,
                                            item_name: item.item_name,
                                            quantity: item.qty,
                                            uom: item.uom,
                                            brand: item.brand,
                                            item_gauge: item.item_gauge,
                                            spl_area_sqm: item.spl_area_sqm,
                                            spl_weight_kg: item.spl_weight_kg,
                                            cam_item_vanes_splitter_qty_1: item.cam_item_vanes_splitter_qty_1,
                                            cam_item_duct_seam_1: item.cam_item_duct_seam_1,
                                            duct_range: item.duct_range,
                                            duct_connector_1: item.duct_connector_1,
                                            duct_connector_2: item.duct_connector_2,
                                            pl_item_length__angle: item.pl_item_length__angle,
                                        }))
                                    }
                                },
                                callback: function (r) {
                                    if (!r.exc) {
                                        frappe.msgprint(`Operations Transfer ${r.message.name} saved successfully!`);
                                        frappe.model.set_value(sel_row.doctype, sel_row.name, 'operations_transfers_created', sel_row.operations_transfers_created + 1);

                                        for (let item of selected_items) {

                                            (frm.doc.item_table || []).forEach(x => {

                                                if (x.item_code == item.item_code && item.quality_status == 'Pass') {
                                                    frappe.model.set_value(x.doctype, x.name, 'pass_count', x.pass_count + 1);
                                                }


                                            });
                                        }


                                        if (frm.doc.docstatus == 1) {
                                            frm.save('Update');
                                        }
                                        else if (frm.doc.docstatus == 0) {
                                            frm.save();
                                        }
                                    }
                                    else {
                                        frappe.msgprint(`Error: ${r.exc}`);
                                    }
                                }
                            });




                        }
                        else {
                            frappe.msgprint("Please select at least one item.");
                        }

                        dialog.hide();

                    },


                });
                let dummyData = [];
                (frm.doc.item_table || []).forEach(row => {
                    dummyData.push({
                        item_code: row.item_code,
                        item_name: row.item_name,
                        qty: row.quantity,
                        uom: row.uom,



                        brand: row.brand,
                        item_gauge: row.item_guage,
                        spl_area_sqm: row.spl_area_sqm,
                        spl_weight_kg: row.spl_weight_kg,
                        cam_item_vanes_splitter_qty_1: row.cam_item_vanes_splitter_qty_1,
                        cam_item_duct_seam_1: row.cam_item_duct_seam_1,
                        duct_range: row.duct_range,
                        duct_connector_1: row.duct_connector_1,
                        duct_connector_2: row.duct_connector_2,
                        pl_item_length__angle: row.pl_item_length__angle,
                    });
                });
                dialog.fields_dict.item_table.df.data = dummyData;
                dialog.fields_dict.item_table.refresh();
                dialog.show();


            }

        }

    },



    before_job_card_remove: function (frm, cdt, cdn) {
        row = locals[cdt][cdn];
        if (row.operations_transfers_created >= 1) {
            frappe.throw(`Cannot delete row ${row.idx} because you have created ${row.operations_transfers_created} Operation Transfers for this job.`)
        }
    },


});