import frappe
from frappe import _
from frappe.utils import flt

from erpnext.selling.doctype.sales_order.sales_order import (
	make_delivery_note as erpnext_make_delivery_note,
)

DUMMY_ITEM_CODE = "Dummy Item"
FABRICATION_FIELD = "custom_fabrication_list"


def _get_pending_items(sales_order):
	"""SO lines that can still be delivered (mirrors ERPNext's make_delivery_note condition)."""
	so = frappe.get_doc("Sales Order", sales_order)
	so.check_permission("read")

	pending = []
	for row in so.items:
		if row.item_code == DUMMY_ITEM_CODE or row.delivered_by_supplier:
			continue

		is_unit_price_row = so.get("has_unit_price_items") and flt(row.qty) == 0
		if abs(flt(row.delivered_qty)) < abs(flt(row.qty)) or is_unit_price_row:
			pending.append(row)

	return pending


@frappe.whitelist()
def get_pending_items_for_delivery(sales_order):
	"""Pending SO lines with their Fabrication List, for the Delivery Note pop-up."""
	return [
		{
			"name": row.name,
			"idx": row.idx,
			"item_code": row.item_code,
			"item_name": row.item_name,
			"fabrication_list": row.get(FABRICATION_FIELD) or "",
			"pending_qty": flt(row.qty) - flt(row.delivered_qty),
			"uom": row.uom,
			"rate": flt(row.rate),
		}
		for row in _get_pending_items(sales_order)
	]


@frappe.whitelist()
def make_delivery_note(source_name, so_details=None):
	"""Create a Delivery Note holding only the selected (pending) SO lines."""
	so_details = set(frappe.parse_json(so_details) or [])
	if not so_details:
		frappe.throw(_("Please select at least one item."))

	selected = [row.name for row in _get_pending_items(source_name) if row.name in so_details]

	# ERPNext maps every pending line when filtered_children is empty, so stop here instead
	if not selected:
		frappe.throw(_("None of the selected items are pending delivery."))

	return erpnext_make_delivery_note(source_name, kwargs={"filtered_children": selected})
