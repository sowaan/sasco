import frappe
from frappe.utils import flt

from sasco.sasco.services.master_creator import (
    ensure_item_group,
    ensure_uom,
    ensure_brand,
    ensure_item
)

DUMMY_ITEM_CODE = "Dummy Item"

def create_masters_from_fabrication(doc):

    for row in doc.fabrication_table or []:

        ensure_item_group(row.fl_item_group)
        ensure_brand(row.fl_item_brand, row.fl_item_group)
        ensure_uom(row.fl_item_uom)

        ensure_item({
            "doctype": "Item",
            "item_code": row.fg_batch_sr,
            "item_name": row.fl_item_name,
            "item_group": row.fl_item_group,
            "stock_uom": row.fl_item_uom,
            "brand": row.fl_item_brand,
            "custom_company": doc.company
        })

def before_submit(doc, method):

    create_masters_from_fabrication(doc)

    update_sales_order_if_required(doc)

def update_sales_order_if_required(doc):
    """
    Triggered before Fabrication List submit
    """

    if not doc.sales_order:
        return

    sales_order = frappe.get_doc("Sales Order", doc.sales_order)

    if not sales_order.custom_ref_quotation:
        return

    quotation = frappe.get_doc("Quotation", sales_order.custom_ref_quotation)

    if quotation.custom_inquiry_type not in ("BOQ", "Unit Rate"):
        return

    add_items_to_sales_order(doc, sales_order)


def add_items_to_sales_order(fabrication_doc, sales_order):
    """
    Append Fabrication items into Sales Order
    Remove Dummy Item if exists
    """

    if sales_order.docstatus == 2:
        frappe.throw(f"Sales Order {sales_order.name} is Cancelled")

    # 🔴 Remove Dummy Item if exists
    original_count = len(sales_order.items)

    sales_order.items = [
        row for row in sales_order.items
        if row.item_code != DUMMY_ITEM_CODE
    ]

    dummy_removed = len(sales_order.items) != original_count

    # Collect fabrication items
    items_to_add = collect_fabrication_items(fabrication_doc)

    existing_items = {item.item_code for item in sales_order.items}

    updated = dummy_removed  # if dummy removed, we must save

    for item in items_to_add:
        if not item["item_code"]:
            continue

        # Never allow dummy to be added
        if item["item_code"] == DUMMY_ITEM_CODE:
            continue

        if item["item_code"] not in existing_items:

            item_doc = frappe.get_doc("Item", item["item_code"])

            sales_order.append("items", {
                "item_code": item_doc.name,
                "item_name": item_doc.item_name,
                "description": item_doc.description or item.get("description"),
                "uom": item_doc.stock_uom,
                "stock_uom": item_doc.stock_uom,
                "conversion_factor": 1,
                "qty": flt(item["qty"]),
                "rate": 0
            })

            updated = True

    if not updated:
        return

    # Recalculate & Save
    if sales_order.docstatus == 1:
        sales_order.flags.ignore_validate_update_after_submit = True

    sales_order.run_method("set_missing_values")
    sales_order.run_method("calculate_taxes_and_totals")
    sales_order.save(ignore_permissions=True)

def collect_fabrication_items(doc):
    """
    Collect parent finished goods from fabrication and accessories
    """

    items = []

    # Fabrication Table
    for row in doc.fabrication_table or []:
        if row.spl_item_fg_code:
            items.append({
                "item_code": row.spl_item_fg_code,
                "qty": row.fl_item_qty or 1,
                "description": row.fl_item_description,
                "uom": row.spl_item_fg_uom
            })
    
    # Accessory Table
    for row in doc.accessory or []:
        if row.parent_finished_good_item:
            items.append({
                "item_code": row.parent_finished_good_item,
                "qty": row.child_finished_good_qty or 1,
                "description": row.child_finished_good_description,
                "uom": row.child_finished_good_uom
            })

    return merge_duplicate_items(items)


def merge_duplicate_items(items):
    """
    Merge same item_code quantities
    """

    merged = {}

    for item in items:
        code = item["item_code"]

        if code not in merged:
            merged[code] = item
        else:
            merged[code]["qty"] += item["qty"]

    return list(merged.values())