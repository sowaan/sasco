import frappe
from sasco.sasco.doctype.qs_review.qs_review import (
    _get_fabrication_lists_from_sales_order,
    _get_manufacture_orders_from_fab_lists,
    _sum_main_and_accessory_for_parents,
    _empty_summary,
)


def execute(filters=None):
    return get_columns(), get_data(filters)


def get_columns():
    return [
        {"label": "Item Code",    "fieldname": "item_code",    "fieldtype": "Link",     "options": "Item", "width": 160},
        {"label": "Item Name",    "fieldname": "item_name",    "fieldtype": "Data",                        "width": 200},
        {"label": "Description",  "fieldname": "description",  "fieldtype": "Data",                        "width": 200},
        {"label": "UOM",          "fieldname": "uom",          "fieldtype": "Link",     "options": "UOM",  "width": 80},
        {"label": "SOD Qty",      "fieldname": "sod_qty",      "fieldtype": "Float",                       "width": 100},
        # {"label": "Rate",         "fieldname": "rate",         "fieldtype": "Currency",                    "width": 110},
        # {"label": "SOD Amount",   "fieldname": "sod_amount",   "fieldtype": "Currency",                    "width": 120},
        {"label": "FL Numbers",   "fieldname": "fl_numbers",   "fieldtype": "Data",                        "width": 220},
        {"label": "FL Qty",       "fieldname": "fl_qty",       "fieldtype": "Float",                       "width": 110},
        {"label": "MO Numbers",   "fieldname": "mo_numbers",   "fieldtype": "Data",                        "width": 220},
        {"label": "Utilized Qty", "fieldname": "utilized_qty", "fieldtype": "Float",                       "width": 110},
        {"label": "Available Qty","fieldname": "available_qty","fieldtype": "Float",                       "width": 110},
        {"label": "Default UOM",  "fieldname": "default_uom",  "fieldtype": "Link",     "options": "UOM",  "width": 100},
        {"label": "Balance Qty",  "fieldname": "balance_qty",  "fieldtype": "Float",                       "width": 110},
        # {"label": "Balance Amount","fieldname": "balance_amount","fieldtype": "Currency",                   "width": 130},
    ]


def get_data(filters):
    sales_order = (filters or {}).get("sales_order")
    if not sales_order:
        return []

    company  = frappe.db.get_value("Sales Order", sales_order, "company")
    fab_lists = _get_fabrication_lists_from_sales_order(sales_order)
    mo_names  = _get_manufacture_orders_from_fab_lists(fab_lists)

    items = frappe.db.sql(
        """
        SELECT
            fpi.parent_item  AS item_code,
            i.item_name,
            i.description,
            fpi.fg_item_uom  AS uom,
            fpi.rate,
            fpi.amount       AS sod_amount,
            i.stock_uom      AS default_uom,
            CASE
                WHEN fpi.fg_item_uom = 'SQM' THEN fpi.spl_area_sqm
                WHEN fpi.fg_item_uom = 'KG'  THEN fpi.total_kg
                ELSE fpi.quantity
            END AS sod_qty
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
        sod_qty   = item.get("sod_qty") or 0
        rate      = item.get("rate")    or 0
        fg_uom    = item.get("uom")     or None

        fl = (
            _sum_main_and_accessory_for_parents(
                parentnames=fab_lists,
                item_code=item_code,
                parenttype="Fabrication List",
                main_child_dt="Fabrication Item Summary",
                fg_uom=fg_uom,
            )
            if fab_lists else _empty_summary()
        )

        item["fl_numbers"] = _get_fl_numbers_for_item(fab_lists, item_code)
        item["fl_qty"]     = fl.get("quantity_sum") or 0

        mo = (
            _sum_main_and_accessory_for_parents(
                parentnames=mo_names,
                item_code=item_code,
                parenttype="Manufacture Order",
                main_child_dt="Fabrication Item Summary",
                fg_uom=fg_uom,
            )
            if mo_names else _empty_summary()
        )

        utilized = mo.get("quantity_sum") or 0

        item["mo_numbers"]   = _get_mo_numbers_for_item(mo_names, item_code)
        item["utilized_qty"] = utilized
        item["available_qty"]= _get_bin_qty(item_code, company)
        fl_qty               = item["fl_qty"]
        item["balance_qty"]  = sod_qty - fl_qty - item["available_qty"]
        item["balance_amount"] = item["balance_qty"] * rate

    return items


def _get_mo_numbers_for_item(mo_names, item_code):
    """Return comma-separated MO names that contain this item (main or accessory)."""
    if not mo_names:
        return ""

    ph = ", ".join(["%s"] * len(mo_names))
    params = list(mo_names) + [item_code] + list(mo_names) + [item_code]

    rows = frappe.db.sql(
        f"""
        SELECT DISTINCT parent FROM `tabFabrication Item Summary`
        WHERE parent IN ({ph}) AND item_code = %s AND parenttype = 'Manufacture Order'
        UNION
        SELECT DISTINCT parent FROM `tabAccessory Item Summary`
        WHERE parent IN ({ph}) AND item_code = %s AND parenttype = 'Manufacture Order'
        """,
        params,
    )

    names = [r[0] for r in rows]
    return _format_mo_numbers(names)


def _get_fl_numbers_for_item(fab_lists, item_code):
    """Return comma-separated Fabrication List names that contain this item (main or accessory)."""
    if not fab_lists:
        return ""

    ph = ", ".join(["%s"] * len(fab_lists))
    params = list(fab_lists) + [item_code] + list(fab_lists) + [item_code]

    rows = frappe.db.sql(
        f"""
        SELECT DISTINCT parent FROM `tabFabrication Item Summary`
        WHERE parent IN ({ph}) AND item_code = %s AND parenttype = 'Fabrication List'
        UNION
        SELECT DISTINCT parent FROM `tabAccessory Item Summary`
        WHERE parent IN ({ph}) AND item_code = %s AND parenttype = 'Fabrication List'
        """,
        params,
    )

    names = [r[0] for r in rows]
    return _format_mo_numbers(names)


def _format_mo_numbers(names):
    """If all MO names share the same prefix (up to the last '-'), show the prefix
    once followed by the suffixes. Otherwise fall back to full names.

    Example: ['MO-M-2026-00001', 'MO-M-2026-00002'] → 'MO-M-2026-00001, 00002'
    """
    if not names:
        return ""
    if len(names) == 1:
        return names[0]

    parts   = [n.rsplit("-", 1) for n in names]
    # rsplit gives [prefix, suffix] only when there is a '-' in the name
    if any(len(p) != 2 for p in parts):
        return ", ".join(names)

    prefixes = {p[0] for p in parts}
    if len(prefixes) == 1:
        prefix   = parts[0][0]
        suffixes = [p[1] for p in parts]
        return f"{prefix}-{', '.join(suffixes)}"

    return ", ".join(names)


def _get_bin_qty(item_code, company):
    """Return total actual_qty from Bin across all warehouses belonging to the company."""
    result = frappe.db.sql(
        """
        SELECT COALESCE(SUM(b.actual_qty), 0)
        FROM `tabBin` b
        INNER JOIN `tabWarehouse` w ON w.name = b.warehouse
        WHERE b.item_code = %s AND w.company = %s
        """,
        (item_code, company),
    )
    return result[0][0] if result else 0
