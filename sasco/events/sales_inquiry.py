from frappe import _
import frappe

def before_save(doc, method):
    # mapping of product type to child table fieldname
    mapping = {
        "Adhesives & Sealant": "adhesives_and_sealant_specification_table",
        "Dampers": "damper_specification_table",
        "Duct": "duct_specifications_table",
        "Duct Accessories": "duct_accessories_table",
        "Fastners": "fastners_specification_table",
        "Gasket & Masking Tape": "gasket_and_masking_tape_specification_table",
        "Grill": "grilles_table",
        "Diffuser": "diffuser_specification",
        "Louver": "louver_specification_table",
        "Raw Material": "raw_materal_specification_table",
        "Sound Attenuator": "sound_attenuator__specification_table",
        "Plenum": "plenum_specification_table"
    }

    # collect product types selected by user
    product_types = [row.product_types for row in (doc.product_type_table or [])]

    # check required child rows
    for ptype in product_types:
        fieldname = mapping.get(ptype)
        if fieldname:
            child_rows = getattr(doc, fieldname, [])
            if not child_rows:
                frappe.throw(
                    _(f"Please add at least 1 row in {ptype} specification table or remove '{ptype}' from Product Types.")
                )

    # clear unrelated child tables
    for ptype, fieldname in mapping.items():
        if ptype not in product_types:
            doc.set(fieldname, [])
