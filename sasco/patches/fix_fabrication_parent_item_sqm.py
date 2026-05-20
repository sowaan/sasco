import frappe
from frappe.utils import flt


def execute():
    """
    Backfill spl_area_sqm and total_kg in tabFabrication Parent Item for all
    Sales Orders where these fields are 0.  The correct values are aggregated
    from the Fabrication Item Summary rows of every submitted Fabrication List
    linked to the Sales Order (via direct sales_order field or via Estimation
    Request chain).
    """

    so_names = frappe.db.sql_list(
        """
        SELECT DISTINCT parent
        FROM `tabFabrication Parent Item`
        WHERE parenttype = 'Sales Order'
        """
    )

    if not so_names:
        return

    for so_name in so_names:
        # Direct link: Fabrication List.sales_order = SO
        direct_fls = frappe.get_all(
            "Fabrication List",
            filters={"sales_order": so_name, "docstatus": 1},
            pluck="name",
        )

        # Indirect link: SO → Estimation Request → Fabrication List
        er_fls = _get_fls_via_estimation_request(so_name)

        all_fls = list(set(direct_fls + er_fls))
        if not all_fls:
            continue

        ph = ", ".join(["%s"] * len(all_fls))
        rows = frappe.db.sql(
            f"""
            SELECT item_code,
                   SUM(spl_area_sqm)  AS total_sqm,
                   SUM(spl_weight_kg) AS total_kg
            FROM `tabFabrication Item Summary`
            WHERE parent IN ({ph})
              AND parenttype = 'Fabrication List'
            GROUP BY item_code
            """,
            all_fls,
            as_dict=True,
        )

        if not rows:
            continue

        for r in rows:
            frappe.db.sql(
                """
                UPDATE `tabFabrication Parent Item`
                SET    spl_area_sqm = %s,
                       total_kg     = %s,
                       modified     = NOW()
                WHERE  parent      = %s
                  AND  parent_item = %s
                """,
                (flt(r.total_sqm), flt(r.total_kg), so_name, r.item_code),
            )

    frappe.db.commit()


def _get_fls_via_estimation_request(so_name):
    est_reqs = frappe.get_all(
        "Estimation Request",
        filters={
            "sales_order_number": so_name,
            "workflow_state": ["in", ["Started", "Closed"]],
        },
        pluck="name",
    )
    if not est_reqs:
        return []

    return frappe.get_all(
        "Fabrication List",
        filters={"estimation_request": ["in", est_reqs], "docstatus": 1},
        pluck="name",
    )
