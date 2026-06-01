import frappe


def execute():
    frappe.db.sql("""
        UPDATE `tabDocField`
        SET read_only = 0
        WHERE parent = 'Manufacture Order Job Card'
          AND fieldname = 'qty_in_pcs'
          AND read_only = 1
    """)
    frappe.db.commit()
