import frappe
from frappe.utils import today
from erpnext.stock.get_item_details import get_item_details


@frappe.whitelist()
def create_quotation_from_fabrication(fabrication_name):
    fabrication = frappe.get_doc("Fabrication List", fabrication_name)

    quotation = frappe.new_doc("Quotation")
    quotation.quotation_to = "Customer"
    quotation.company = fabrication.company
    quotation.transaction_date = today()
    quotation.custom_quotation_status = "Under Negotiation"
    quotation.custom_refrence = fabrication.priority
    quotation.party_name = fabrication.client_ref
    quotation.project = fabrication.project_ref
    quotation.custom_fabrication_list = fabrication.name
    quotation.custom_job_number = fabrication.job_number

    # --- 1) Fabrication Items → Quotation.items ---
    unique_codes = {}
    for row in fabrication.fabrication_table:
        key = row.fg_batch_sr
        unique_codes.setdefault(
            key,
            {
                "parent_item": row.spl_item_fg_code,
                "fg_batch_sr": row.fg_batch_sr,
                "fl_item_qty": 0,
                "uom": row.spl_item_fg_uom,
            },
        )
        unique_codes[key]["fl_item_qty"] += float(row.fl_item_qty or 0)

    for item in unique_codes.values():
        _add_item_to_quotation(
            quotation,
            item_code=item["fg_batch_sr"],     # ✅ real Item Code
            qty=item["fl_item_qty"],
            uom=item["uom"],
            extra_fields={"custom_parent_item_1": item["parent_item"]}  # ✅ parent reference
        )

    # --- 2) Accessories → Quotation.items ---
    acc_unique_codes = {}
    for row in fabrication.accessory or []:
        key = f"{row.child_finished_good_item}-{row.child_finished_good_uom}"
        acc_unique_codes.setdefault(
            key,
            {
                "parent_item": row.parent_finished_good_item,
                "child_finished_good_item": row.child_finished_good_item,
                "child_finished_good_uom": row.child_finished_good_uom,
                "child_finished_good_qty": 0,
            },
        )
        acc_unique_codes[key]["child_finished_good_qty"] += float(
            row.child_finished_good_qty or 0
        )

    for item in acc_unique_codes.values():
        _add_item_to_quotation(
            quotation,
            item_code=item["child_finished_good_item"],
            qty=item["child_finished_good_qty"],
            uom=item["child_finished_good_uom"],
            extra_fields={"custom_parent_item_1": item["parent_item"]},
        )

    # --- 3) Summary → Quotation.custom_parent_item ---
    parent_unique_codes = {}
    for row in fabrication.fabrication_table:
        key = row.spl_item_fg_code
        parent_unique_codes.setdefault(
            key,
            {
                "parent_item": row.spl_item_fg_code,
                "cam_item_qty": 0,
                "spl_area_sqm": 0,
                "fg_item_uom": row.spl_item_fg_uom,
            },
        )
        parent_unique_codes[key]["cam_item_qty"] += float(row.spl_qty_in_pcs or 0)
        parent_unique_codes[key]["spl_area_sqm"] += float(row.spl_area_sqm or 0)

    for row in fabrication.accessory or []:
        key = row.child_finished_good_item
        parent_unique_codes.setdefault(
            key,
            {
                "parent_item": row.child_finished_good_item,
                "cam_item_qty": 0,
                "spl_area_sqm": float(row.child_finished_good_qty or 0),  # accessories don’t have sqm
                "fg_item_uom": row.child_finished_good_uom,
            },
        )
        parent_unique_codes[key]["cam_item_qty"] += float(row.child_finished_good_qty or 0)

    for item in parent_unique_codes.values():
        quotation.append(
            "custom_parent_item",
            {
                "parent_item": item["parent_item"],
                "cam_item_qty": item["cam_item_qty"],
                "spl_area_sqm": item["spl_area_sqm"],
                "fg_item_uom": item["fg_item_uom"],
            },
        )

    # --- Default Cost Center ---
    default_cost_center = frappe.db.get_value(
        "Company", {"company_name": "SASCO Industries"}, "cost_center"
    )
    quotation.custom_cost_center = default_cost_center

    # Finalize and Save
    quotation.set_missing_values()
    quotation.calculate_taxes_and_totals()
    quotation.insert(ignore_permissions=True)

    return quotation.name


def _add_item_to_quotation(quotation, item_code, qty, uom=None, extra_fields=None):
    """Helper to add one Quotation Item with ERPNext defaults + custom fields."""

    # Prepare args for ERPNext utility
    args = {
        "item_code": item_code,
        "doctype": "Quotation",
        "company": quotation.company,
        "customer": quotation.party_name,
        "qty": qty,
        "uom": uom,
        "currency": frappe.defaults.get_global_default("currency"),
        "price_list": frappe.defaults.get_global_default("selling_price_list"),
        "plc_conversion_rate": 1,
        "conversion_rate": 1,
        "project": quotation.project,
    }

    # Get default item details
    details = get_item_details(args)

    # Append row in Quotation Items
    row = quotation.append("items", {})

    # Required fields
    row.item_code = item_code
    row.qty = qty
    row.uom = details.get("uom") or uom
    row.rate = details.get("price_list_rate", 0)
    row.stock_uom = details.get("stock_uom")
    row.item_name = details.get("item_name")
    row.description = details.get("description")

    # Copy useful stock fields
    for field in ["conversion_factor", "stock_qty", "actual_qty", "projected_qty", "min_order_qty"]:
        if details.get(field) is not None:
            row.set(field, details[field])

    # Apply any extra custom fields (like your parent reference)
    if extra_fields:
        for k, v in extra_fields.items():
            row.set(k, v)

    return row