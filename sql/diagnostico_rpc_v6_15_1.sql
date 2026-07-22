select
  required.signature as funcion_requerida,
  to_regprocedure(required.signature) is not null as instalada
from (
  values
    ('public.staff_list_service_accounts_v32()'),
    ('public.reseller_list_branch_accounts_v32()'),
    ('public.staff_list_user_branch_accounts_v32(uuid)'),
    ('public.reseller_list_user_branch_accounts_v32(uuid)'),
    ('public.reassign_account_hierarchical_v32(uuid,uuid,date)'),
    ('public.admin_edit_service_account_v32(uuid,text,text,text,uuid,date)'),
    ('public.bulk_assign_service_accounts_v32(text,text[],uuid,date)'),
    ('public.staff_list_tickets_v33()'),
    ('public.staff_list_ticket_messages_v33(uuid)'),
    ('public.create_support_ticket_v2(text,text,text,text,text)'),
    ('public.reseller_add_ticket_message_v33(uuid,text)'),
    ('public.staff_send_ticket_response_v17(uuid,text,text)'),
    ('public.reseller_list_change_history_v33()'),
    ('public.reseller_dashboard_metrics_v33()'),
    ('public.reassign_account_hierarchical_v33(uuid,uuid,date)'),
    ('public.admin_edit_service_account_v33(uuid,text,text,text,uuid,date)'),
    ('public.bulk_assign_service_accounts_v33(text,text[],uuid,date)')
) as required(signature)
order by required.signature;
