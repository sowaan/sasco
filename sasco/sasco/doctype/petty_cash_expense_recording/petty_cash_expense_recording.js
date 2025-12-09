frappe.ui.form.on('Petty Cash Expense Recording', {
    onload(frm) {
        if (!frm.doc.company) {
            frappe.db.get_single_value("Global Defaults", "default_company")
                .then(company => {
                    if (company) frm.set_value("company", company);
                });
        }
        // Set queries on load
        set_child_table_queries(frm);
        set_payment_account_query(frm);
        set_tax_account_query(frm);
    },

    refresh(frm) {
        // Also re-apply on refresh (in case of changes / permissions etc.)

        set_child_table_queries(frm);
        set_payment_account_query(frm);
        set_tax_account_query(frm);
        if (!frm.is_new() && frm.doc.docstatus === 1) {

            // Show Make Journal Entry button only if not already created
            if (!frm.doc.journal_entry) {
                frm.add_custom_button(
                    __('Make Journal Entry'),
                    function () {
                        frappe.call({
                            method: "sasco.sasco.doctype.petty_cash_expense_recording.petty_cash_expense_recording.make_journal_entry",
                            args: {
                                docname: frm.doc.name
                            },
                            freeze: true,
                            freeze_message: __("Creating Journal Entry..."),
                            callback: function (r) {
                                if (r.message) {
                                    frappe.msgprint(
                                        __("Journal Entry {0} created", [r.message])
                                    );
                                    frm.reload_doc();
                                }
                            }
                        });
                    }
                ).addClass("btn-primary");
            } else {
                // If JE already exists, add a button to open it
                frm.add_custom_button(
                    __('View Journal Entry'),
                    function () {
                        frappe.set_route("Form", "Journal Entry", frm.doc.journal_entry);
                    }
                );
            }
        }        
    },

    company(frm) {
        // Whenever company changes, re-apply filters
        set_payment_account_query(frm);
        set_child_table_queries(frm);
        set_tax_account_query(frm);
    },

});

function set_payment_account_query(frm) {

    frm.set_query("payment_account", function() {
        let filters = {
            is_group: 0
        };

        if (frm.doc.company) {
            filters["company"] = frm.doc.company;
        }

        return {
            filters: [
                ["Account", "company", "=", frm.doc.company || frappe.defaults.get_default("company")],
                ["Account", "is_group", "=", 0],
                ["Account", "account_type", "in", ["Cash", "Bank"]]
            ]
        };
    });
}

function set_tax_account_query(frm) {
    frm.set_query("tax_account", function() {
        // Only leaf tax accounts for selected company
        return {
            filters: [
                ["Account", "company", "=", frm.doc.company || frappe.defaults.get_default("company")],
                ["Account", "is_group", "=", 0],
                ["Account", "account_type", "=", "Tax"]
            ]
        };
    });
}
function set_child_table_queries(frm) {
    // ---- expense_type (child) ----
    frm.fields_dict["detail_table"].grid.get_field("expense_type").get_query = function(doc, cdt, cdn) {
        if (!doc.company) {
            return {};
        }
        // Assuming Expense Claim Type has a 'company' field
        return {
            filters: {
                "company": doc.company
            }
        };
    };

    // ---- gl_account (child) ----
    frm.fields_dict["detail_table"].grid.get_field("gl_account").get_query = function(doc, cdt, cdn) {
        if (!doc.company) {
            return {};
        }
        return {
            filters: {
                "company": doc.company,
                "is_group": 0   // usually you want only ledger accounts
            }
        };
    };

    // ---- party (child) ----
    frm.fields_dict["detail_table"].grid.get_field("party").get_query = function(doc, cdt, cdn) {
        const row = locals[cdt][cdn];
        let filters = {};

        if (!doc.company || !row.party_type) {
            return { filters: filters };
        }

        // Adjust these based on your Party Types
        if (row.party_type === "Supplier") {
            // Supplier has custom_company
            filters["custom_company"] = doc.company;
        } else if (row.party_type === "Employee") {
            // Employee has company
            filters["company"] = doc.company;
        } else if (row.party_type === "Customer") {
            // If you also care about customers and they have company
            filters["company"] = doc.company;
        }

        return {
            filters: filters
        };
    };
}

// Child doctype: Petty Expenses
frappe.ui.form.on('Petty Expenses', {
    expense_type(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (!frm.doc.company || !row.expense_type) {
            // Clear gl_account if missing data
            frappe.model.set_value(cdt, cdn, "gl_account", null);
            return;
        }

        frappe.call({
            method: "sasco.sasco.doctype.petty_cash_expense_recording.petty_cash_expense_recording.get_expense_account",
            args: {
                company: frm.doc.company,
                expense_type: row.expense_type
            },
            freeze: false,
            callback: function(r) {
                if (r.message) {
                    frappe.model.set_value(cdt, cdn, "gl_account", r.message);
                } else {
                    frappe.model.set_value(cdt, cdn, "gl_account", null);
                    frappe.msgprint(__("No expense account found for {0} in company {1}", [row.expense_type, frm.doc.company]));
                }
            }
        });
    },
    amount(frm, cdt, cdn) {
        amount_val = locals[cdt][cdn].amount || 0;
        frappe.model.set_value(cdt, cdn, "sanctioned_amount", amount_val);
    }
});
