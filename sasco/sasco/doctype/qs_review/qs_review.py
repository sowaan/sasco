# Copyright (c) 2025, Sowaan and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class QSReview(Document):
	pass

@frappe.whitelist()
def get_qs_items(sales_order):
    # Fetch Sales Order Items
    items = frappe.db.sql("""
        SELECT 
            soi.item_code, 
            i.item_name, 
            soi.qty, 
            soi.rate, 
            soi.uom, 
            soi.amount
        FROM `tabSales Order Item` soi
        INNER JOIN `tabItem` i ON i.name = soi.item_code
        WHERE soi.parent = %s
        ORDER BY soi.idx
    """, (sales_order,), as_dict=True)

    # Loop through items and calculate Material Request utilization
    for item in items:
        mo_qty = get_fabrication_items(sales_order, item.item_code, "Manufacture Order")
        fl_qty = get_fabrication_items(sales_order, item.item_code, "Fabrication List")

        item["mo_qty"] = mo_qty
        item["fl_qty"] = fl_qty
    return items

@frappe.whitelist()
def get_fabrication_items(sales_order, item_code, parenttype):
    # Step 1: Find Estimation Request linked to Sales Order
    est_req = frappe.db.get_value(
        "Estimation Request", 
        {"sales_order_number": sales_order, "docstatus": 1}, 
        "name"
    )

    if not est_req:
        return 0  # No estimation request, so qty = 0

    parentname = None

    # Step 2: Find Fabrication List linked to the Estimation Request
    fab_list = frappe.db.get_value(
        "Fabrication List",
        {"estimation_request": est_req,
         "docstatus": 1},
        "name"
    )

    if not fab_list:
        return 0  # No fabrication list, so qty = 0

    parentname = fab_list

    #if parenttype is Manufacture Order, find the MO linked to the Fabrication List
    if parenttype == "Manufacture Order":
        mo_name = frappe.db.get_value(
            "Manufacture Order",
            {"fabrication_list": fab_list,
            "docstatus": 1},
            "name"
        )         
        if not mo_name:
            return 0  # No manufacture order, so qty = 0
        parentname = mo_name

    # Step 3: Return total qty of the item in duct_and_acc_item table
    total_qty = frappe.db.sql("""
        SELECT 
            SUM(qty) AS total_qty
        FROM `tabFabrication Item Summary`
        WHERE parent = %s
          AND item_code = %s
                              AND parenttype = %s
    """, (parentname, item_code, parenttype), as_dict=True)

    # Extract number safely
    qty = total_qty[0].get("total_qty") or 0

    return qty
