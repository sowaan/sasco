import frappe
import json
from frappe import _

from erpnext.accounts.party import get_party_account_currency


# This method is used to make supplier quotation from supplier's portal.
@frappe.whitelist()
def create_supplier_quotation(doc):
    if isinstance(doc, str):
        doc = json.loads(doc)

    try:
        sq_doc = frappe.get_doc(
            {
                "doctype": "Supplier Quotation",
                "supplier": doc.get("supplier"),
                "terms": doc.get("terms"),
                "company": doc.get("company"),
                "currency": doc.get("currency")
                or get_party_account_currency("Supplier", doc.get("supplier"), doc.get("company")),
                "buying_price_list": doc.get("buying_price_list")
                or frappe.db.get_value("Buying Settings", None, "buying_price_list"),
				"custom_payment_terms": doc.get("payment_terms"),
				"custom_warranty_period": doc.get("custom_warranty_period"),
            }
        )
        add_items(sq_doc, doc.get("supplier"), doc.get("items"))
        sq_doc.flags.ignore_permissions = True
        sq_doc.run_method("set_missing_values")
        sq_doc.save()
        frappe.msgprint(_("Supplier Quotation {0} Created").format(sq_doc.name))
        return sq_doc.name
    except Exception:
        return None
	

def add_items(sq_doc, supplier, items):
	for data in items:
		if data.get("qty") > 0:
			if isinstance(data, dict):
				data = frappe._dict(data)

            
			create_rfq_items(sq_doc, supplier, data)


def create_rfq_items(sq_doc, supplier, data):
	args = {}

	for field in [
		"item_code",
		"item_name",
		"description",
		"qty",
		"rate",
		"custom_brands",
		"conversion_factor",
		"warehouse",
		"material_request",
		"material_request_item",
		"stock_qty",
		"custom_delivery_date"
	]:
		args[field] = data.get(field)

	args.update(
		{
			"request_for_quotation_item": data.name,
			"request_for_quotation": data.parent,
			"supplier_part_no": frappe.db.get_value(
				"Item Supplier", {"parent": data.item_code, "supplier": supplier}, "supplier_part_no"
			),
		}
	)

	sq_doc.append("items", args)
