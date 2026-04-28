frappe.query_reports["QS Review"] = {
    filters: [
        {
            fieldname: "sales_order",
            label: __("Sales Order"),
            fieldtype: "Link",
            options: "Sales Order",
            reqd: 1,
        },
    ],

    formatter(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);

        // Highlight negative balances in red
        if (
            data &&
            ["sod_balance_qty", "sod_balance_qty_sqm", "sod_balance_qty_kg", "sod_balance_amount"].includes(
                column.fieldname
            ) &&
            data[column.fieldname] < 0
        ) {
            value = `<span style="color:red;font-weight:bold">${value}</span>`;
        }

        return value;
    },
};
