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

        if (
            data &&
            ["balance_qty", "balance_amount"].includes(column.fieldname) &&
            data[column.fieldname] < 0
        ) {
            value = `<span style="color:red;font-weight:bold">${value}</span>`;
        }

        return value;
    },
};
