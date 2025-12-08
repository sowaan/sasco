# Copyright (c) 2025, Sowaan and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class QSReview(Document):
	pass

@frappe.whitelist()
def get_qs_items(sales_order):
    # Resolve Fabrication List once
    fab_list = _get_fabrication_list_from_sales_order(sales_order)

    # Resolve Manufacture Order (linked to Fabrication List) once
    mo_name = None
    if fab_list:
        mo_name = frappe.db.get_value(
            "Manufacture Order",
            {"fabrication_list": fab_list, "docstatus": 1},
            "name"
        )

    # Base query for QS items
    items = frappe.db.sql("""
        SELECT 
            fpi.parent_item AS item_code,
            i.item_name,
            fpi.quantity AS qty,
            fpi.spl_area_sqm AS sqm_qty,
            fpi.total_kg AS kg_qty,
            fpi.rate,
            fpi.fg_item_uom AS uom,
            fpi.amount,

            CASE 
                WHEN fpi.fg_item_uom = 'SQM' THEN fpi.spl_area_sqm
                WHEN fpi.fg_item_uom = 'KG' THEN fpi.total_kg
                ELSE fpi.quantity
            END AS quantity_sum

        FROM `tabFabrication Parent Item` fpi
        INNER JOIN `tabItem` i ON i.name = fpi.parent_item
        WHERE fpi.parent = %s
        ORDER BY fpi.idx
    """, (sales_order,), as_dict=True)

    # Default empty summary
    def empty_summary():
        return {
            "quantity_sum": 0,
            "qty": 0,
            "spl_area_sqm": 0,
            "spl_weight_kg": 0,
        }

    for item in items:
        item_code = item["item_code"]

        # --- Fabrication List summary per item ---
        if fab_list:
            fl = _sum_main_and_accessory(
                parentname=fab_list,
                item_code=item_code,
                parenttype="Fabrication List",
                main_child_dt="Fabrication Item Summary",
            )
        else:
            fl = empty_summary()

        item["fl_quantity"] = fl.get("quantity_sum", 0)
        item["fl_qty"] = fl["qty"]
        item["fl_spl_area_sqm"] = fl["spl_area_sqm"]
        item["fl_spl_weight_kg"] = fl["spl_weight_kg"]

        # --- Manufacture Order summary per item ---
        if mo_name:
            mo = _sum_main_and_accessory(
                parentname=mo_name,
                item_code=item_code,
                parenttype="Manufacture Order",
                # IMPORTANT: this should normally be the MO child table
                main_child_dt="Fabrication Item Summary",
            )
        else:
            mo = empty_summary()

        item["mo_quantity"] = mo.get("quantity_sum", 0)
        item["mo_qty"] = mo["qty"]
        item["mo_spl_area_sqm"] = mo["spl_area_sqm"]
        item["mo_spl_weight_kg"] = mo["spl_weight_kg"]

    return items



@frappe.whitelist()
def get_fabrication_list_items(sales_order, item_code):
    empty = {"qty": 0, "spl_area_sqm": 0, "spl_weight_kg": 0}

    fab_list = _get_fabrication_list_from_sales_order(sales_order)
    if not fab_list:
        return empty

    return _sum_main_and_accessory(
        parentname=fab_list,
        item_code=item_code,
        parenttype = "Fabrication List",
        main_child_dt="Fabrication Item Summary"
    )

@frappe.whitelist()
def get_manufacture_order_items(sales_order, item_code):
    empty = {"qty": 0, "spl_area_sqm": 0, "spl_weight_kg": 0}

    fab_list = _get_fabrication_list_from_sales_order(sales_order)

    if not fab_list:
        return empty

    # MO linked to Fabrication List
    mo_name = frappe.db.get_value(
        "Manufacture Order",
        [
            ["fabrication_list","=", fab_list], 
            ["workflow_state", "in", ["approved by Production Manager", "Costing Completed", "Sent for Costing", "Submit"]],
            ],
        "name"
    )
    if not mo_name:
        return empty

    return _sum_main_and_accessory(
        parentname=mo_name,
        item_code=item_code,
        parenttype = "Manufacture Order",
        main_child_dt="Fabrication Item Summary"
    )

def _get_fabrication_list_from_sales_order(sales_order):
    # Estimation Request linked to SO
    est_req = frappe.db.get_value(
        "Estimation Request",
        [
            ["sales_order_number", "=", sales_order],
            ["workflow_state", "in", ["Started", "Closed"]],
        ],
        "name"
    )


    if not est_req:
        return None

    # Fabrication List linked to Estimation Request
    fab_list = frappe.db.get_value(
        "Fabrication List",
        [
            ["estimation_request", "=", est_req],
            ["workflow_state", "in", ("Approved")],
        ],
        "name"
    )

    return fab_list

def _sum_main_and_accessory(parentname, item_code, parenttype,  main_child_dt):
    # main_child_dt:
    #   - "Fabrication Item Summary"              (for Fabrication List)


    result = frappe.db.sql("""
        SELECT
            COALESCE(SUM(quantity_ch), 0) AS quantity_sum,
            COALESCE(SUM(qty), 0) AS qty,
            COALESCE(SUM(spl_area_sqm), 0) AS spl_area_sqm,
            COALESCE(SUM(spl_weight_kg), 0) AS spl_weight_kg
        FROM (
            -- Duct / main items
            SELECT
                di.qty,
                di.spl_area_sqm,
                di.spl_weight_kg,
                di.uom,
                CASE
                    WHEN di.uom = 'SQM' THEN di.spl_area_sqm
                    WHEN di.uom = 'KG' THEN di.spl_weight_kg
                    ELSE di.qty
                END AS quantity_ch
            FROM `tab{main_child_dt}` di
            WHERE di.parent = %s
            AND di.item_code = %s
                           AND di.parenttype = %s

            UNION ALL

            -- Accessories (area & weight forced to 0)
            SELECT
                ai.qty,
                0 AS spl_area_sqm,
                0 AS spl_weight_kg,
                ai.uom,
                ai.qty AS quantity_ch
            FROM `tabAccessory Item Summary` ai
            WHERE ai.parent = %s
            AND ai.item_code = %s
                           AND ai.parenttype = %s
        ) x
    """.format(main_child_dt=main_child_dt),
        (parentname, item_code, parenttype, parentname, item_code, parenttype),
        as_dict=True
    )


    if not result:
        return {"quantity_sum":0,"qty": 0, "spl_area_sqm": 0, "spl_weight_kg": 0}

    row = result[0]
    return {
        "quantity_sum": row.get("quantity_sum") or 0,
        "qty": row.get("qty") or 0,
        "spl_area_sqm": row.get("spl_area_sqm") or 0,
        "spl_weight_kg": row.get("spl_weight_kg") or 0,
    }
