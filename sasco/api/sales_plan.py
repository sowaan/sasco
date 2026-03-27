import frappe
from frappe.utils import getdate

@frappe.whitelist()
def custom_get_events(start=None, end=None, filters=None, field_map=None, **kwargs):

    # ✅ Normalize dates (fix your original issue)
    start = getdate(start)
    end = getdate(end)

    # ✅ Call original method ONLY with valid params
    return frappe.get_attr(
        "frappe.desk.doctype.event.event.get_events"
    )(
        start=start,
        end=end,
        filters=filters,
        
    )