import frappe


def execute():
    """Disable the legacy database-stored scripts for Fabrication Filter.

    Their logic now lives in code:
      - Server Script 'Get Fabrication Records' -> FabricationFilter.validate()
        (sasco/sasco/doctype/fabrication_filter/fabrication_filter.py)
      - Client Script 'Create Proforma Invoice' -> the doctype form script
        (sasco/sasco/doctype/fabrication_filter/fabrication_filter.js)

    Disabling (not deleting) the DB records prevents the logic from running
    twice while preserving the originals for reference.
    """
    if frappe.db.exists("Server Script", "Get Fabrication Records"):
        frappe.db.set_value(
            "Server Script",
            "Get Fabrication Records",
            "disabled",
            1,
            update_modified=False,
        )

    if frappe.db.exists("Client Script", "Create Proforma Invoice"):
        frappe.db.set_value(
            "Client Script",
            "Create Proforma Invoice",
            "enabled",
            0,
            update_modified=False,
        )

    frappe.db.commit()
