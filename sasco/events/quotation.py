import frappe
from frappe import _
# from decimal import Decimal, ROUND_HALF_UP
from erpnext.stock.get_item_details import get_price_list_rate_for
from frappe.utils import flt, today ,cint, money_in_words

def before_save(doc, method):
    if not doc.selling_price_list:
        frappe.throw("Price List is required to fetch rates.")

    total_qty = 0
    total_amount = 0

    for row in doc.custom_parent_item:
        if not row.parent_item:
            continue

        if not row.price_list:
            row.price_list = doc.selling_price_list

        ctx = {
            "price_list": row.price_list,   # use the row's value (whether set already or just updated)
            "customer": doc.customer,
            "uom": row.fg_item_uom,
            "transaction_date": doc.transaction_date,
            "qty": 1,
            "stock_uom": row.fg_item_uom,
            "conversion_factor": 1
        }

        price_data = get_price_list_rate_for(ctx, row.parent_item)

        if price_data:
            row.rate = flt(price_data)
        else:
            row.rate = 0

        row.amount = flt(row.quantity) * flt(row.rate)

        total_qty += flt(row.quantity)
        total_amount += flt(row.amount)

    doc.custom_parent_total_qty = total_qty
    doc.custom_parent_total = total_amount

    total_item_qty = doc.total_qty or sum([flt(item.qty) for item in doc.items if flt(item.qty)])
    main_total = 0

    if total_item_qty and total_amount:
        for item in doc.items:
            if item.qty:
                proportionate_amount = (flt(item.qty) / total_item_qty) * total_amount
                item.rate = proportionate_amount / flt(item.qty)
                item.amount = item.qty * item.rate
                main_total += item.amount

        doc.total = main_total if main_total else 0

    net_total = doc.total if doc.total else 0
    
    total_taxes = 0

    if doc.apply_discount_on == "Net Total":
        if flt(doc.additional_discount_percentage):
            discount_amount = (net_total * flt(doc.additional_discount_percentage)) / 100
            doc.discount_amount = discount_amount
            net_total -= discount_amount
        elif flt(doc.discount_amount):
            net_total -= flt(doc.discount_amount)
    doc.net_total = net_total


    for tax in doc.taxes:
        if tax.charge_type == "On Net Total":
            tax.tax_amount = (net_total * flt(tax.rate)) / 100
        elif tax.charge_type == "Actual":
            tax.tax_amount = flt(tax.tax_amount)
        elif tax.charge_type == "On Previous Row Amount":
            prev_amount = doc.taxes[tax.row_id - 1].tax_amount if tax.row_id > 0 else 0
            tax.tax_amount = (prev_amount * flt(tax.rate)) / 100
        else:
            tax.tax_amount = 0
        
        # frappe.msgprint(f" {net_total} for : {tax.tax_amount}")
        
        tax.total = net_total + tax.tax_amount
        total_taxes += tax.tax_amount
        doc.total_taxes_and_charges = total_taxes

    grand_total_before_discount = net_total + total_taxes

    if doc.apply_discount_on == "Grand Total":
        if flt(doc.additional_discount_percentage):
            discount_amount = (grand_total_before_discount * flt(doc.additional_discount_percentage)) / 100
            doc.discount_amount = discount_amount
            doc.grand_total = round(grand_total_before_discount - discount_amount, 2)
        elif flt(doc.discount_amount):
            doc.grand_total = round(grand_total_before_discount - flt(doc.discount_amount), 2)
        else:
            doc.grand_total = round(grand_total_before_discount, 2)
    else:
        doc.grand_total = round(grand_total_before_discount, 2)

    if not doc.disable_rounded_total:
        rounded_total = round(doc.grand_total) if doc.grand_total else 0
        doc.rounding_adjustment = round(rounded_total - doc.grand_total, 2)
        doc.rounded_total = rounded_total
    else:
        doc.rounding_adjustment = 0
        doc.rounded_total = doc.grand_total or 0

    doc.in_words = money_in_words(doc.rounded_total, doc.currency)
