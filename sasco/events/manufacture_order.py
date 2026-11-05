"""Standard cost Journal Entries for Manufacture Order.

Manufacture Order is a custom DocType, so Frappe ignores override_doctype_class
for it and these have to be doc_events rather than controller methods.

Each posting is the difference between the MO's current cost totals and what its
submitted Journal Entries have already posted. That makes posting safe to repeat,
and lets costs added after submit (job cards) go out as a second Journal Entry.
"""

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt, get_link_to_form, getdate, today

COST_TYPE_FIELDS = {
	"Material Cost": "total_raw_material_cost",
	"Accessory Cost": "total_accessory_item_amount_",
	"Consumable Cost": "total_consumable_cost_1",
	"Delivery Cost": "total_delivery_cost1",
	"Additional OH Cost": "total_over_head_cost",
	"Fabrication Cost": "total_operation_cost_",
}

# The workflow's Reject action also submits the MO, but no cost should be posted for it.
REJECTED_STATE = "Rejected by Production Manager"


def on_submit(doc, method=None):
	# Runs in the submit transaction: if the Journal Entry fails, the MO stays unapproved.
	# MOs are submitted by the workflow on the server, so client before_submit never runs.
	post_cost_journal_entry(doc)


def before_cancel(doc, method=None):
	# GL Entry rows carry the manufacture_order accounting dimension and stay docstatus 1
	# even once cancelled, so they'd block the MO forever. A live Journal Entry still blocks.
	doc.ignore_linked_doctypes = ("GL Entry",)


def on_update_after_submit(doc, method=None):
	# Post when job operations become completed, not on every later save of a completed MO.
	before = doc.get_doc_before_save()
	if not doc.job_operations_completed or (before and before.job_operations_completed):
		return

	# The server script on Journal Entry cancel clears jv_created. Treat that as a
	# deliberate reversal by accounts and don't silently post the costs again.
	if not doc.jv_created and frappe.db.exists(
		"Journal Entry", {"custom_manufacture_order": doc.name, "docstatus": 2}
	):
		return

	post_cost_journal_entry(doc)


def post_cost_journal_entry(doc, posting_date=None):
	"""Post unposted MO costs. Returns the Journal Entry, or None if nothing is due."""
	if doc.workflow_state == REJECTED_STATE:
		return None

	accounts = get_journal_entry_accounts(doc)
	if not accounts:
		return None

	je = frappe.get_doc(
		{
			"doctype": "Journal Entry",
			"voucher_type": "Journal Entry",
			"company": doc.company,
			"posting_date": posting_date or today(),
			"custom_manufacture_order": doc.name,
			"user_remark": _("Standard cost posting for Manufacture Order {0}").format(doc.name),
			"accounts": accounts,
		}
	)
	je.flags.ignore_permissions = True  # submitting an MO shouldn't require an accounts role
	je.insert()
	je.submit()

	doc.db_set("jv_created", 1, update_modified=False)
	frappe.msgprint(
		_("Journal Entry {0} created").format(get_link_to_form("Journal Entry", je.name)), alert=True
	)
	return je


def get_journal_entry_accounts(doc):
	"""Build balanced rows for the unposted costs: expense accounts against the parking account."""
	precision = frappe.get_precision("Journal Entry Account", "credit_in_account_currency") or 2
	expense_accounts, parking_account = get_cost_accounts(doc)

	# Round per account first: the parking row is the sum of these rounded amounts. Using
	# grand_total instead leaves the entry a cent out, which ERPNext rejects as unbalanced.
	targets = defaultdict(float)
	for cost_type, fieldname in COST_TYPE_FIELDS.items():
		amount = flt(doc.get(fieldname), precision)
		if not amount:
			continue
		if not expense_accounts.get(cost_type):
			frappe.throw(
				_("Define the {0} account for {1} in Manufacturing Order Settings.").format(
					cost_type, doc.company
				)
			)
		targets[expense_accounts[cost_type]] += amount

	posted = get_posted_amounts(doc.name)
	rows, net_credit = [], 0
	for account, target in targets.items():
		difference = flt(target - posted.get(account, 0), precision)
		if difference:
			rows.append(make_row(doc.name, account, difference))
			net_credit += difference

	net_credit = flt(net_credit, precision)
	if net_credit:
		rows.append(make_row(doc.name, parking_account, -net_credit))

	return rows


def get_cost_accounts(doc):
	settings = frappe.get_doc("Manufacturing Order Settings")

	expense_accounts = {}
	for row in (settings.table_icuu or []) + (settings.table_juan or []):
		if row.company == doc.company:
			expense_accounts[row.cost_type] = row.expense_gl_account

	parking_account = None
	if settings.sasco_company == doc.company:
		parking_account = settings.standard_cost_parking_gl_account
	elif settings.mabani_company == doc.company:
		parking_account = settings.standard_cost_parking_gl_accounts

	if not parking_account:
		frappe.throw(
			_("Define the Standard Cost Parking GL Account for {0} in Manufacturing Order Settings.").format(
				doc.company
			)
		)

	return expense_accounts, parking_account


def get_posted_amounts(manufacture_order):
	"""Net credit already posted per account by this MO's submitted Journal Entries."""
	rows = frappe.db.sql(
		"""
		select jea.account, sum(jea.credit_in_account_currency - jea.debit_in_account_currency) as amount
		from `tabJournal Entry Account` jea
		inner join `tabJournal Entry` je on je.name = jea.parent
		where je.custom_manufacture_order = %s and je.docstatus = 1
		group by jea.account
		""",
		manufacture_order,
		as_dict=True,
	)
	return {row.account: flt(row.amount) for row in rows}


def make_row(manufacture_order, account, net_credit):
	return {
		"account": account,
		"credit_in_account_currency": max(net_credit, 0),
		"debit_in_account_currency": max(-net_credit, 0),
		"manufacture_order": manufacture_order,
	}


def backfill_cost_journal_entries(dry_run=1):
	"""One-off: post costs for submitted MOs that never got a Journal Entry, dated when submitted.

	bench --site <site> execute sasco.events.manufacture_order.backfill_cost_journal_entries
	Pass --kwargs "{'dry_run': 0}" to post. Any failure stops the run and posts nothing.
	"""
	dry_run = int(dry_run)
	results = []

	for name in frappe.get_all(
		"Manufacture Order",
		filters={"docstatus": 1, "workflow_state": ["!=", REJECTED_STATE]},
		pluck="name",
		order_by="creation",
	):
		if frappe.db.exists("Journal Entry", {"custom_manufacture_order": name, "docstatus": ["!=", 0]}):
			continue  # already posted, or reversed on purpose

		doc = frappe.get_doc("Manufacture Order", name)
		posting_date = get_submit_date(name)
		rows = get_journal_entry_accounts(doc)
		je = None if dry_run else post_cost_journal_entry(doc, posting_date=posting_date)

		results.append(
			{
				"manufacture_order": name,
				"posting_date": str(posting_date),
				"credit": sum(row["credit_in_account_currency"] for row in rows),
				"debit": sum(row["debit_in_account_currency"] for row in rows),
				"journal_entry": je.name if je else None,
			}
		)

	return results


def get_submit_date(manufacture_order):
	versions = frappe.db.sql(
		"""
		select creation from `tabVersion`
		where ref_doctype = 'Manufacture Order' and docname = %s and data like %s
		order by creation limit 1
		""",
		(manufacture_order, '%"docstatus",0,1%'),
	)
	return getdate(versions[0][0]) if versions else getdate(today())
