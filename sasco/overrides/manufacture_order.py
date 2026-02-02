from erpnext.manufacturing.doctype.manufacture_order.manufacture_order import ManufactureOrder
import frappe
from frappe.model.document import Document

def n(val):
    return float(val or 0)


class CustomManufactureOrder(ManufactureOrder):

    def validate(self):
        # Call standard ERPNext validation first
        super().validate()

        # Your custom costing logic
        self.calculate_custom_costing()

    def calculate_custom_costing(self):
        self._load_tolerance()
        self.calculate_raw_material_summary()
        self.calculate_accessory_summary()
        self.calculate_accessory_summary_with_fg_batch()
        self.calculate_consumable_cost()
        self.calculate_delivery_cost()
        self.calculate_item_table_summary()
        self.calculate_job_card_cost()
        self.calculate_grand_totals()
        self.calculate_duct_item_costs()

    # ---------------------------------------------------------------------
    # Helpers
    # ---------------------------------------------------------------------

    def _load_tolerance(self):
        self.tol = 0
        settings = frappe.get_doc("Manufacturing Order Settings")

        for row in settings.tolerance or []:
            if row.company == self.company:
                self.tol = n(row.tolerance)

    # ---------------------------------------------------------------------
    # RAW MATERIAL
    # ---------------------------------------------------------------------

    def calculate_raw_material_summary(self):
        total_qty = 0
        total_cost = 0

        for row in self.raw_material_item or []:
            rate = self._get_item_rate(row.coil_item_code_rm)
            qty = n(row.coil_item_qty)

            row.costing_rate = rate
            row.coil_item_max_qty = qty + (qty * self.tol / 100)
            row.coil_item_remaining_qty = row.coil_item_max_qty
            row.coil_item_used_qty = 0

            total_qty += qty
            total_cost += rate * qty

        self.total_raw_material_quantity = total_qty
        self.total_raw_material_cost = total_cost
        self.total_raw_material_cost_ = total_cost

    # ---------------------------------------------------------------------
    # ACCESSORY SUMMARY
    # ---------------------------------------------------------------------

    def calculate_accessory_summary(self):
        for row in self.accessory_summary or []:
            qty = n(row.qty)
            rate = n(row.rate)

            row.amount = qty * rate
            row.max_qty = qty + (qty * self.tol / 100)
            row.remaining_qty = row.max_qty
            row.used_qty = 0

            row.se_max_qty = row.max_qty
            row.se_remaining_qty = row.se_max_qty
            row.se_used_qty = 0

    # ---------------------------------------------------------------------
    # ACCESSORY SUMMARY WITH FG BATCH
    # ---------------------------------------------------------------------

    def calculate_accessory_summary_with_fg_batch(self):
        self.accessory_summary_with_fg_batch_sr = []
        total_qty = 0
        total_amount = 0

        if not self.fabrication_list:
            return

        fab = frappe.get_doc("Fabrication List", self.fabrication_list)
        grouped = {}

        for row in fab.accessory or []:
            key = (row.child_finished_good_item, row.fg_batch_sr, row.child_finished_good_uom)
            grouped.setdefault(key, {
                "item_code": row.child_finished_good_item,
                "item_name": row.child_finished_good_item_name,
                "fg_batch_sr": row.fg_batch_sr,
                "uom": row.child_finished_good_uom,
                "qty": 0,
            })
            grouped[key]["qty"] += n(row.child_finished_good_qty)

        for data in grouped.values():
            rate = self._get_item_rate(data["item_code"])
            amount = rate * data["qty"]

            self.append("accessory_summary_with_fg_batch_sr", {
                "item_code_linked": data["item_code"],
                "item_name": data["item_name"],
                "fg_batch_sr": data["fg_batch_sr"],
                "uom": data["uom"],
                "qty": data["qty"],
                "rate": rate,
                "amount": amount,
            })

            total_qty += data["qty"]
            total_amount += amount

        self.total_accessory_item_quantity = total_qty
        self.total_accessory_item_amount = total_amount
        self.total_accessory_item_amount_ = total_amount

    # ---------------------------------------------------------------------
    # CONSUMABLE & DELIVERY
    # ---------------------------------------------------------------------

    def calculate_consumable_cost(self):
        total_qty = 0
        total_cost = 0

        for row in self.consumable_cost or []:
            qty = n(row.quantity)
            rate = n(row.rate)

            row.amount = qty * rate
            row.max_quantity = qty + (qty * self.tol / 100)
            row.remaining_quantity = row.max_quantity
            row.used_quantity = 0

            total_qty += qty
            total_cost += row.amount

        self.total_consumable_quantity = total_qty
        self.total_consumable_cost = total_cost
        self.total_consumable_cost_1 = total_cost

    def calculate_delivery_cost(self):
        total_qty = 0
        total_cost = 0

        for row in self.delivery_cost or []:
            qty = n(row.quantity)
            rate = n(row.rate)

            row.amount = qty * rate
            total_qty += qty
            total_cost += row.amount

        self.total_delivery_quantity = total_qty
        self.total_delivery_cost = total_cost
        self.total_delivery_cost1 = total_cost

    # ---------------------------------------------------------------------
    # ITEM TABLE
    # ---------------------------------------------------------------------

    def calculate_item_table_summary(self):
        total_area = 0
        total_qty = 0

        for row in self.item_table or []:
            qty = n(row.quantity)
            rate = n(row.rate)

            row.amount = qty * rate
            total_area += n(row.spl_area_sqm)
            total_qty += qty

        self.total_spl_area_sqm = total_area
        self.total_fg_item_quantity = total_qty

    # ---------------------------------------------------------------------
    # JOB CARD
    # ---------------------------------------------------------------------

    def calculate_job_card_cost(self):
        total_time = 0
        total_cost = 0

        for row in self.job_card or []:
            if row.start and row.end:
                row.operation_cost = n(row.time_spent) * (n(row.per_hour_rate) / 3600)
                total_time += n(row.time_spent)
                total_cost += row.operation_cost

        self.total_time_spent = total_time
        self.total_operation_cost = total_cost
        self.total_operation_cost_ = total_cost

    # ---------------------------------------------------------------------
    # GRAND TOTALS
    # ---------------------------------------------------------------------

    def calculate_grand_totals(self):
        self.grand_total = (
            n(self.total_raw_material_cost)
            + n(self.total_accessory_item_amount_)
            + n(self.total_operation_cost_)
            + n(self.total_consumable_cost)
            + n(self.total_delivery_cost)
        )

        self.total_over_head_cost_ = self.grand_total * (n(self.additional_over_head_cost_percentage) / 100)
        self.total_over_head_cost = self.total_over_head_cost_

        self.grand_total += self.total_over_head_cost

    # ---------------------------------------------------------------------
    # DUCT COST
    # ---------------------------------------------------------------------

    def calculate_duct_item_costs(self):
        self.duct_item = []

        total_area = sum(n(r.spl_area_sqm) for r in self.duct_and_acc_item or [])

        for row in self.duct_and_acc_item or []:
            cost = 0
            if total_area:
                cost = self.grand_total * (n(row.spl_area_sqm) / total_area)

            self.append("duct_item", {
                "item_code": row.item_code,
                "item_name": row.item_name,
                "uom": row.uom,
                "qty": row.qty,
                "spl_area_sqm": row.spl_area_sqm,
                "cost": cost,
            })

    # ---------------------------------------------------------------------
    # UTIL
    # ---------------------------------------------------------------------

    def _get_item_rate(self, item_code):
        rate = frappe.db.get_value("Bin", {"item_code": item_code}, "valuation_rate")
        if not rate:
            rate = frappe.db.get_value("Item", item_code, "valuation_rate")
        return n(rate)
