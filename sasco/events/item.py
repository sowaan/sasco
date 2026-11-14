def set_default_uom_first(doc, method=None):
    """Keep the default UOM first, after ERPNext validates the conversions."""
    if not doc.stock_uom:
        return

    rows = doc.get("uoms") or []
    for index, row in enumerate(rows):
        if row.uom == doc.stock_uom:
            if index:
                rows.insert(0, rows.pop(index))
            break

    for index, row in enumerate(rows, start=1):
        row.idx = index
