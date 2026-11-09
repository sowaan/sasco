"""
Add `custom_fabrication_list` to Sales Order Item / Delivery Note Item and backfill it.

Fixtures are synced *after* post_model_sync patches, so the fields are created here
(same definition as fixtures/custom_field.json) before the backfill runs.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

FIELD = {
	"fieldname": "custom_fabrication_list",
	"label": "Fabrication List",
	"fieldtype": "Link",
	"options": "Fabrication List",
	"insert_after": "custom_parent_item_1",
	"read_only": 1,
	"search_index": 1,
	"module": "Sasco",
}


def execute():
	if not frappe.db.exists("DocType", "Fabrication List"):
		return

	create_custom_fields(
		{"Sales Order Item": [FIELD], "Delivery Note Item": [FIELD]},
		update=True,
	)

	backfill_sales_order_items()
	backfill_delivery_note_items()


def backfill_sales_order_items():
	"""Link existing SO lines to the submitted Fabrication List that added them.

	An item code that appears in more than one Fabrication List of the same SO is
	ambiguous (e.g. a shared accessory) and is left empty.
	"""
	fabrication_lists = frappe.get_all(
		"Fabrication List",
		filters={"docstatus": 1, "sales_order": ["is", "set"]},
		fields=["name", "sales_order"],
	)

	# (sales_order, item_code) -> set of Fabrication Lists
	owners = {}

	for fl in fabrication_lists:
		item_codes = set(
			frappe.get_all(
				"Fabrication Table",
				filters={"parent": fl.name, "parenttype": "Fabrication List"},
				pluck="fg_batch_sr",
			)
		) | set(
			frappe.get_all(
				"Accessory Table",
				filters={"parent": fl.name, "parenttype": "Fabrication List"},
				pluck="child_finished_good_item",
			)
		)

		for item_code in filter(None, item_codes):
			owners.setdefault((fl.sales_order, item_code), set()).add(fl.name)

	for (sales_order, item_code), fls in owners.items():
		if len(fls) != 1:
			continue

		frappe.db.sql(
			"""
			UPDATE `tabSales Order Item`
			SET custom_fabrication_list = %s
			WHERE parent = %s AND parenttype = 'Sales Order'
			  AND item_code = %s
			  AND IFNULL(custom_fabrication_list, '') = ''
			""",
			(next(iter(fls)), sales_order, item_code),
		)


def backfill_delivery_note_items():
	frappe.db.sql(
		"""
		UPDATE `tabDelivery Note Item` dni
		INNER JOIN `tabSales Order Item` soi ON soi.name = dni.so_detail
		SET dni.custom_fabrication_list = soi.custom_fabrication_list
		WHERE IFNULL(dni.custom_fabrication_list, '') = ''
		  AND IFNULL(soi.custom_fabrication_list, '') != ''
		"""
	)
