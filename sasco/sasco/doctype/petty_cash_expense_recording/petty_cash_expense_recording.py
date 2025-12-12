# Copyright (c) 2025, Sowaan and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import flt

class PettyCashExpenseRecording(Document):
	def validate(self):
		validate_detail_rows(self)


def validate_detail_rows(doc):
	"""
	Rules:
	- If a detail row has data (i.e. not completely empty),
		then:
		* expense_type is required
		* gl_account is required
		* Either amount > 0 or sanctioned_amount > 0
	- At least one valid detail row must exist.
	"""

	if not doc.detail_table:
		frappe.throw("At least one detail row is required in Petty Expenses.")

	has_valid_row = False

	any_tax = False

	for row in doc.detail_table:
		tax_amt = flt(getattr(row, "tax_amount", 0))
		# Consider a row "empty" if all key fields are blank
		is_completely_empty = not (
				row.date or
			row.expense_type
			or row.gl_account
			or row.amount
			or row.sanctioned_amount
			or row.description
			or row.remarks
		)

		if is_completely_empty:
			# skip fully empty rows (user maybe added and left it blank)
			continue

		errors = []

		# 1) expense_type is not selected
		if not row.expense_type:
			errors.append("Expense Type is required")

		# 2) gl_account is not present
		if not row.gl_account:
			errors.append("GL Account is required")

		# 3) sanctioned_amount and amount both are not present
		#    OR both are <= 0
		amt = flt(row.amount)
		sanc = flt(row.sanctioned_amount)

		if not (amt > 0 or sanc > 0):
			errors.append("Either Amount or Sanctioned Amount must be greater than 0")

		if errors:
			msg = f"Row {row.idx}: " + "; ".join(errors)
			frappe.throw(msg)

		if tax_amt > 0:
			any_tax = True
		has_valid_row = True

	if not has_valid_row:
		frappe.throw(
			"Please enter at least one valid Petty Expense row with "
			"Expense Type, GL Account, and a positive Amount or Sanctioned Amount."
		)

	if any_tax and not doc.tax_account:
		frappe.throw("Tax Account is required when any Tax Amount is entered in detail rows.")




import frappe
from frappe.utils import flt

import frappe
from frappe.utils import flt


@frappe.whitelist()
def make_journal_entry(docname):
	doc = frappe.get_doc("Petty Cash Expense Recording", docname)

	if doc.docstatus != 1:
		frappe.throw("You can only make a Journal Entry from a submitted document.")

	if not doc.company:
		frappe.throw("Company is required to create the Journal Entry.")

	if not doc.payment_account:
		frappe.throw("Payment Account is required to create the Journal Entry.")

	# Don't recreate if already exists
	if getattr(doc, "journal_entry", None):
		return doc.journal_entry

	credit_account = doc.payment_account

	# Inspect Journal Entry Account meta to avoid assigning fields that might not exist
	je_account_meta = frappe.get_meta("Journal Entry Account")
	has_cost_center_field = je_account_meta.has_field("cost_center")
	has_project_field = je_account_meta.has_field("project")
	has_asset_field = je_account_meta.has_field("asset")
	has_vehicle_field = je_account_meta.has_field("vehicle")

	je = frappe.new_doc("Journal Entry")
	je.voucher_type = "Journal Entry"      # or Bank Entry / Cash Entry
	je.company = doc.company
	je.posting_date = doc.date
	je.user_remark = f"Auto JE from Petty Cash Expense Recording {doc.name}"

	total_debit = 0.0        # from expense lines (sanctioned_amount)
	total_tax = 0.0          # from tax_amount in detail rows
	tax_rows_info = []		  # to log which rows had tax

	# ---- Debit lines from child table (expenses) ----
	for row in doc.detail_table:
		if not row.gl_account or not flt(row.sanctioned_amount):
			continue

		amount = flt(row.sanctioned_amount)
		total_debit += amount

		line = je.append("accounts", {})
		line.account = row.gl_account
		line.debit_in_account_currency = amount

		# user_remark: Employee / Accountant
		emp_desc = row.description or ""
		acc_remarks = row.remarks or ""
		line.user_remark = f"Employee: {emp_desc}\n\nAccountant: {acc_remarks}"

		# accumulate tax
		tax_amt = flt(getattr(row, "tax_amount", 0))
		if tax_amt:
			total_tax += tax_amt
			tax_rows_info.append(
				f"Row {row.idx}: {tax_amt:.2f} ({row.expense_type or 'N/A'})"
			)

		# --- Safely assign accounting dimension fields only when:
		#     1) the field exists on Journal Entry Account, and
		#     2) the row actually has a value for it ---
		if has_cost_center_field and getattr(row, "cost_center", None):
			line.cost_center = row.cost_center

		if has_project_field and getattr(row, "project", None):
			line.project = row.project

		# asset & vehicle may be removed by the user; only set when the field exists
		if has_asset_field and getattr(row, "asset", None):
			line.asset = row.asset

		if has_vehicle_field and getattr(row, "vehicle", None):
			line.vehicle = row.vehicle

	if total_debit <= 0 and total_tax <= 0:
		frappe.throw("Total sanctioned amount and tax must be greater than zero to create Journal Entry.")

	# ---- Separate debit line for total tax (if any) ----
	if total_tax > 0:
		if not getattr(doc, "tax_account", None):
			frappe.throw("Tax Account is required because tax amounts exist in detail rows.")

		tax_line = je.append("accounts", {})
		tax_line.account = doc.tax_account
		tax_line.debit_in_account_currency = total_tax

		# Keep your existing user_remark behavior but include detailed rows if present
		if tax_rows_info:
			tax_line.user_remark = "Tax on petty expenses:\n" + "\n".join(tax_rows_info)
		else:
			tax_line.user_remark = "Tax on petty expenses"

		# Optionally mirror permanent dims (cost_center/project) onto the tax line
		# (only if those fields exist on JE Account and are present on the parent doc)
		# if has_cost_center_field and getattr(doc, "cost_center", None):
		# 	tax_line.cost_center = doc.cost_center
		# if has_project_field and getattr(doc, "project", None):
		# 	tax_line.project = doc.project

	# ---- Single credit line from Payment Account ----
	total_credit = total_debit + total_tax

	credit_line = je.append("accounts", {})
	credit_line.account = credit_account
	credit_line.credit_in_account_currency = total_credit
	credit_line.user_remark = f"Credit from Payment Account {credit_account}"

	# Mirror permanent dims onto the credit line if the fields exist on JE Account and values exist on parent
	# if has_cost_center_field and getattr(doc, "cost_center", None):
	# 	credit_line.cost_center = doc.cost_center
	# if has_project_field and getattr(doc, "project", None):
	# 	credit_line.project = doc.project

	je.insert()
	# je.submit()

	# Link back to petty cash doc (only if that field exists on the parent doctype)
	if "journal_entry" in [df.fieldname for df in doc.meta.fields]:
		doc.db_set("journal_entry", je.name)

	return je.name




@frappe.whitelist()
def get_expense_account(company, expense_type):
    """
    Given Expense Claim Type (expense_type) and company,
    return the correct GL account from its Accounts child table.
    """
    if not company or not expense_type:
        return None

    # Load Expense Claim Type doc
    ect = frappe.get_doc("Expense Claim Type", expense_type)

    # Child table is typically 'accounts'
    # with fields: company, default_account (or account)
    for acc in ect.accounts:
        if acc.company == company:
            # Adjust the field name according to your setup
            return (
                getattr(acc, "default_account", None) or
                getattr(acc, "account", None)
            )

    # No matching row for that company
    return None

