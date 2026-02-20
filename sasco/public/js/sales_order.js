// =====================================================
// CONSTANTS
// =====================================================

const DUMMY_ITEM_CODE = "Dummy Item";


// =====================================================
// HELPER FUNCTIONS
// =====================================================

// Remove Dummy Items
function filter_dummy_items(items) {
    return (items || []).filter(item =>
        item.item_code &&
        item.item_code !== DUMMY_ITEM_CODE
    );
}

// Build fast lookup map (performance optimized)
function build_item_map(items) {
    return Object.fromEntries(
        filter_dummy_items(items).map(i => [i.item_code, i])
    );
}


// =====================================================
// SALES ORDER FORM EVENTS
// =====================================================

frappe.ui.form.on('Sales Order', {

    setup(frm) {
        frm.set_query("warehouse", () => {
            return {
                filters: { company: frm.doc.company }
            };
        });
    },

    refresh(frm) {

        if (frm.doc.docstatus !== 1) return;

        add_estimation_button(frm);
        add_delivery_note_button(frm);
    }
});


// =====================================================
// ADD BUTTONS
// =====================================================

function add_estimation_button(frm) {

    frm.add_custom_button(__('Estimation Request'), async () => {

        if (!frm.doc.custom_ref_quotation) {
            frappe.msgprint(__('Quotation reference is missing.'));
            return;
        }

        // if (frm.doc.estimation_request_created) {
        //     frappe.msgprint(__('Estimation Request already created.'));
        //     return;
        // }

        try {

            frappe.dom.freeze(__('Creating Estimation Request...'));

            const quotation = await frappe.db.get_doc(
                'Quotation',
                frm.doc.custom_ref_quotation
            );

            if (!quotation.custom_refrence) {
                frappe.throw(__('Sales Inquiry reference missing in Quotation'));
            }

            const sales_inquiry = await frappe.db.get_doc(
                'Sales Inquiry',
                quotation.custom_refrence
            );

            await createEstimationRequest(sales_inquiry, frm);

        } catch (error) {
            console.error(error);
            frappe.msgprint(__('Error while creating Estimation Request'));
        } finally {
            frappe.dom.unfreeze();
        }

    }, __('Create'));
}



function add_delivery_note_button(frm) {

    frm.add_custom_button(__('Delivery Note'), async () => {
        await createDeliveryNote(frm);
    }, __('Create'));
}


// =====================================================
// CREATE DELIVERY NOTE
// =====================================================

async function createDeliveryNote(frm) {

    if (!frm.doc.items || frm.doc.items.length === 0) {
        frappe.msgprint(__('Sales Order has no items.'));
        return;
    }

    try {

        frappe.dom.freeze(__('Creating Delivery Note...'));

        const r = await frappe.call({
            method: 'erpnext.selling.doctype.sales_order.sales_order.make_delivery_note',
            args: { source_name: frm.doc.name }
        });

        let delivery_note = r.message;

        if (!delivery_note) {
            frappe.throw(__('Failed to create Delivery Note'));
        }

        delivery_note.custom_sales_order = frm.doc.name;

        // Remove Dummy Items from Delivery Note
        delivery_note.items = filter_dummy_items(delivery_note.items);

        // Build SO item map (without dummy items)
        const so_items_map = build_item_map(frm.doc.items);

        // Map custom fields safely
        delivery_note.items = delivery_note.items.map(dn_item => {

            let so_item = so_items_map[dn_item.item_code];

            if (so_item) {
                dn_item.custom_parent_item_1 = so_item.custom_parent_item_1;
            }

            return dn_item;
        });

        frappe.model.sync(delivery_note);
        frappe.set_route('Form', 'Delivery Note', delivery_note.name);

    } catch (error) {
        console.error(error);
        frappe.msgprint(__('Error creating Delivery Note'));
    } finally {
        frappe.dom.unfreeze();
    }
}



// =====================================================
// CREATE ESTIMATION REQUEST
// =====================================================

async function createEstimationRequest(sal_inq_doc, frm) {

    try {

        frappe.dom.freeze(__('Creating Estimation Request...'));

        const doc = {
            doctype: 'Estimation Request',

            estimation_request_type: 'Direct',
            sales_order_number: frm.doc.name,

            sales_inquiry: sal_inq_doc.name,
            inquiry_type: sal_inq_doc.inquiry_type,
            client_reference: sal_inq_doc.client_reference,
            drawing_link: sal_inq_doc.drawing_link,
            special_instruction: sal_inq_doc.special_instruction,
            customer_name: sal_inq_doc.customer_name,
            customer_location: sal_inq_doc.customer_location,
            company: sal_inq_doc.company,
            opportunity: sal_inq_doc.opportunity,

            attachment_1: sal_inq_doc.attachment_1,
            attachment_2: sal_inq_doc.attachment_2,
            attachment_3: sal_inq_doc.attachment_3,

            // Skip Dummy Item
            items: filter_dummy_items(sal_inq_doc.items).map(i => ({
                item_code: i.item_code,
                item_name: i.item_name,
                qty: i.qty,
                uom: i.uom,
                rate: i.rate
            }))
        };

        const r = await frappe.call({
            method: 'frappe.client.insert',
            args: { doc }
        });

        // ✅ Immediately open created document
        frappe.open_in_new_tab = true;
        frappe.set_route(
            'Form',
            'Estimation Request',
            r.message.name
        );

    } catch (error) {
        console.error(error);
        frappe.msgprint(__('Error creating Estimation Request'));
    } finally {
        frappe.dom.unfreeze();
    }
}