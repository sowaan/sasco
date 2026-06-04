



je_list = frappe.get_list("Journal Entry",
                filters={
                    'custom_manufacture_order' : doc.name ,
                    'docstatus' : 1 ,
          })



if je_list :
    
    for je in je_list :
        je_doc = frappe.get_doc("Journal Entry", je.name)
        je_doc.cancel()
    
    
