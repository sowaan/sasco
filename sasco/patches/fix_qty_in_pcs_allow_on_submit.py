import frappe


def execute():
    frappe.db.sql("""
        UPDATE `tabDocField`
        SET allow_on_submit = 1
        WHERE parent = 'Manufacture Order Job Card'
          AND fieldname = 'qty_in_pcs'
          AND allow_on_submit = 0
    """)
    frappe.db.commit()
