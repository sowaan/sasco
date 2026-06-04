############################################# JOB CARD #############################################
total_time_spent = 0
total_opr_cost = 0

if doc.job_card :
    
    for row in doc.job_card :
        
        if row.start == 1 and row.end == 1 :
            row.operation_cost = (row.qty_in_pcs or 0) * (row.per_hour_rate or 0)
            total_time_spent = total_time_spent + (row.time_spent or 0)
            total_opr_cost = total_opr_cost + (row.operation_cost or 0)
            
            
doc.total_time_spent = total_time_spent
doc.total_operation_cost = total_opr_cost
doc.total_operation_cost_ = total_opr_cost
############################################# JOB CARD #############################################









########################################## CONSUMABLE COST ##########################################
total_consumable_qty = 0
total_consumable_cost = 0

if doc.consumable_cost :
    
    for row in doc.consumable_cost :
        
        row.amount = (row.quantity or 0) * (row.rate or 0)
        total_consumable_qty = total_consumable_qty + (row.quantity or 0)
        total_consumable_cost = total_consumable_cost + (row.amount or 0)
        
doc.total_consumable_quantity = total_consumable_qty
doc.total_consumable_cost = total_consumable_cost
doc.total_consumable_cost_1 = total_consumable_cost
########################################## CONSUMABLE COST ##########################################





########################################## DELIVERY COST ##########################################
total_delivery_qty = 0
total_delivery_cost = 0

if doc.delivery_cost :
    
    for row in doc.delivery_cost :
        
        row.amount = (row.quantity or 0) * (row.rate or 0)
        total_delivery_qty = total_delivery_qty + (row.quantity or 0)
        total_delivery_cost = total_delivery_cost + (row.amount or 0)
        
doc.total_delivery_quantity = total_delivery_qty
doc.total_delivery_cost = total_delivery_cost
doc.total_delivery_cost1 = total_delivery_cost
########################################## DELIVERY COST ##########################################







doc.grand_total = (doc.total_raw_material_cost or 0) + (doc.total_accessory_item_amount_ or 0) + (doc.total_operation_cost_ or 0) + (doc.total_consumable_cost or 0) + (doc.total_delivery_cost or 0)       


doc.total_over_head_cost_ = (doc.grand_total or 0) * ((doc.additional_over_head_cost_percentage or 0)/100)

doc.total_over_head_cost = doc.total_over_head_cost_

doc.grand_total = doc.grand_total + doc.total_over_head_cost









############################################# DUCT ITEM PROPORTIONAL COST #############################################
doc.duct_item = []

if doc.duct_and_acc_item :
    t_duct_itm_qty = 0
    for row in doc.duct_and_acc_item :
        t_duct_itm_qty = t_duct_itm_qty + row.qty
        
    for row in doc.duct_and_acc_item :   
        cost = 0
        if t_duct_itm_qty > 0 :
            cost = doc.grand_total * (row.qty / t_duct_itm_qty)
        
        doc.append('duct_item',{
            'item_code' : row.item_code ,
            'item_name' : row.item_name ,
            'uom' : row.uom ,
            'qty' : row.qty ,
            'cost' : cost ,
        })
        
############################################# DUCT ITEM PROPORTIONAL COST #############################################        
        
        
        
        
        
        
