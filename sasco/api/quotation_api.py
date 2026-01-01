
import frappe


@frappe.whitelist()
def make_sales_order_from_quotation(source_name):
    from frappe.model.mapper import get_mapped_doc

    def set_missing_values(source, target):
        target.custom_ref_quotation = source.name
        target.custom_parent_item = source.custom_parent_item
        target.customer = source.party_name
        target.run_method("set_customer_details")
        target.custom_mobile_number = source.custom_mobile_no
        target.company = source.company
        target.custom_sales_inquiry_ref_ = source.custom_refrence
        target.run_method("set_project_details")
        # target.custom_project_location = source.custom_project_location

    def update_item(source, target, source_parent):
        target.custom_parent_item_1 = source.custom_parent_item_1
        target.custom_s1 = source.custom_s1
        target.custom_s2 = source.custom_s2
        target.custom_s3 = source.custom_s3
        target.custom_s4 = source.custom_s4
        target.custom_lengthangle = source.custom_lengthangle
        target.custom_gaugethickess = source.custom_gaugethickess
        target.custom_fixing_1st_side = source.custom_fixing_1st_side
        target.custom_stiffener_total_qty = source.custom_stiffener_total_qty
        target.custom_fixing_2nd_side = source.custom_fixing_2nd_side
        target.custom_vanes_nos = source.custom_vanes_nos
        target.custom_stiffener = source.custom_stiffener
        target.custom_joint = source.custom_joint

    doc = get_mapped_doc(
        "Quotation",
        source_name,
        {
            "Quotation": {
                "doctype": "Sales Order",
                "validation": {"docstatus": ["=", 1]}
            },
            "Quotation Item": {
                "doctype": "Sales Order Item",
                "postprocess": update_item
            }
        },
        None,
        set_missing_values
    )

    return doc
