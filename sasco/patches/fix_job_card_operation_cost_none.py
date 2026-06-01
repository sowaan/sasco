import frappe


def execute():
    script_name = "Get Sales Order Item"

    if not frappe.db.exists("Server Script", script_name):
        return

    old_line = "total_opr_cost = total_opr_cost + row.operation_cost"
    new_line = "total_opr_cost = total_opr_cost + (row.operation_cost or 0)"

    script = frappe.db.get_value("Server Script", script_name, "script") or ""

    if old_line not in script:
        return  # already patched or line not found

    frappe.db.set_value(
        "Server Script",
        script_name,
        "script",
        script.replace(old_line, new_line),
        update_modified=False,
    )
    frappe.db.commit()
