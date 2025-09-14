//The scripts are not working as expected. Please fix the issues and make sure the code is functional.
//The code is not called even when we add in hooks.py doctype_js = {"Sales Inquiry": "public/js/sales_inquiry.js"}
//For now I've included the code in client script on website. Please fix the issues in this file and remove from client script.


frappe.ui.form.on('Sales Inquiry', {
    refresh(frm) {
        // Add custom buttons based on workflow state
        if (frm.doc.workflow_state == "Started") {
            frm.add_custom_button(
                __("Pricing Sheet"),
                function() {
                    createCostingSheet(frm.doc);
                },
                __("Create")
            );
            
            frm.add_custom_button(
                __("Estimation Request"),
                function() {
                    createEstimationRequest(frm);
                },
                __("Create")
            );
            
            
            frm.add_custom_button(
                __("Fabrication"),
                function() {
                    createFabrication(frm.doc);
                },
                __("Create")
            );
            
            
            
        }
        
        if (frm.doc.workflow_state == "Approved for Quotation" || frm.doc.workflow_state == "QTN Pending") {
            frm.add_custom_button(
                __("Sales Quotation"),
                function() {
                    createQuotation(frm.doc);
                },
                __("Create")
            );
            
            frm.add_custom_button(
                __("Estimation Request"),
                function() {
                    createEstimationRequest(frm);
                },
                __("Create")
                );
        }
        toggle_child_tables(frm);
    },
    
    items_remove(frm, cdt, cdn) {
        updateTotalValues(frm);
    },

    product_type_table_add(frm, cdt, cdn) {
        toggle_child_tables(frm);
    },

    product_type_table_remove(frm, cdt, cdn) {
        toggle_child_tables(frm);
    }
});

function toggle_child_tables(frm) {
    // collect all product_types from grid
    let product_types = (frm.doc.product_type_table || []).map(row => row.product_types);

    // mapping of product type to child table fieldname
    const mapping = {
        "Adhesives & Sealant": "adhesives_and_sealant_specification_table",
        "Dampers": "damper_specification_table",
        "Duct": "duct_specifications_table",
        "Duct Accessories": "duct_accessories_table",
        "Fastners": "fastners_specification_table",
        "Gasket & Masking Tape": "gasket_and_masking_tape_specification_table",
        "Grill": "grilles_table",
        "Diffuser": "diffuser_specification",
        "Louver": "louver_specification_table",
        "Raw Material": "raw_materal_specification_table",
        "Sound Attenuator": "sound_attenuator__specification_table",
        "Plenum": "plenum_specification_table"
    };

    // loop through mapping and show/hide child tables
    for (let [ptype, fieldname] of Object.entries(mapping)) {
        if (product_types.includes(ptype)) {
            frm.toggle_display(fieldname, true);
        } else {
            frm.toggle_display(fieldname, false);
        }
    }
}


frappe.ui.form.on('Opportunity Item', {
    rate: function(frm, cdt, cdn) {
        updateItemTotals(frm, cdt, cdn);
    },
    qty: function(frm, cdt, cdn) {
        updateItemTotals(frm, cdt, cdn);
    }
});

function updateItemTotals(frm, cdt, cdn) {
    var total = 0;
    var item = locals[cdt][cdn];
    total = item.qty * item.rate;
    frappe.model.set_value(item.doctype, item.name, 'amount', total);
    frappe.model.set_value(item.doctype, item.name, 'base_rate', item.rate);
    frappe.model.set_value(item.doctype, item.name, 'base_amount', total);
    updateTotalValues(frm);
}

function updateTotalValues(frm) {
    var total_qty = 0;
    var total_amount = 0;
    var items = frm.doc.items || [];

    // Calculate total quantity and total amount for all items
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        total_qty += flt(item.qty);
        total_amount += flt(item.amount);
    }

    // Set total quantity and total amount in the Opportunity form
    frappe.model.set_value(frm.doctype, frm.docname, 'total_quantity', total_qty);
    frappe.model.set_value(frm.doctype, frm.docname, 'total_amount', total_amount);
}

function createCostingSheet(salesInquiryDoc) {
    frappe.model.with_doctype('Pricing Sheet', function() {
        var costingSheet = frappe.model.get_new_doc('Pricing Sheet');
        costingSheet.sales_inquiry = salesInquiryDoc.name;
        costingSheet.project = salesInquiryDoc.project;
        frappe.set_route('Form', 'Pricing Sheet', costingSheet.name);
    });
}

function createFabrication(salesInquiryDoc) {
    frappe.model.with_doctype('Fabrication List', function() {
        var fabrication = frappe.model.get_new_doc('Fabrication List');
        fabrication.oppurtunity = salesInquiryDoc.opportunity;
        fabrication.lead = salesInquiryDoc.lead;
        fabrication.opportunity_owner = salesInquiryDoc.opportunity_owner;
        fabrication.project_ref = salesInquiryDoc.project;
        fabrication.priority = salesInquiryDoc.name;
        frappe.set_route('Form', 'Fabrication List', fabrication.name);
    });
}

function createEstimationRequest(frm) 
{
            frappe.call({
                method: 'frappe.client.insert',
                args: {
                    doc: {
                        doctype: 'Estimation Request',
                        // creation_date: frm.doc.creation_date,
                        sales_inquiry: frm.doc.name,
                        inquiry_type: frm.doc.inquiry_type ,
                        client_reference: frm.doc.client_reference ,
                        drawing_link: frm.doc.drawing_link,
                        special_instruction: frm.doc.special_instruction,
                        customer_name: frm.doc.customer_name,
                        customer_location: frm.doc.customer_location,
                        customer_name: frm.doc.customer_name,
                        quotation_address_to: frm.doc.quotation_address_to,
                        email_id: frm.doc.email_id,
                        mobile_no: frm.doc.mobile_no,
                        technical_contact: frm.doc.technical_contact,
                        contact_number: frm.doc.contact_number,
                        submittal_link: frm.doc.submittal_link,
                        company: frm.doc.company,
                        opportunity: frm.doc.opportunity,
                        sales_inquiry_status: frm.doc.sales_inquiry_status,
                        products: frm.doc.products,
                        
                        
                        
                        
                        attachment_1: frm.doc.attachment_1,
                        attachment_2: frm.doc.attachment_2,
                        attachment_3: frm.doc.attachment_3,
                        items: frm.doc.items,
                        total_quantity: frm.doc.total_quantity,
                        total_amount: frm.doc.total_amount,
                        
                        
                    }
                },
                callback: function(r) {
                    if (!r.exc) {
                        frappe.msgprint(`Estimation Request ${r.message.name} saved successfully!`);
                        frappe.model.set_value("Estimation Request" , frm.doc.name, 'estimation_request_created', 1) ;
                        
                        
                        if (frm.doc.docstatus == 1)
                        {
                            frm.save('Update') ;
                        }
                        else if (frm.doc.docstatus == 0)
                        {
                            frm.save() ;
                        }
                    } else {
                        frappe.msgprint(`Error: ${r.exc}`);
                    }
                }
            });
}



function createQuotation(salesInquiry) {
    frappe.model.with_doctype('Quotation', function() {
        var quotation = frappe.model.get_new_doc('Quotation');

        // Set fields in the Quotation document
        quotation.custom_refrence = salesInquiry.name;
        quotation.party_name = salesInquiry.customer;
        quotation.opportunity = salesInquiry.opportunity;

        // Copy items from Sales Inquiry to Quotation
        salesInquiry.items.forEach(function(item) {
            var row = frappe.model.add_child(quotation, "Quotation Item", "items");
            row.item_code = item.item_code;
            row.qty = item.qty;
            row.uom = item.uom;
            row.item_name = item.item_name;
            row.brand = item.brand;
            row.item_group = item.item_group;
            row.rate = item.rate;
            row.amount = item.amount;
            row.description = item.description;
        });

        // Calculate total amount
        quotation.total_amount = quotation.items.reduce(function(acc, item) {
            return acc + item.amount;
        }, 0);

        // Open the Quotation in a new tab without saving
        frappe.set_route('Form', 'Quotation', quotation.name);
    });
}