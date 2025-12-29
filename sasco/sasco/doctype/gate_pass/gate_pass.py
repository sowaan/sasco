# Copyright (c) 2025, Sowaan and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class GatePass(Document):
	def validate(self):
		for row in self.delivery_details:
			dn = frappe.get_doc("Delivery Note", row.delivery_note)
			if dn.customer != self.customer or dn.docstatus != 1:
				frappe.throw(
					f"Delivery Note {dn.name} is not submitted or does not belong to selected customer"
				)

		self.validate_no_duplicate_dn_items()
		self.validate_gate_pass_quantities()

	def validate_gate_pass_quantities(self):
		"""
		Prevent over-allocation of Delivery Note Items
		"""
		for row in self.detail_items:
			if not row.delivery_note_item:
				frappe.throw("Delivery Note Item reference is missing.")

			dn_item = frappe.db.get_value(
				"Delivery Note Item",
				row.delivery_note_item,
				["qty", "custom_gate_passed_qty"],
				as_dict=True
			)

			if not dn_item:
				frappe.throw(
					f"Delivery Note Item not found for Item {row.item_code}"
				)

			already_passed = dn_item.custom_gate_passed_qty or 0
			pending_qty = dn_item.qty - already_passed

			if row.qty <= 0:
				frappe.throw(
					f"Qty must be greater than zero for Item {row.item_code}"
				)

			if row.qty > pending_qty:
				frappe.throw(
					f"""
					Gate Pass qty exceeds pending qty for Item {row.item_code}.
					<br>Pending: {pending_qty}
					"""
				)
	def on_submit(self):
		self.update_delivery_note_items(add=True)
		
	def update_delivery_note_items(self, add=True):
		"""
		Update gate_passed_qty on Delivery Note Item
		add=True  → on_submit
		add=False → on_cancel
		"""

		for row in self.detail_items:
			if not row.delivery_note_item:
				continue

			qty_change = row.qty if add else -row.qty

			frappe.db.sql("""
				UPDATE `tabDelivery Note Item`
				SET custom_gate_passed_qty = IFNULL(custom_gate_passed_qty, 0) + %s
				WHERE name = %s
			""", (qty_change, row.delivery_note_item))

	def validate_no_duplicate_dn_items(self):
		seen = set()
		for row in self.detail_items:
			if row.delivery_note_item in seen:
				frappe.throw(
					f"Duplicate Delivery Note Item detected for Item {row.item_code}"
				)
			seen.add(row.delivery_note_item)

@frappe.whitelist()
def get_pending_dn_items(
    delivery_note,
    item_code=None,
    warehouse=None
):
    conditions = ["dni.parent = %s"]
    values = [delivery_note]

    if item_code:
        conditions.append("dni.item_code = %s")
        values.append(item_code)

    if warehouse:
        conditions.append("dni.warehouse = %s")
        values.append(warehouse)


    return frappe.db.sql(f"""
        SELECT
            dni.name AS delivery_note_item,
            dni.item_code,
						 dni.item_name,
            dni.qty - IFNULL(dni.custom_gate_passed_qty, 0) AS pending_qty,
            dni.uom,
            dni.warehouse
        FROM `tabDelivery Note Item` dni
        WHERE
            {' AND '.join(conditions)}
            AND (dni.qty - IFNULL(dni.custom_gate_passed_qty, 0)) > 0
    """, values, as_dict=True)

