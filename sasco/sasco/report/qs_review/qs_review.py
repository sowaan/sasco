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
        # Item Info
        {"label": "Item Code",      "fieldname": "item_code",             "fieldtype": "Link",     "options": "Item", "width": 160},
        {"label": "Item Name",      "fieldname": "item_name",             "fieldtype": "Data",                        "width": 220},
        {"label": "UOM",            "fieldname": "uom",                   "fieldtype": "Link",     "options": "UOM",  "width": 80},
        {"label": "Rate",           "fieldname": "rate",                  "fieldtype": "Currency",                    "width": 110},

        # SOD (Sales Order Document)
        {"label": "SOD Qty (Nos)",  "fieldname": "sod_qty",               "fieldtype": "Float",                       "width": 110},
        {"label": "SOD Qty (SQM)",  "fieldname": "sod_qty_sqm",           "fieldtype": "Float",                       "width": 110},
        {"label": "SOD Qty (KG)",   "fieldname": "sod_qty_kg",            "fieldtype": "Float",                       "width": 110},
        {"label": "SOD Amount",     "fieldname": "sod_amount",            "fieldtype": "Currency",                    "width": 120},

        # Fabrication List — SPL
        {"label": "SPL Qty (Nos)",  "fieldname": "spl_qty",               "fieldtype": "Float",                       "width": 110},
        {"label": "SPL Qty (SQM)",  "fieldname": "spl_qty_sqm",           "fieldtype": "Float",                       "width": 110},
        {"label": "SPL Qty (KG)",   "fieldname": "spl_qty_kg",            "fieldtype": "Float",                       "width": 110},

        # Manufacture Order — Utilized
        {"label": "Utilized (Nos)", "fieldname": "utilized_from_sod",     "fieldtype": "Float",                       "width": 120},
        {"label": "Utilized (SQM)", "fieldname": "utilized_from_sod_sqm", "fieldtype": "Float",                       "width": 120},
        {"label": "Utilized (KG)",  "fieldname": "utilized_from_sod_kg",  "fieldtype": "Float",                       "width": 120},

        # Balance
        {"label": "Balance (Nos)",  "fieldname": "sod_balance_qty",       "fieldtype": "Float",                       "width": 120},
        {"label": "Balance (SQM)",  "fieldname": "sod_balance_qty_sqm",   "fieldtype": "Float",                       "width": 120},
        {"label": "Balance (KG)",   "fieldname": "sod_balance_qty_kg",    "fieldtype": "Float",                       "width": 120},
        {"label": "Balance Amount", "fieldname": "sod_balance_amount",    "fieldtype": "Currency",                    "width": 130},
    ]


def get_data(filters):
    sales_order = (filters or {}).get("sales_order")
    if not sales_order:
        return []

    fab_lists = _get_fabrication_lists_from_sales_order(sales_order)
    mo_names  = _get_manufacture_orders_from_fab_lists(fab_lists)

    items = frappe.db.sql(
        """
        SELECT
            fpi.parent_item           AS item_code,
            i.item_name,
            fpi.quantity              AS sod_qty,
            fpi.spl_area_sqm          AS sod_qty_sqm,
            fpi.total_kg              AS sod_qty_kg,
            fpi.rate,
            fpi.fg_item_uom           AS uom,
            fpi.amount                AS sod_amount,
            CASE
                WHEN fpi.fg_item_uom = 'SQM' THEN fpi.spl_area_sqm
                WHEN fpi.fg_item_uom = 'KG'  THEN fpi.total_kg
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
        item_code    = item["item_code"]
        sod_qty      = item.get("sod_qty")      or 0
        sod_qty_sqm  = item.get("sod_qty_sqm")  or 0
        sod_qty_kg   = item.get("sod_qty_kg")   or 0
        rate         = item.get("rate")          or 0
        quantity_sum = item.get("quantity_sum")  or 0

        fl = (
            _sum_main_and_accessory_for_parents(
                parentnames=fab_lists,
                item_code=item_code,
                parenttype="Fabrication List",
                main_child_dt="Fabrication Item Summary",
            )
            if fab_lists else _empty_summary()
        )

        mo = (
            _sum_main_and_accessory_for_parents(
                parentnames=mo_names,
                item_code=item_code,
                parenttype="Manufacture Order",
                main_child_dt="Fabrication Item Summary",
            )
            if mo_names else _empty_summary()
        )

        item["spl_qty"]               = fl["qty"]
        item["spl_qty_sqm"]           = fl["spl_area_sqm"]
        item["spl_qty_kg"]            = fl["spl_weight_kg"]

        item["utilized_from_sod"]     = mo["qty"]
        item["utilized_from_sod_sqm"] = mo["spl_area_sqm"]
        item["utilized_from_sod_kg"]  = mo["spl_weight_kg"]

        item["sod_balance_qty"]       = sod_qty     - mo["qty"]
        item["sod_balance_qty_sqm"]   = sod_qty_sqm - mo["spl_area_sqm"]
        item["sod_balance_qty_kg"]    = sod_qty_kg  - mo["spl_weight_kg"]
        item["sod_balance_amount"]    = (quantity_sum - (mo.get("quantity_sum") or 0)) * rate

    return items
