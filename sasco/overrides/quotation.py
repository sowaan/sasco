from erpnext.selling.doctype.quotation.quotation import Quotation

import frappe # type: ignore

class CustomQuotation(Quotation):
    pass
    # def validate(self):

    #     if self.custom_inquiry_type == "BOQ":
    #         self.ensure_boq_dummy_item()

    #     super().validate()

    # def ensure_boq_dummy_item(self):
        

    #     # Parent items must exist
    #     if not self.current_parent_item:
    #         frappe.throw("Parent Items are required for BOQ.")

    #     # Remove existing dummy rows to avoid duplicates
    #     self.items = [d for d in self.items if d.item_code != "Dummy Item"]

    #     # If no real items exist, add dummy
    #     if not self.items:
    #         self.append("items", {
    #             "item_code": "Dummy Item",
    #             "qty": 1,
    #             "rate": 0,
    #             "amount": 0,
    #             "description": "System Generated Dummy Item for BOQ Mode"
    #         })
