import frappe
from frappe.model.document import Document


class QSReview(Document):
    pass


# -----------------------------
# Helpers for linked documents
# -----------------------------

def _get_fabrication_lists_from_sales_order(sales_order: str) -> list[str]:
    """Return ALL Fabrication List names linked to this Sales Order via Estimation Requests.

    SO -> Estimation Request(s) -> Fabrication List(s)
    """

    # Estimation Requests linked to SO with allowed workflow states
    est_reqs = frappe.get_all(
        "Estimation Request",
        filters={
            "sales_order_number": sales_order,
            "workflow_state": ["in", ["Started", "Closed"]],
        },
        pluck="name",
    )

    if not est_reqs:
        return []

    # Fabrication Lists linked to those Estimation Requests
    fab_lists = frappe.get_all(
        "Fabrication List",
        filters={
            "estimation_request": ["in", est_reqs],
            "workflow_state": ["in", ["Approved"]],
        },
        pluck="name",
    )

    return fab_lists


def _get_manufacture_orders_from_fab_lists(fab_lists: list[str]) -> list[str]:
    """Return ALL Manufacture Order names linked to these Fabrication Lists."""

    if not fab_lists:
        return []

    mo_names = frappe.get_all(
        "Manufacture Order",
        filters={
            "fabrication_list": ["in", fab_lists],
            "workflow_state": [
                "in",
                [
                    "approved by Production Manager",
                    "Costing Completed",
                    "Sent for Costing",
                    "Submit",
                ],
            ],
        },
        pluck="name",
    )

    return mo_names


def _empty_summary():
    return {
        "quantity_sum": 0,
        "qty": 0,
        "spl_area_sqm": 0,
        "spl_weight_kg": 0,
    }


def _sum_main_and_accessory_for_parents(
    parentnames: list[str],
    item_code: str,
    parenttype: str,
    main_child_dt: str,
):
    """Sum quantities for a given item_code across multiple parents (FLs or MOs).

    This aggregates the data from:
      - main_child_dt (e.g. "Fabrication Item Summary")
      - "Accessory Item Summary"

    for all given parentnames.
    """

    if not parentnames:
        return _empty_summary()

    # Build placeholders for IN (%s, %s, ...)
    parent_placeholders = ", ".join(["%s"] * len(parentnames))

    query = f"""
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
            WHERE di.parent IN ({parent_placeholders})
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
            WHERE ai.parent IN ({parent_placeholders})
              AND ai.item_code = %s
              AND ai.parenttype = %s
        ) x
    """

    # parameters: parents... + [item_code, parenttype] + parents... + [item_code, parenttype]
    params = (
        list(parentnames)
        + [item_code, parenttype]
        + list(parentnames)
        + [item_code, parenttype]
    )

    result = frappe.db.sql(query, params, as_dict=True)

    if not result:
        return _empty_summary()

    row = result[0]
    return {
        "quantity_sum": row.get("quantity_sum") or 0,
        "qty": row.get("qty") or 0,
        "spl_area_sqm": row.get("spl_area_sqm") or 0,
        "spl_weight_kg": row.get("spl_weight_kg") or 0,
    }


# -----------------------------
# Main API – used by the QS Review form
# -----------------------------

@frappe.whitelist()
def get_qs_items(sales_order: str):
    """Return summarized quantities for each SO item, including:

    - SO (QS) quantities
    - Aggregated Fabrication List quantities (all FLs)
    - Aggregated Manufacture Order quantities (all MOs)
    """

    # 1) All Fabrication Lists for this SO (through Estimation Requests)
    fab_lists = _get_fabrication_lists_from_sales_order(sales_order)

    # 2) All Manufacture Orders linked to those Fabrication Lists
    mo_names = _get_manufacture_orders_from_fab_lists(fab_lists)

    # 3) Base query for QS items (from Fabrication Parent Item)
    items = frappe.db.sql(
        """
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
    """,
        (sales_order,),
        as_dict=True,
    )

    for item in items:
        item_code = item["item_code"]

        # --- Fabrication List summary per item (sum over all FLs) ---
        if fab_lists:
            fl = _sum_main_and_accessory_for_parents(
                parentnames=fab_lists,
                item_code=item_code,
                parenttype="Fabrication List",
                main_child_dt="Fabrication Item Summary",
            )
        else:
            fl = _empty_summary()

        item["fl_quantity"] = fl.get("quantity_sum", 0)
        item["fl_qty"] = fl["qty"]
        item["fl_spl_area_sqm"] = fl["spl_area_sqm"]
        item["fl_spl_weight_kg"] = fl["spl_weight_kg"]

        # --- Manufacture Order summary per item (sum over all MOs) ---
        if mo_names:
            mo = _sum_main_and_accessory_for_parents(
                parentnames=mo_names,
                item_code=item_code,
                parenttype="Manufacture Order",
                # Using same child table as existing working logic
                main_child_dt="Fabrication Item Summary",
            )
        else:
            mo = _empty_summary()

        item["mo_quantity"] = mo.get("quantity_sum", 0)
        item["mo_qty"] = mo["qty"]
        item["mo_spl_area_sqm"] = mo["spl_area_sqm"]
        item["mo_spl_weight_kg"] = mo["spl_weight_kg"]

    return items


# -----------------------------
# Other whitelisted APIs
# -----------------------------

@frappe.whitelist()
def get_fabrication_list_items(sales_order: str, item_code: str):
    """Return aggregated FL summary for a single item across all Fabrication Lists."""
    fab_lists = _get_fabrication_lists_from_sales_order(sales_order)
    if not fab_lists:
        return _empty_summary()

    return _sum_main_and_accessory_for_parents(
        parentnames=fab_lists,
        item_code=item_code,
        parenttype="Fabrication List",
        main_child_dt="Fabrication Item Summary",
    )


@frappe.whitelist()
def get_manufacture_order_items(sales_order: str, item_code: str):
    """Return aggregated MO summary for a single item across all Manufacture Orders."""
    fab_lists = _get_fabrication_lists_from_sales_order(sales_order)
    mo_names = _get_manufacture_orders_from_fab_lists(fab_lists)

    if not mo_names:
        return _empty_summary()

    return _sum_main_and_accessory_for_parents(
        parentnames=mo_names,
        item_code=item_code,
        parenttype="Manufacture Order",
        main_child_dt="Fabrication Item Summary",
    )
