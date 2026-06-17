# Copyright (c) 2026, Sowaan and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt


# Field mapping used when loading Fabrication Lists into filtered_fabrication_list.
FILTERED_LIST_FIELDS = [
	"name as fabrication",
	"client_ref as customer",
	"normal as date",
	"project_ref as project",
	"lead",
	"oppurtunity",
	"fabrication_template",
	"job_number",
]


class FabricationFilter(Document):
	def validate(self):
		"""Authoritative rebuild of the items, parent items and totals on save.

		The filtered_fabrication_list table (loaded on the client when a Sales
		Order is selected) is preserved as-is; everything derived from it is
		recomputed here so the saved document is always consistent.
		"""
		fab_names = [r.fabrication for r in (self.filtered_fabrication_list or []) if r.fabrication]

		items, parents = _aggregate(fab_names)
		if self.sales_order:
			_apply_so_rates(parents, self.sales_order)

		self.fabrication_filter_items = []
		for it in items:
			self.append("fabrication_filter_items", it)

		net_total = 0.0
		self.parent_item = []
		for p in parents:
			net_total += flt(p["amount"])
			self.append("parent_item", p)

		self.net_total = net_total
		self.tax_amount, self.grand_total = _compute_taxes(net_total, self.taxes_and_charges)


def _aggregate(fab_names):
	"""Build (items, parents) from the given Fabrication Lists.

	items   -> fabrication_filter_items, from fabrication_table + accessory
	          (existing behaviour), aggregated by item key.
	parents -> parent_item, from duct_and_acc_item ("Summary of Delivery Note"),
	          aggregated by item_code. rate/amount are filled later from the SO.
	"""
	child_unique = {}
	parent_unique = {}

	for name in fab_names:
		fab_doc = frappe.get_doc("Fabrication List", name)

		# ---- Items (current source: fabrication_table + accessory) ----
		for row in fab_doc.get("fabrication_table", []):
			key = row.fg_batch_sr
			if key not in child_unique:
				child_unique[key] = {
					"item": row.fg_batch_sr,
					"parent_item": row.spl_item_fg_code,
					"quantity": flt(row.fl_item_qty),
				}
			else:
				child_unique[key]["quantity"] += flt(row.fl_item_qty)

		for row in fab_doc.get("accessory", []):
			key = row.child_finished_good_item
			if key not in child_unique:
				child_unique[key] = {
					"item": row.child_finished_good_item,
					"parent_item": row.parent_finished_good_item,
					"quantity": flt(row.child_finished_good_qty),
				}
			else:
				child_unique[key]["quantity"] += flt(row.child_finished_good_qty)

		# ---- Parent items (from duct_and_acc_item / Summary of Delivery Note) ----
		for row in fab_doc.get("duct_and_acc_item", []):
			key = row.item_code
			if key not in parent_unique:
				parent_unique[key] = {
					"parent_item": row.item_code,
					"fg_item_uom": row.uom,
					"quantity": flt(row.qty),
					"spl_area_sqm": flt(row.spl_area_sqm),
					"total_kg": flt(row.spl_weight_kg),
					"rate": 0.0,
					"amount": 0.0,
				}
			else:
				parent_unique[key]["quantity"] += flt(row.qty)
				parent_unique[key]["spl_area_sqm"] += flt(row.spl_area_sqm)
				parent_unique[key]["total_kg"] += flt(row.spl_weight_kg)

	return list(child_unique.values()), list(parent_unique.values())


def _apply_so_rates(parents, sales_order):
	"""Fill rate/amount on parent rows from matching Sales Order Item rates."""
	so_items = frappe.get_all(
		"Sales Order Item",
		filters={"parent": sales_order},
		fields=["item_code", "rate"],
	)
	rate_map = {r.item_code: flt(r.rate) for r in so_items}
	for p in parents:
		if p["parent_item"] in rate_map:
			p["rate"] = rate_map[p["parent_item"]]
			p["amount"] = p["rate"] * flt(p["quantity"])


def _compute_taxes(net_total, taxes_and_charges):
	"""Return (tax_amount, grand_total) for the given template."""
	tax_amount = 0.0
	if taxes_and_charges and net_total:
		template = frappe.get_doc("Sales Taxes and Charges Template", taxes_and_charges)
		for tax_row in template.get("taxes", []):
			if tax_row.charge_type == "On Net Total":
				tax_amount += flt(net_total) * flt(tax_row.rate) / 100
			elif tax_row.charge_type == "Actual":
				tax_amount += flt(tax_row.tax_amount)
	return tax_amount, flt(net_total) + tax_amount


@frappe.whitelist()
def load_from_sales_order(sales_order, taxes_and_charges=None):
	"""Live preview for the form: given a Sales Order, return the matching
	Fabrication Lists plus the aggregated items, parent items and totals.
	"""
	filtered = frappe.get_all(
		"Fabrication List",
		filters={"sales_order": sales_order, "docstatus": 1},
		fields=FILTERED_LIST_FIELDS,
		limit_page_length=0,
	)

	fab_names = [r["fabrication"] for r in filtered]
	items, parents = _aggregate(fab_names)
	_apply_so_rates(parents, sales_order)

	net_total = sum(flt(p["amount"]) for p in parents)
	tax_amount, grand_total = _compute_taxes(net_total, taxes_and_charges)

	return {
		"filtered_fabrication_list": filtered,
		"fabrication_filter_items": items,
		"parent_item": parents,
		"net_total": net_total,
		"tax_amount": tax_amount,
		"grand_total": grand_total,
	}
