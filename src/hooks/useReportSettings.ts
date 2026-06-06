// src/hooks/useReportSettings.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

export interface ReportSettings {
  id: string;
  cost_of_sales_keywords: string[];
  operating_expense_keywords: string[];
  other_expense_keywords: string[];
}

const defaultSettings: Omit<ReportSettings, 'id'> = {
  cost_of_sales_keywords: ['costo de venta', 'costo de mercancia', 'costo de mercadería', 'costo mercaderia', 'costo producto'],
  operating_expense_keywords: ['gasto', 'administrativo', 'venta', 'flete', 'operativo', 'general'],
  other_expense_keywords: ['it', 'interes', 'interés', 'comision', 'comisión', 'bancario', 'financiero'],
};

export function useReportSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const activeCompanyId = useActiveCompanyId();
  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('report_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          id: data.id,
          cost_of_sales_keywords: data.cost_of_sales_keywords || defaultSettings.cost_of_sales_keywords,
          operating_expense_keywords: data.operating_expense_keywords || defaultSettings.operating_expense_keywords,
          other_expense_keywords: data.other_expense_keywords || defaultSettings.other_expense_keywords,
        });
      } else {
        // Create default settings
        const { data: newData, error: insertError } = await supabase
          .from('report_settings')
          .insert({
            user_id: user.id,
            company_id: activeCompanyId,
            ...defaultSettings,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        if (newData) {
          setSettings({
            id: newData.id,
            cost_of_sales_keywords: newData.cost_of_sales_keywords || defaultSettings.cost_of_sales_keywords,
            operating_expense_keywords: newData.operating_expense_keywords || defaultSettings.operating_expense_keywords,
            other_expense_keywords: newData.other_expense_keywords || defaultSettings.other_expense_keywords,
          });
        }
      }
    } catch (error: any) {
      console.error('Error fetching report settings:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (updates: Partial<Omit<ReportSettings, 'id'>>) => {
    if (!user || !settings) return false;

    try {
      const { error } = await supabase
        .from('report_settings')
        .update(updates)
        .eq('user_id', user.id);

      if (error) throw error;

      setSettings(prev => prev ? { ...prev, ...updates } : null);
      
      toast({
        title: 'Configuración guardada',
        description: 'Los ajustes de reportes han sido actualizados.',
      });
      
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  }, [user, settings, toast]);

  return {
    settings: settings || { ...defaultSettings, id: '' },
    loading,
    updateSettings,
    refetch: fetchSettings,
  };
}
