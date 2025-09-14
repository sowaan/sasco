import frappe # type: ignore

def before_save(self, method):
    frappe.msgprint("Before Save Hook Triggered for Sales Inquiry", alert=True) 
    # --- Step 1: validate product_type values in products table ---
    allowed_types = ["DUCT", "DAMPERS", "ACCESSORIES", "RAW MATERIAL", "METAL"]

    for row in self.products:
        if not row.product_type or row.product_type not in allowed_types:
            frappe.msgprint(
                f"Row #{row.idx}: Product Type '{row.product_type}' is invalid. Resetting to 'DUCT'.",
                alert=True,
            )
            row.product_type = "DUCT"

        # Always set insulation_required to External
        row.insulation_required = "External"

    # --- Step 2: remove rows from spec tables if their product_type is not selected ---
    # Collect selected product types from product_type_table
    selected_types = [row.product_types for row in self.product_type_table]

    # Mapping product_type → child table fieldname
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
        "Plenum": "plenum_specification_table",
    }

    for ptype, fieldname in mapping.items():
        if ptype not in selected_types:
            # Clear all rows from this child table
            self.set(fieldname, [])
