import frappe
from frappe.utils import today
from erpnext.stock.get_item_details import get_item_details
from frappe.model.document import Document


@frappe.whitelist()
def create_quotation_from_fabrication(fabrication_name, uom=None):
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
                "cam_item_qty": 0,     # always in PCS
                "spl_area_sqm": 0,     # keep raw sqm for reference
                "total_kg": 0,         # keep raw kg for reference
                "quantity": 0,         # unified quantity based on UOM
                "fg_item_uom": uom or row.spl_item_fg_uom,
            },
        )

        # accumulate PCS
        parent_unique_codes[key]["cam_item_qty"] += float(row.spl_qty_in_pcs or 0)

        # accumulate both raw metrics
        parent_unique_codes[key]["spl_area_sqm"] += float(row.spl_area_sqm or 0)
        parent_unique_codes[key]["total_kg"] += float(row.spl_weight_kg or 0)

        # now decide which value goes into `quantity`
        current_uom = uom or row.spl_item_fg_uom
        parent_unique_codes[key]["quantity"] = 100
        if current_uom == "SQM":
            parent_unique_codes[key]["quantity"] = parent_unique_codes[key]["spl_area_sqm"]
        elif current_uom == "KG":
            parent_unique_codes[key]["quantity"] = parent_unique_codes[key]["total_kg"]

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
        parent_unique_codes[key]["quantity"] = parent_unique_codes[key]["cam_item_qty"]

    for item in parent_unique_codes.values():
        quotation.append(
            "custom_parent_item",
            {
                "parent_item": item["parent_item"],
                "cam_item_qty": item["cam_item_qty"],
                "spl_area_sqm": item["spl_area_sqm"],
                "fg_item_uom": item["fg_item_uom"],
                "quantity": item["quantity"],
            },
        )

    # --- Default Cost Center ---
    default_cost_center = frappe.db.get_value(
        "Company", {"company_name": fabrication.company}, "cost_center"
    )
    quotation.custom_cost_center = default_cost_center

    # contact person
    contact_name = frappe.db.get_value(
        "Contact Link",
        {"link_doctype": "Customer", "link_name": fabrication.client_ref},
        "parent"
    )

    if not contact_name:
        contact = frappe.get_doc({
            "doctype": "Contact",
            "first_name": "Default",
            "last_name": "Contact",
            "is_primary_contact": 1,
            "links": [{
                "link_doctype": "Customer",
                "link_name": fabrication.client_ref
            }]
        }).insert(ignore_permissions=True)
        contact_name = contact.name

    quotation.contact_person = contact_name    


    # Finalize and Save
    quotation.set_missing_values()
    quotation.calculate_taxes_and_totals()
    quotation.insert(ignore_permissions=True)

    return quotation.name


def _add_item_to_quotation(quotation, item_code,  qty, uom=None, extra_fields=None):
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
        "price_list": frappe.defaults.get_global_default("buying_price_list"),
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
    row.rate = details.get("rate")
    
    row.stock_uom = details.get("stock_uom")
    row.item_name = details.get("item_name")
    row.description = details.get("description")
    row.conversion_rate = 1
    row.plc_conversion_rate = 1
    row.price_list_rate = details.get("price_list_rate")
    
    #print(f"\n\nrow before for: {row.rate} - {row.base_rate}\n\n")
    # Copy useful stock fields
    for field in ["conversion_factor", "stock_qty", "actual_qty", "projected_qty", "min_order_qty"]:
        if details.get(field) is not None:
            row.set(field, details[field])

    # Apply any extra custom fields (like your parent reference)
    if extra_fields:
        for k, v in extra_fields.items():
            row.set(k, v)
    #print(f"\n\nrow after for: {row.rate} - {row.base_rate}\n\n")
    return row





@frappe.whitelist()
def create_manufacture_order(fabrication_name):
    """
    Create Manufacture Order from a Fabrication document.
    """
    fabrication = frappe.get_doc("Fabrication List", fabrication_name)

    mo = frappe.new_doc("Manufacture Order")
    mo.company = fabrication.company
    mo.date = fabrication.normal
    mo.fabrication_list = fabrication.name
    mo.total_fl_item_qty = fabrication.total_fl_item_qty
    mo.total_coil_item_qty = fabrication.total_coil_item_qty

    # 1. Costing Sheet Items
    for item in fabrication.fabrication_table:
        mo.append("item_table", {
            "item_code": item.fg_batch_sr,
            "item_name": item.fl_item_name,
            "parent_finished_goods_item": item.spl_item_fg_code,
            "quantity": item.fl_item_qty,
            "uom": item.fl_item_uom,
            "item_guage": item.fl_item_gauge,
            "spl_area_sqm": item.spl_area_sqm,
            "spl_weight_kg": item.spl_weight_kg,
            "cam_item_vanes_splitter_qty_1": item.cam_item_vanes_splitter_qty_1,
            "cam_item_duct_seam_1": item.cam_item_duct_seam_1,
            "duct_range": item.duct_range,
            "duct_connector_1": item.duct_connector_1,
            "duct_connector_2": item.duct_connector_2,
            "pl_item_length__angle": item.pl_item_length__angle,
            "fabrication_cost": item.operation_cost
        })

    # 2. Material List
    for item in fabrication.material_list1:
        mo.append("raw_material_item", {
            "fl_item": item.fl_item,
            "fl_item_gauge": item.fl_item_gauge,
            "sum_of_fl_item_qty": item.sum_of_fl_item_qty,
            "spl_item_fg_code": item.spl_item_fg_code,
            "spl_item_fg_name": item.spl_item_fg_name,
            "coil_item_code_rm": item.coil_item_code_rm,
            "coil_item_uom": item.coil_item_uom,
            "coil_item_brand": item.coil_item_brand,
            "coil_item_specification": item.coil_item_specification,
            "item_group": item.coil_item_group,
            "coil_item_qty": item.coil_item_qty,
            "coil_item_remaining_qty": item.coil_item_qty,
            "sum_of_duct_weight": item.sum_of_duct_weight,
            "sum_of_duct_area_with_seam": item.sum_of_duct_area_with_seam,
            "fg_batch_sr": item.fg_batch_sr
        })

    # 3. Material Summary
    for item in fabrication.material_summary:
        mo.append("raw_material_summary", {
            "parent_finished_good": item.parent_finished_good,
            "material_item_code": item.material_item_code,
            "material_item_brand": item.material_item_brand,
            "material_item_uom": item.material_item_uom,
            "material_item_qty": item.material_item_qty,
            "material_item_max_qty": 0,
            "material_item_used_qty": 0,
            "material_item_remaining_qty": 0,
            "sum_of_fl_item_qty": item.sum_of_fl_item_qty,
            "fl_item_gauge": item.fl_item_gauge,
            "sum_of_duct_weight": item.sum_of_duct_weight,
            "sum_of_duct_area_with_seam": item.sum_of_duct_area_with_seam,
            "fl_item_specification": item.fl_item_specification
        })

    # 4. Accessory Summary
    for item in fabrication.acc_item:
        mo.append("accessory_summary", {
            "item_code": item.item_code,
            "item_code_linked": item.item_code,
            "item_name": item.item_name,
            "uom": item.uom,
            "qty": item.qty
        })

    # 5. Auto Fold Summary
    for item in fabrication.auto_fold_summary:
        mo.append("auto_fold_summary", {
            "item_code": item.item_code,
            "item_name": item.item_name,
            "uom": item.uom,
            "qty": item.qty
        })

    # 6. Fabrication Item Summary
    for item in fabrication.duct_and_acc_item:
        mo.append("duct_and_acc_item", {
            "item_code": item.item_code,
            "item_name": item.item_name,
            "uom": item.uom,
            "qty": item.qty,
            "spl_area_sqm": item.spl_area_sqm,
            "spl_weight_kg": item.spl_weight_kg,
            "duct_range": item.duct_range
        })

    # Save the Manufacture Order
    mo.insert(ignore_permissions=True)

    frappe.db.commit()

    return mo.name
