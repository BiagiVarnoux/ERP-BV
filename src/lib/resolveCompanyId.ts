import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_COMPANY_ID } from './constants';

/** Resolves the active company_id for the authenticated user from the database.
 *  For use in non-React service functions that can't access React context.
 *  Falls back to DEFAULT_COMPANY_ID if no membership is found. */
export async function resolveUserCompanyId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return DEFAULT_COMPANY_ID;
  const { data } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  return data?.company_id ?? DEFAULT_COMPANY_ID;
}
