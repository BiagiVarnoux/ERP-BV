import { supabase } from '@/integrations/supabase/client';
import { resolveUserCompanyId } from '@/lib/resolveCompanyId';
import type { CustomerRow, CreateCustomerInput } from '@/domain/sales/types';

export type { CustomerRow, CreateCustomerInput } from '@/domain/sales/types';
export type { CustomerTipo } from '@/domain/sales/types';

export async function listCustomers(): Promise<CustomerRow[]> {
  const companyId = await resolveUserCompanyId();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('company_id', companyId)
    .eq('activo', true)
    .order('razon_social');
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerRow[];
}

export async function createCustomer(
  input: CreateCustomerInput
): Promise<CustomerRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const companyId = await resolveUserCompanyId();
  const { data, error } = await supabase
    .from('customers')
    .insert({
      ...input,
      company_id: companyId,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as CustomerRow;
}

export async function updateCustomer(
  id: string,
  input: Partial<CreateCustomerInput>
): Promise<CustomerRow> {
  const { data, error } = await supabase
    .from('customers')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CustomerRow;
}
