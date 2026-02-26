import frappe
from frappe.utils import flt

from sasco.sasco.services.master_creator import (
    ensure_item_group,
    ensure_uom,
    ensure_brand,
    ensure_item
)

from erpnext.stock.get_item_details import get_item_details

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

    frappe.throw(f"Sumission Stopped....")

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

    # 🔴 Remove Dummy Item properly
    for row in list(sales_order.items):
        if row.item_code == DUMMY_ITEM_CODE:
            sales_order.remove(row)

    # Collect fabrication items
    items_to_add = collect_fabrication_items(fabrication_doc)
    frappe.log_error(title="Items List after merge", message=str(items_to_add))
    # frappe.log_error(f"items to add {sales_order.name}", f"{items_to_add}")
    updated = False

    for item in items_to_add:

        item_code = item.get("item_code")
        if not item_code or item_code == DUMMY_ITEM_CODE:
            continue

        qty = flt(item.get("qty"))

        # 🔵 Check if item already exists → update qty
        existing_row = next(
            (row for row in sales_order.items if row.item_code == item_code),
            None
        )

        if existing_row:
            existing_row.qty += qty
            updated = True
            continue

        # 🔵 Fetch proper ERPNext item details
        args = {
            "item_code": item_code,
            "doctype": "Sales Order",
            "company": sales_order.company,
            "customer": sales_order.customer,
            "qty": qty,
            "uom": item.get("uom"),
            "currency": sales_order.currency,
            "price_list": sales_order.selling_price_list,
            "plc_conversion_rate": 1,
            "conversion_rate": sales_order.conversion_rate,
            "project": sales_order.project,
        }

        details = get_item_details(args)

        row = sales_order.append("items", {})

        # Core fields
        row.item_code = item_code
        row.item_name = details.get("item_name")
        row.description = details.get("description") or item.get("description")
        row.uom = details.get("uom")
        row.stock_uom = details.get("stock_uom")
        row.conversion_factor = details.get("conversion_factor") or 1
        row.qty = qty

        # Pricing
        row.rate = details.get("rate")
        row.price_list_rate = details.get("price_list_rate")
        row.base_rate = details.get("base_rate")

        # Project / Cost Center
        row.project = sales_order.project
        row.cost_center = sales_order.get("cost_center")

        # 🔵 Custom Fields (if coming from fabrication)
        row.custom_parent_item_1 = item.get("parent_item")
        row.custom_s1 = item.get("custom_s1")
        row.custom_s2 = item.get("custom_s2")
        row.custom_s3 = item.get("custom_s3")
        row.custom_s4 = item.get("custom_s4")
        row.custom_lengthangle = item.get("custom_lengthangle")
        row.custom_gaugethickess = item.get("custom_gaugethickess")
        row.custom_fixing_1st_side = item.get("custom_fixing_1st_side")
        row.custom_stiffener_total_qty = item.get("custom_stiffener_total_qty")
        row.custom_fixing_2nd_side = item.get("custom_fixing_2nd_side")
        row.custom_vanes_nos = item.get("custom_vanes_nos")
        row.custom_stiffener = item.get("custom_stiffener")
        row.custom_joint = item.get("custom_joint")

        frappe.log_error(title="adding item {item_code}", message=f"{row}")
        updated = True

    if not updated:
        return

    # Recalculate & Save
    if sales_order.docstatus == 1:
        sales_order.flags.ignore_validate_update_after_submit = True

    sales_order.run_method("set_missing_values")
    sales_order.run_method("calculate_taxes_and_totals")
    sales_order.save(ignore_permissions=True)
    # sales_order.save(ignore_permissions=True)
    frappe.db.commit()

def collect_fabrication_items(doc):

    items = []

    for row in doc.fabrication_table or []:
        if row.fg_batch_sr:
            uom = (row.spl_item_fg_uom or "").strip().upper()
            qty = "SQM"

            if uom == "SQM":
                qty = flt(row.spl_area_sqm)

            elif uom in ("NOS", "PCS"):
                qty = flt(row.spl_qty_in_pcs)

            elif uom in ("KG", "WEIGHT"):
                qty = flt(row.spl_weight_kg)

            else:
                # fallback safety
                qty = flt(row.spl_qty_in_pcs)  

            items.append({
                "item_code": row.fg_batch_sr,
                "qty": qty,
                "description": row.fl_item_description,
                "uom": uom,
                "parent_item": row.spl_item_fg_code,
                "custom_s1": getattr(row, "dim_1", None),
                "custom_s2": getattr(row, "dim_2", None),
                "custom_s3": getattr(row, "dim_3", None),
                "custom_s4": getattr(row, "dim_4", None),
                "custom_lengthangle": getattr(row, "custom_lengthangle", None),
                "custom_gaugethickess": getattr(row, "custom_gaugethickess", None),
                "custom_fixing_1st_side": getattr(row, "custom_fixing_1st_side", None),
                "custom_stiffener_total_qty": getattr(row, "custom_stiffener_total_qty", None),
                "custom_fixing_2nd_side": getattr(row, "custom_fixing_2nd_side", None),
                "custom_vanes_nos": getattr(row, "custom_vanes_nos", None),
                "custom_stiffener": getattr(row, "custom_stiffener", None),
                "custom_joint": getattr(row, "custom_joint", None),
            })

    for row in doc.accessory or []:
        if row.child_finished_good_item:
            items.append({
                "item_code": row.child_finished_good_item,
                "qty": row.child_finished_good_qty or 1,
                "description": row.child_finished_good_description,
                "uom": row.child_finished_good_uom,
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