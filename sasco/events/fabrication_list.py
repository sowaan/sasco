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


    # frappe.log_error(f"saving data {doc.name}", f"{doc}")
    
    # update_sales_order_if_required(doc)

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

def get_total_parent_amount(sales_order):
    total = 0

    for row in sales_order.custom_parent_item or []:
        total += flt(row.amount or 0)

    return total

def distribute_parent_price_equally(sales_order):

    total_parent_amount = get_total_parent_amount(sales_order)

    if not total_parent_amount:
        return

    valid_items = [
        row for row in sales_order.items
        if row.item_code != DUMMY_ITEM_CODE
    ]

    if not valid_items:
        return

    total_qty = sum(flt(row.qty) for row in valid_items)

    if total_qty == 0:
        return

    rate_per_unit = total_parent_amount / total_qty

    for row in valid_items:
        row.rate = rate_per_unit
    
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
    # frappe.log_error(title="Items List after merge", message=str(items_to_add))
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

        # frappe.log_error(title="adding item {item_code}", message=f"{row}")
        updated = True

    if not updated:
        return

    # 🔵 Distribute pricing
    distribute_parent_price_equally(sales_order)

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
                "description": row.fl_item_specification,
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



def before_save(doc, method):
    # process_fabrication_logic(doc)
    pass

def process_fabrication_logic(doc):

    # ---------------------------------------------------------
    # Clear child tables
    # ---------------------------------------------------------
    doc.set("duct_and_acc_item", [])
    doc.set("acc_item", [])
    doc.set("acc_item1", [])
    doc.set("material_summary", [])
    doc.set("material_list1", [])
    doc.set("fabrication_list_table", [])
    doc.set("auto_fold_list", [])
    doc.set("auto_fold_summary", [])
    doc.set("non_auto_fold_items", [])

    # =========================================================
    # 1️⃣ GROUP BY DUCT / ACCESSORY ITEMS
    # =========================================================

    fab_unique_items = {}

    if doc.fabrication_table:
        for row in doc.fabrication_table:
            key = row.spl_item_fg_code

            if key not in fab_unique_items:
                fab_unique_items[key] = {
                    "item_code": row.spl_item_fg_code,
                    "item_name": row.spl_item_fg_name,
                    "uom": row.spl_item_fg_uom,
                    "qty": row.spl_qty_in_pcs or 0,
                    "spl_area_sqm": row.spl_area_sqm or 0,
                    "spl_weight_kg": row.spl_weight_kg or 0,
                    "duct_range": row.duct_range,
                    "thickness": row.fl_item_gauge,
                }
            else:
                fab_unique_items[key]["qty"] += row.spl_qty_in_pcs or 0
                fab_unique_items[key]["spl_area_sqm"] += row.spl_area_sqm or 0
                fab_unique_items[key]["spl_weight_kg"] += row.spl_weight_kg or 0

        for value in fab_unique_items.values():
            doc.append("duct_and_acc_item", {
                "item_code": value["item_code"],
                "item_name": value["item_name"],
                "uom": value["uom"],
                "qty": value["qty"],
                "spl_area_sqm": value["spl_area_sqm"],
                "spl_weight_kg": value["spl_weight_kg"],
                "duct_range": value["duct_range"],
                "thickness": value["thickness"],
            })

    # =========================================================
    # 2️⃣ ACCESSORY GROUPING
    # =========================================================

    unique_items = {}

    if doc.accessory:
        for row in doc.accessory:
            key = (row.child_finished_good_item, row.child_finished_good_uom)

            if key not in unique_items:
                unique_items[key] = {
                    "item_code": row.child_finished_good_item,
                    "item_name": row.child_finished_good_item_name,
                    "uom": row.child_finished_good_uom,
                    "qty": row.child_finished_good_qty or 0,
                }
            else:
                unique_items[key]["qty"] += row.child_finished_good_qty or 0

        for value in unique_items.values():
            doc.append("acc_item", value)
            doc.append("acc_item1", value)

    # =========================================================
    # 3️⃣ GROUP BY MATERIAL ITEM
    # =========================================================

    mat_unique_items = {}

    if doc.material_list:
        for row in doc.material_list:

            # Copy full list into material_list1
            doc.append("material_list1", row.as_dict())

            key = (
                row.coil_item_code_rm,
                row.coil_item_uom,
                row.coil_item_brand,
                row.spl_item_fg_code,
                row.fl_item_gauge,
            )

            if key not in mat_unique_items:
                mat_unique_items[key] = {
                    "parent_finished_good": row.spl_item_fg_code,
                    "item_code": row.coil_item_code_rm,
                    "item_brand": row.coil_item_brand,
                    "uom": row.coil_item_uom,
                    "qty": row.coil_item_qty or 0,
                    "fl_item_gauge": row.fl_item_gauge,
                    "sum_of_fl_item_qty": row.sum_of_fl_item_qty or 0,
                    "sum_of_duct_weight": row.sum_of_duct_weight or 0,
                    "sum_of_duct_area_with_seam": row.sum_of_duct_area_with_seam or 0,
                    "fl_item_specification": row.fl_item_specification,
                }
            else:
                mat_unique_items[key]["qty"] += row.coil_item_qty or 0
                mat_unique_items[key]["sum_of_fl_item_qty"] += row.sum_of_fl_item_qty or 0
                mat_unique_items[key]["sum_of_duct_weight"] += row.sum_of_duct_weight or 0
                mat_unique_items[key]["sum_of_duct_area_with_seam"] += row.sum_of_duct_area_with_seam or 0

        for value in mat_unique_items.values():
            doc.append("material_summary", {
                "parent_finished_good": value["parent_finished_good"],
                "material_item_code": value["item_code"],
                "material_item_brand": value["item_brand"],
                "material_item_uom": value["uom"],
                "material_item_qty": value["qty"],
                "fl_item_gauge": value["fl_item_gauge"],
                "sum_of_fl_item_qty": value["sum_of_fl_item_qty"],
                "sum_of_duct_weight": value["sum_of_duct_weight"],
                "sum_of_duct_area_with_seam": value["sum_of_duct_area_with_seam"],
                "fl_item_specification": value["fl_item_specification"],
            })

    # =========================================================
    # 4️⃣ VALIDATION (OPTIMIZED)
    # =========================================================

    fabrication_fg_set = {row.spl_item_fg_code for row in doc.fabrication_table or []}

    if doc.accessory:
        for acc in doc.accessory:
            if acc.parent_finished_good_item not in fabrication_fg_set:
                frappe.throw(
                    f"Parent FG {acc.parent_finished_good_item} of Accessory Table is not defined in the Duct Table."
                )

    if doc.material_list:
        for mat in doc.material_list:
            if mat.spl_item_fg_code not in fabrication_fg_set:
                frappe.throw(
                    f"Parent FG {mat.spl_item_fg_code} in Raw Materials Table is not defined in the Duct Table."
                )

    # =========================================================
    # 5️⃣ FABRICATION LIST TABLE COPY
    # =========================================================

    if doc.fabrication_table:
        for row in doc.fabrication_table:
            doc.append("fabrication_list_table", row.as_dict())

    # =========================================================
    # 6️⃣ AUTO FOLD
    # =========================================================

    total_fl_item_qty = 0
    total_coil_item_qty = 0
    autofold_unique = {}

    if doc.fabrication_table:
        # Build lookup once
        material_lookup = {}
        for m in doc.material_list or []:
            material_lookup[m.fl_item] = {
                "coil_item_qty": m.coil_item_qty or 0,
                "coil_item_uom": m.coil_item_uom
            }

        for row in doc.fabrication_table:
            spec = (row.fl_item_specification or "").strip().lower()
            angle = float(row.pl_item_length__angle or 0)

            if spec == "straight" and angle in (1220, 1200):

                coil_qty = 0
                coil_uom = None

                # for m in doc.material_list or []:
                #     if m.fl_item == row.fl_item:
                #         coil_qty = m.coil_item_qty or 0
                #         coil_uom = m.coil_item_uom
                #         break
                material_data = material_lookup.get(row.fl_item, {})
                coil_qty = material_data.get("coil_item_qty", 0)
                coil_uom = material_data.get("coil_item_uom")

                doc.append("auto_fold_list", {
                    "fl_item": row.fl_item,
                    "fl_item_specification": row.fl_item_specification,
                    "fl_item_gauge": row.fl_item_gauge,
                    "fl_item_qty": row.fl_item_qty,
                    "coil_item_qty": coil_qty,
                    "coil_item_uom": coil_uom,
                    "pl_item_length__angle": row.pl_item_length__angle,
                    "duct_range": row.duct_range,
                })

                key = (
                    row.fl_item_gauge,
                    row.pl_item_length__angle,
                    coil_uom,
                    row.duct_range,
                )

                if key not in autofold_unique:
                    autofold_unique[key] = {
                        "fl_item_name_description": row.fl_item_specification,
                        "fl_item_gauge": row.fl_item_gauge,
                        "fl_item_qty": 0,
                        "coil_item_qty": 0,
                        "pl_item_length__angle": row.pl_item_length__angle,
                        "coil_item_uom": coil_uom,
                        "duct_range": row.duct_range,
                    }

                autofold_unique[key]["fl_item_qty"] += row.fl_item_qty or 0
                autofold_unique[key]["coil_item_qty"] += coil_qty

                total_fl_item_qty += row.fl_item_qty or 0
                total_coil_item_qty += coil_qty

    for value in autofold_unique.values():
        doc.append("auto_fold_summary", value)

    doc.total_fl_item_qty = total_fl_item_qty
    doc.total_coil_item_qty = total_coil_item_qty

    # =========================================================
    # 7️⃣ NON AUTO FOLD SUMMARY
    # =========================================================

    non_auto_fold_map = {}
    total_non_auto_fold_qty = 0

    for row in doc.fabrication_table or []:

        spec = (row.fl_item_specification or "").strip().lower()
        angle = float(row.pl_item_length__angle or 0)

        if spec == "straight" and angle == 1220:
            continue

        # key = (row.fl_item_specification, row.duct_range)
        key = (
            row.fl_item_specification or "Unknown",
            row.duct_range or "Unknown"
        )

        if key not in non_auto_fold_map:
            non_auto_fold_map[key] = {
                "fl_item_name_description": row.fl_item_specification,
                "fl_item_gauge": row.fl_item_gauge,
                "fl_item_qty": 0,
                "pl_item_length__angle": row.pl_item_length__angle,
                "duct_range": row.duct_range,
                "coil_item_uom": row.coil_item_uom,
                "coil_item_qty": 0,
            }

        fl_qty = row.fl_item_qty or 0
        coil_qty = row.coil_item_qty or 0

        non_auto_fold_map[key]["fl_item_qty"] += fl_qty
        non_auto_fold_map[key]["coil_item_qty"] += coil_qty

        total_non_auto_fold_qty += fl_qty

    for value in non_auto_fold_map.values():
        doc.append("non_auto_fold_items", value)

    doc.total_non_auto_fold_items = total_non_auto_fold_qty