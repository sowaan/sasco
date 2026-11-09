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

    // Make sure ERPNext's own "Create > Delivery Note" never shadows this one
    frm.remove_custom_button(__('Delivery Note'), __('Create'));
    frm.add_custom_button(__('Delivery Note'), async () => {
        await selectItemsForDelivery(frm);
    }, __('Create'));
}


// =====================================================
// DELIVERY NOTE POP-UP: Select Items for Delivery Note
// Rows are grouped by Fabrication List (tick a group header to pick the whole list);
// rows without a Fabrication List are highlighted and listed last.
// =====================================================

async function selectItemsForDelivery(frm) {

    if (!frm.doc.items || frm.doc.items.length === 0) {
        frappe.msgprint(__('Sales Order has no items.'));
        return;
    }

    const r = await frappe.call({
        method: 'sasco.api.sales_order.get_pending_items_for_delivery',
        args: { sales_order: frm.doc.name },
        freeze: true,
    });

    const rows = r.message || [];

    if (!rows.length) {
        frappe.msgprint(__('All items of this Sales Order are already delivered.'));
        return;
    }

    showItemSelectionDialog(frm, rows);
}

function groupRowsByFabricationList(rows) {
    const groups = {};

    rows.forEach(row => {
        const key = row.fabrication_list || '';
        groups[key] = groups[key] || { fabrication_list: key, rows: [], pending_qty: 0 };
        groups[key].rows.push(row);
        groups[key].pending_qty += flt(row.pending_qty);
    });

    // Rows without a Fabrication List go last
    return Object.values(groups)
        .sort((a, b) =>
            (!a.fabrication_list) - (!b.fabrication_list)
            || a.fabrication_list.localeCompare(b.fabrication_list)
        )
        .map(g => ({ ...g, rows: g.rows.sort((a, b) => a.idx - b.idx) }));
}

function showItemSelectionDialog(frm, rows) {

    const esc = frappe.utils.escape_html;
    const groups = groupRowsByFabricationList(rows);
    const unlinked_count = rows.filter(row => !row.fabrication_list).length;
    const unlinked_style = 'background: var(--bg-orange); color: var(--text-on-orange);';

    const body = groups.map((g, gi) => {
        const linked = !!g.fabrication_list;

        const header = `
            <tr class="so-group-row" style="background: var(--subtle-fg); font-weight: 600; ${linked ? '' : unlinked_style}">
                <td><input type="checkbox" class="so-group-check" data-group="${gi}"></td>
                <td colspan="6">
                    ${linked
                        ? esc(g.fabrication_list)
                        : `<span class="indicator-pill orange">${__('No Fabrication List')}</span>`}
                    <span class="text-muted small" style="font-weight: normal; margin-left: 8px;">
                        ${__('{0} item(s), pending qty {1}', [g.rows.length, format_number(g.pending_qty, null, 2)])}
                    </span>
                </td>
            </tr>`;

        const lines = g.rows.map(row => `
            <tr data-name="${esc(row.name)}" data-group="${gi}" style="${linked ? '' : unlinked_style}">
                <td><input type="checkbox" class="so-row-check" data-group="${gi}"></td>
                <td>${row.idx}</td>
                <td>${esc(row.item_code)}</td>
                <td>${esc(row.item_name || '')}</td>
                <td>${linked ? esc(row.fabrication_list) : __('Not linked')}</td>
                <td class="text-right">${format_number(row.pending_qty, null, 2)}</td>
                <td>${esc(row.uom || '')}</td>
            </tr>`).join('');

        return header + lines;
    }).join('');

    const dialog = new frappe.ui.Dialog({
        title: __('Select Items for Delivery Note'),
        size: 'extra-large',
        fields: [{ fieldname: 'items_html', fieldtype: 'HTML' }],
        primary_action_label: __('Create Delivery Note'),
        primary_action: async () => {
            const so_details = dialog.$wrapper
                .find('.so-row-check:checked')
                .map((i, el) => $(el).closest('tr').attr('data-name'))
                .get();

            if (!so_details.length) {
                frappe.msgprint(__('Please select at least one item.'));
                return;
            }

            dialog.hide();
            await createDeliveryNote(frm, so_details);
        },
    });

    dialog.fields_dict.items_html.$wrapper.html(`
        <p class="text-muted">
            ${__('Tick a Fabrication List to select all of its items, or tick individual rows.')}
        </p>
        ${unlinked_count ? `
            <p class="text-muted">
                <span class="indicator-pill orange">${__('{0} row(s) without Fabrication List', [unlinked_count])}</span>
                ${__('Highlighted rows are not linked to any Fabrication List.')}
            </p>` : ''}
        <p class="so-row-count text-muted small"></p>
        <div style="max-height: 60vh; overflow: auto;">
            <table class="table table-bordered table-sm" style="margin: 0;">
                <thead>
                    <tr>
                        <th style="width: 32px;"><input type="checkbox" class="so-row-check-all"></th>
                        <th style="width: 48px;">${__('No.')}</th>
                        <th>${__('Item Code')}</th>
                        <th>${__('Item Name')}</th>
                        <th>${__('Fabrication List')}</th>
                        <th class="text-right">${__('Pending Qty')}</th>
                        <th>${__('UOM')}</th>
                    </tr>
                </thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `);

    const $wrapper = dialog.$wrapper;
    const $rows = (group) => $wrapper.find(
        group === undefined ? '.so-row-check' : `.so-row-check[data-group="${group}"]`
    );

    const sync_state = () => {
        // Group header: ticked when all its rows are, half-ticked when some are
        $wrapper.find('.so-group-check').each((i, el) => {
            const $group_rows = $rows($(el).attr('data-group'));
            const ticked = $group_rows.filter(':checked').length;
            el.checked = ticked > 0 && ticked === $group_rows.length;
            el.indeterminate = ticked > 0 && ticked < $group_rows.length;
        });

        const total = $rows().length;
        const ticked = $rows().filter(':checked').length;
        $wrapper.find('.so-row-count').text(__('{0} of {1} row(s) selected', [ticked, total]));

        const all = $wrapper.find('.so-row-check-all')[0];
        all.checked = total > 0 && ticked === total;
        all.indeterminate = ticked > 0 && ticked < total;
    };

    $wrapper.on('change', '.so-row-check', sync_state);
    $wrapper.on('change', '.so-group-check', (e) => {
        $rows($(e.target).attr('data-group')).prop('checked', e.target.checked);
        sync_state();
    });
    $wrapper.on('change', '.so-row-check-all', (e) => {
        $rows().prop('checked', e.target.checked);
        sync_state();
    });

    sync_state();
    dialog.show();
}


// =====================================================
// CREATE DELIVERY NOTE
// =====================================================

async function createDeliveryNote(frm, so_details = null) {

    if (!frm.doc.items || frm.doc.items.length === 0) {
        frappe.msgprint(__('Sales Order has no items.'));
        return;
    }

    try {

        frappe.dom.freeze(__('Creating Delivery Note...'));

        const r = so_details
            ? await frappe.call({
                method: 'sasco.api.sales_order.make_delivery_note',
                args: { source_name: frm.doc.name, so_details },
            })
            : await frappe.call({
                method: 'erpnext.selling.doctype.sales_order.sales_order.make_delivery_note',
                args: { source_name: frm.doc.name },
            });

        let delivery_note = r.message;

        if (!delivery_note) {
            frappe.throw(__('Failed to create Delivery Note'));
        }

        delivery_note.custom_sales_order = frm.doc.name;

        // Remove Dummy Items from Delivery Note
        delivery_note.items = filter_dummy_items(delivery_note.items);

        // Build SO item map keyed by row name: the same item code can appear in
        // several lines (one per Fabrication List), so match on so_detail first
        const so_items_by_row = Object.fromEntries(
            filter_dummy_items(frm.doc.items).map(i => [i.name, i])
        );
        const so_items_map = build_item_map(frm.doc.items);

        // Map custom fields safely
        delivery_note.items = delivery_note.items.map(dn_item => {

            let so_item = so_items_by_row[dn_item.so_detail] || so_items_map[dn_item.item_code];

            if (so_item) {
                dn_item.custom_parent_item_1 = so_item.custom_parent_item_1;
                dn_item.custom_spl_area_sqm = so_item.custom_spl_area_sqm;
                dn_item.custom_spl_weight_kg = so_item.custom_spl_weight_kg;
                dn_item.custom_cam_quantity = so_item.custom_cam_quantity;
                dn_item.custom_fabrication_list = so_item.custom_fabrication_list;
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