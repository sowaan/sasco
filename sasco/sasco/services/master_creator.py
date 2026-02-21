import frappe


def ensure_item_group(name):
    if not name or name.isdigit():
        return

    if not frappe.db.exists("Item Group", name):
        frappe.get_doc({
            "doctype": "Item Group",
            "item_group_name": name,
            "custom_abbreviation":name
        }).insert(ignore_permissions=True)


def ensure_uom(name):
    if not name or name.isdigit():
        return

    if not frappe.db.exists("UOM", name):
        frappe.get_doc({
            "doctype": "UOM",
            "uom_name": name,
        }).insert(ignore_permissions=True)


def ensure_brand(name, item_group=None):
    if not name or name.isdigit():
        return

    if not frappe.db.exists("Brand", name):
        frappe.get_doc({
            "doctype": "Brand",
            "brand": name,
            "custom_product_group": item_group or "Default",
            "custom_item_group": item_group or "Default",
            "custom_brand_origin": "Local"
        }).insert(ignore_permissions=True)


def ensure_item(data):
    if not data.get("item_code") or data["item_code"].isdigit():
        return

    if not frappe.db.exists("Item", data["item_code"]):
        frappe.get_doc(data).insert(ignore_permissions=True)