import frappe


def execute():
    _fix_job_card_update()
    _fix_get_sales_order_item()
    frappe.db.commit()


def _fix_job_card_update():
    """
    'Job Card Update' (Before Save Submitted Document) resets operation_cost to
    qty_in_pcs * per_hour_rate unconditionally. When qty_in_pcs is 0 (because
    allow_on_submit=0 prevented it from being saved), this wipes a valid
    operation_cost that the client calculated via the End checkbox event.

    Fix: only recalculate operation_cost when qty_in_pcs is actually set.
    """
    new_script = """\
############################################# JOB CARD #############################################
total_time_spent = 0
total_opr_cost = 0

if doc.job_card :

    for row in doc.job_card :

        if row.start == 1 and row.end == 1 :
            # Only recalculate when qty_in_pcs is available.
            # If qty_in_pcs is 0 (allow_on_submit=0 prevented saving it),
            # preserve the operation_cost already set by the client End event.
            if (row.qty_in_pcs or 0) :
                row.operation_cost = (row.qty_in_pcs or 0) * (row.per_hour_rate or 0)
            total_time_spent = total_time_spent + (row.time_spent or 0)
            total_opr_cost = total_opr_cost + (row.operation_cost or 0)


doc.total_time_spent = total_time_spent
doc.total_operation_cost = total_opr_cost
doc.total_operation_cost_ = total_opr_cost
############################################# JOB CARD #############################################




########################################## CONSUMABLE COST ##########################################
total_consumable_qty = 0
total_consumable_cost = 0

if doc.consumable_cost :

    for row in doc.consumable_cost :

        row.amount = (row.quantity or 0) * (row.rate or 0)
        total_consumable_qty = total_consumable_qty + (row.quantity or 0)
        total_consumable_cost = total_consumable_cost + (row.amount or 0)

doc.total_consumable_quantity = total_consumable_qty
doc.total_consumable_cost = total_consumable_cost
doc.total_consumable_cost_1 = total_consumable_cost
########################################## CONSUMABLE COST ##########################################




########################################## DELIVERY COST ##########################################
total_delivery_qty = 0
total_delivery_cost = 0

if doc.delivery_cost :

    for row in doc.delivery_cost :

        row.amount = (row.quantity or 0) * (row.rate or 0)
        total_delivery_qty = total_delivery_qty + (row.quantity or 0)
        total_delivery_cost = total_delivery_cost + (row.amount or 0)

doc.total_delivery_quantity = total_delivery_qty
doc.total_delivery_cost = total_delivery_cost
doc.total_delivery_cost1 = total_delivery_cost
########################################## DELIVERY COST ##########################################




doc.grand_total = (doc.total_raw_material_cost or 0) + (doc.total_accessory_item_amount_ or 0) + (doc.total_operation_cost_ or 0) + (doc.total_consumable_cost or 0) + (doc.total_delivery_cost or 0)


doc.total_over_head_cost_ = (doc.grand_total or 0) * ((doc.additional_over_head_cost_percentage or 0)/100)

doc.total_over_head_cost = doc.total_over_head_cost_

doc.grand_total = doc.grand_total + doc.total_over_head_cost




############################################# DUCT ITEM PROPORTIONAL COST #############################################
doc.duct_item = []

if doc.duct_and_acc_item :
    t_duct_itm_qty = 0
    for row in doc.duct_and_acc_item :
        t_duct_itm_qty = t_duct_itm_qty + row.qty

    for row in doc.duct_and_acc_item :
        cost = 0
        if t_duct_itm_qty > 0 :
            cost = doc.grand_total * (row.qty / t_duct_itm_qty)

        doc.append('duct_item',{
            'item_code' : row.item_code ,
            'item_name' : row.item_name ,
            'uom' : row.uom ,
            'qty' : row.qty ,
            'cost' : cost ,
        })

############################################# DUCT ITEM PROPORTIONAL COST #############################################
"""

    frappe.db.set_value(
        "Server Script",
        "Job Card Update",
        "script",
        new_script,
        update_modified=False
    )


def _fix_get_sales_order_item():
    """
    Full replacement of the 'Get Sales Order Item' (Before Save) server script.

    The original script unconditionally resets all tracking fields (used_qty,
    remaining_qty, etc.) on every save, destroying actual Material Consumption
    data on production. It also resets operation_cost to 0 when qty_in_pcs is
    not available on submitted documents.

    This patch writes the entire corrected script so the fix is guaranteed
    regardless of what version is currently on the server.
    """
    new_script = """\
############################################# RAW MATERIAL SUMMARY #############################################
tol = 0
tol_doc = frappe.get_doc('Manufacturing Order Settings')
if tol_doc.tolerance :
    for x in tol_doc.tolerance :
        if x.company == doc.company :
            tol = (x.tolerance or 0)


if doc.raw_material_item :
    for row in doc.raw_material_item :
        coil_qty = (row.coil_item_qty or 0)
        row.coil_item_max_qty = coil_qty + (coil_qty * tol/100)
        # Preserve tracking data once consumption has started
        if not (row.coil_item_used_qty or 0) :
            row.coil_item_remaining_qty = row.coil_item_max_qty
            row.coil_item_used_qty = 0

if doc.raw_material_summary :
    for row in doc.raw_material_summary :
        mat_qty = (row.material_item_qty or 0)
        row.material_item_max_qty = mat_qty + (mat_qty * tol/100)
        # Preserve tracking data once consumption has started
        if not (row.material_item_used_qty or 0) :
            row.material_item_remaining_qty = row.material_item_max_qty
            row.material_item_used_qty = 0
############################################# RAW MATERIAL SUMMARY #############################################




############################################# ACCESSORY SUMMARY #############################################
if doc.accessory_summary :
    for row in doc.accessory_summary :
        qty = row.qty or 0
        rate = row.rate or 0

        row.amount = qty * rate
        row.max_qty = qty + ( qty * tol/100 )
        # Preserve tracking data once consumption has started
        if not (row.used_qty or 0) :
            row.remaining_qty = row.max_qty
            row.used_qty = 0
        row.se_max_qty = qty + ( qty * tol/100 )
        if not (row.se_used_qty or 0) :
            row.se_remaining_qty = row.se_max_qty
            row.se_used_qty = 0
############################################# ACCESSORY SUMMARY #############################################




############################################# ACCESSORY SUMMARY WITH FG BATCH SR #############################################
total_ac_itm_qty = 0
total_ac_itm_amount = 0

doc.accessory_summary_with_fg_batch_sr = []
if doc.fabrication_list :
    fab_doc = frappe.get_doc( 'Fabrication List' , doc.fabrication_list )

    unique_items = {}
    if fab_doc.accessory:
        for row in fab_doc.accessory:
            unique_key = ( row.child_finished_good_item , row.child_finished_good_uom , row.fg_batch_sr )

            if unique_key not in unique_items:
                unique_items[unique_key] = {
                    "item_code" : row.child_finished_good_item,
                    "item_name" : row.child_finished_good_item_name,
                    "fg_batch_sr" : row.fg_batch_sr ,
                    "uom" : row.child_finished_good_uom,
                    "qty" : (row.child_finished_good_qty or 0)
                }
            else:
                unique_items[unique_key]["qty"] = unique_items[unique_key]["qty"] + (row.child_finished_good_qty or 0)

        for key, value in unique_items.items():

            acc_bin_rate = 0
            bin_list = frappe.get_list("Bin",
                            filters={
                                'item_code' : value["item_code"] ,
                            },
                            fields=['valuation_rate']
                        )
            if bin_list :
                acc_bin_rate = bin_list[0].valuation_rate or 0

            if acc_bin_rate == 0 :
                itm_list = frappe.get_list("Item",
                            filters={
                                'item_code' : value["item_code"] ,
                            },
                            fields=['valuation_rate']
                        )
                if itm_list :
                    acc_bin_rate = itm_list[0].valuation_rate or 0


            doc.append("accessory_summary_with_fg_batch_sr", {
                "item_code_linked": value["item_code"],
                "item_name" : value["item_name"],
                "fg_batch_sr" : value["fg_batch_sr"] ,
                "uom": value["uom"],
                "qty": value["qty"],
                "rate": acc_bin_rate,
                "amount": acc_bin_rate * value["qty"],
            })
            total_ac_itm_qty = total_ac_itm_qty + value["qty"]
            total_ac_itm_amount = total_ac_itm_amount + (acc_bin_rate * value["qty"])


doc.total_accessory_item_quantity = total_ac_itm_qty
doc.total_accessory_item_amount = total_ac_itm_amount
doc.total_accessory_item_amount_ = total_ac_itm_amount
############################################# ACCESSORY SUMMARY WITH FG BATCH SR #############################################




############################################# RAW MATERIAL SUMMARY #############################################
total_rm_cost = 0
total_rm_qty = 0
t_amount = 0
if doc.raw_material_item :
    for row in doc.raw_material_item :

        acc_bin_rate = 0
        bin_list = frappe.get_list("Bin",
                        filters={
                            'item_code' : row.coil_item_code_rm ,
                        },
                        fields=['valuation_rate']
                    )
        if bin_list :
            acc_bin_rate = bin_list[0].valuation_rate or 0

        if acc_bin_rate == 0 :
            itm_list = frappe.get_list("Item",
                        filters={
                            'item_code' : row.coil_item_code_rm ,
                        },
                        fields=['valuation_rate']
                    )
            if itm_list :
                acc_bin_rate = itm_list[0].valuation_rate or 0


        row.costing_rate = acc_bin_rate
        if not row.costing_rate :
            row.costing_rate = 0

        if not row.coil_item_qty :
            row.coil_item_qty = 0

        t_amount = row.costing_rate * row.coil_item_qty
        total_rm_qty = total_rm_qty + row.coil_item_qty
        total_rm_cost = total_rm_cost + t_amount

doc.total_raw_material_quantity = total_rm_qty
doc.total_raw_material_cost_ = total_rm_cost
doc.total_raw_material_cost = total_rm_cost
############################################# RAW MATERIAL SUMMARY #############################################




########################################## CONSUMABLE COST ##########################################
total_consumable_qty = 0
total_consumable_cost = 0

if doc.consumable_cost :

    for row in doc.consumable_cost :

        row.amount = (row.quantity or 0) * (row.rate or 0)
        row.max_quantity = (row.quantity or 0) + ( (row.quantity or 0) * tol/100 )
        # Preserve tracking data once consumption has started
        if not (row.used_quantity or 0) :
            row.remaining_quantity = row.max_quantity
            row.used_quantity = 0


        row.se_max_quantity = (row.quantity or 0) + ( (row.quantity or 0) * tol/100 )
        if not (row.se_used_quantity or 0) :
            row.se_remaining_quantity = row.se_max_quantity
            row.se_used_quantity = 0


        total_consumable_qty = total_consumable_qty + (row.quantity or 0)
        total_consumable_cost = total_consumable_cost + (row.amount or 0)

doc.total_consumable_quantity = total_consumable_qty
doc.total_consumable_cost = total_consumable_cost
doc.total_consumable_cost_1 = total_consumable_cost
########################################## CONSUMABLE COST ##########################################




########################################## DELIVERY COST ##########################################
total_delivery_qty = 0
total_delivery_cost = 0

if doc.delivery_cost :

    for row in doc.delivery_cost :

        row.amount = (row.quantity or 0) * (row.rate or 0)
        total_delivery_qty = total_delivery_qty + (row.quantity or 0)
        total_delivery_cost = total_delivery_cost + (row.amount or 0)

doc.total_delivery_quantity = total_delivery_qty
doc.total_delivery_cost = total_delivery_cost
doc.total_delivery_cost1 = total_delivery_cost
########################################## DELIVERY COST ##########################################




############################################# ITEM TABLE SUMMARY #############################################
total_spl_area_sqm = 0
total_fg_qty = 0

if doc.item_table :
    for row in doc.item_table :

        if not row.rate :
            row.rate = 0
        if not row.quantity :
            row.quantity = 0
        row.amount = row.quantity * row.rate

        total_spl_area_sqm = total_spl_area_sqm + ( row.spl_area_sqm or 0 )
        total_fg_qty = total_fg_qty + row.quantity

        material_cost = 0
        acc_cost = 0

        if doc.raw_material_item :
            for y in doc.raw_material_item :
                if row.item_code == y.fg_batch_sr :
                    material_cost = material_cost + (y.costing_rate * y.coil_item_qty)
        row.material_cost = material_cost


        if doc.accessory_summary_with_fg_batch_sr :
            for a in doc.accessory_summary_with_fg_batch_sr :
                if row.item_code == a.fg_batch_sr :
                    acc_cost = acc_cost + ( a.amount or 0 )
        row.accessory_cost = acc_cost



doc.total_spl_area_sqm = total_spl_area_sqm
doc.total_fg_item_quantity = total_fg_qty


total_fab_cost = 0
total_grand_cost = 0
doc.distributed_fg_cost = []
if doc.item_table :
    for row in doc.item_table :

        spl_area_sqm = ( row.spl_area_sqm or 0 )

        if doc.total_spl_area_sqm > 0 :
            spl_percent = (spl_area_sqm*100)/doc.total_spl_area_sqm
        else :
            spl_percent = 0

        row.consumable_cost = ( ((doc.total_consumable_cost or 0)/100) * spl_percent)
        row.delivery_cost = ( ((doc.total_delivery_cost or 0)/100) * spl_percent)
        row.over_head_cost = ( ((doc.total_over_head_cost or 0)/100) * spl_percent)


        row.grand_cost = row.material_cost + row.accessory_cost + row.consumable_cost + row.delivery_cost + row.over_head_cost + (row.fabrication_cost or 0)
        total_grand_cost = total_grand_cost + row.grand_cost
        if spl_area_sqm > 0 :
            row.per_unit_cost = row.grand_cost / spl_area_sqm
        else :
            row.per_unit_cost = 0


        total_fab_cost = total_fab_cost + (row.fabrication_cost or 0)
        doc.append('distributed_fg_cost', {

            'parent_finished_goods_item' : row.parent_finished_goods_item ,
            'item_code' : row.item_code ,
            'uom' : row.uom ,
            'spl_area_sqm' : row.spl_area_sqm ,
            'duct_range' : row.duct_range ,

            'material_cost' : row.material_cost ,
            'accessory_cost' : row.accessory_cost ,
            'consumable_cost' : row.consumable_cost ,
            'delivery_cost' : row.delivery_cost ,
            'over_head_cost' : row.over_head_cost ,
            'fabrication_cost' : row.fabrication_cost ,

            'per_unit_cost' : row.per_unit_cost ,
            'grand_cost' : row.grand_cost ,
        })


doc.total_fabrication_cost = total_fab_cost
doc.total_fg_item_amount = total_grand_cost
doc.total_fg_item_amount_ = total_grand_cost

if doc.total_spl_area_sqm:
    doc.per_unit_spl_area_sqm_cost = doc.total_fg_item_amount / doc.total_spl_area_sqm
else:
    doc.per_unit_spl_area_sqm_cost = 0


if not doc.total_over_head_cost_ :
    doc.total_over_head_cost_ = 0



if total_fg_qty == 0 :
    doc.per_unit_over_head_cost = 0
else :
    doc.per_unit_over_head_cost = doc.total_over_head_cost_ / total_fg_qty
############################################# ITEM TABLE SUMMARY #############################################




############################################# JOB CARD #############################################
total_time_spent = 0
total_opr_cost = 0
if doc.job_card :

    for row in doc.job_card :

        if row.start == 1 and row.end == 1 :
            # Only recalculate when qty_in_pcs is available.
            # Preserves operation_cost set by the client End event when qty_in_pcs is 0.
            if (row.qty_in_pcs or 0) :
                row.operation_cost = (row.qty_in_pcs or 0) * (row.per_hour_rate or 0)

            total_time_spent = total_time_spent + (row.time_spent or 0)
            total_opr_cost = total_opr_cost + (row.operation_cost or 0)



doc.total_time_spent = total_time_spent
doc.total_operation_cost = total_opr_cost
doc.total_operation_cost_ = total_opr_cost
############################################# JOB CARD #############################################




doc.grand_total = (
    (doc.total_raw_material_cost or 0)
    + (doc.total_accessory_item_amount_ or 0)
    + (doc.total_operation_cost_ or 0)
    + (doc.total_consumable_cost or 0)
    + (doc.total_delivery_cost or 0)
)



doc.total_over_head_cost_ = doc.grand_total * ((doc.additional_over_head_cost_percentage or 0) / 100)

doc.total_over_head_cost = doc.total_over_head_cost_

doc.grand_total = doc.grand_total + doc.total_over_head_cost




############################################# DUCT ITEM PROPORTIONAL COST #############################################
doc.duct_item = []

if doc.duct_and_acc_item :
    t_duct_itm_qty = 0

    for row in doc.duct_and_acc_item :
        t_duct_itm_qty = t_duct_itm_qty + (row.spl_area_sqm or 0)

        sub_grand_cost = 0
        if doc.item_table :
            for a in doc.item_table :
                if row.item_code == a.parent_finished_goods_item and row.duct_range == a.duct_range :
                    sub_grand_cost = sub_grand_cost + a.grand_cost

        row.grand_cost = sub_grand_cost

    for row in doc.duct_and_acc_item :

        cost = 0
        if t_duct_itm_qty > 0 :
            cost = doc.grand_total * ((row.spl_area_sqm or 0) / t_duct_itm_qty)

        doc.append('duct_item',{
            'item_code' : row.item_code ,
            'item_name' : row.item_name ,
            'uom' : row.uom ,
            'qty' : row.qty ,
            'spl_area_sqm' : row.spl_area_sqm ,
            'cost' : cost ,
        })
############################################# DUCT ITEM PROPORTIONAL COST #############################################
"""

    frappe.db.set_value(
        "Server Script",
        "Get Sales Order Item",
        "script",
        new_script,
        update_modified=False
    )
