export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          afecta_ebitda: boolean | null
          clasificacion_flujo: string | null
          clasificacion_resultado: string | null
          company_id: string
          created_at: string
          es_capital_trabajo: boolean | null
          es_extraordinaria: boolean | null
          es_financiera: boolean | null
          es_partida_no_monetaria: boolean | null
          expense_category: string | null
          id: string
          is_active: boolean
          is_cash_equivalent: boolean | null
          is_current: boolean | null
          modulo_vinculado: string | null
          name: string
          normal_side: string
          subclasificacion_resultado: string | null
          type: string
          user_id: string
        }
        Insert: {
          afecta_ebitda?: boolean | null
          clasificacion_flujo?: string | null
          clasificacion_resultado?: string | null
          company_id: string
          created_at?: string
          es_capital_trabajo?: boolean | null
          es_extraordinaria?: boolean | null
          es_financiera?: boolean | null
          es_partida_no_monetaria?: boolean | null
          expense_category?: string | null
          id: string
          is_active?: boolean
          is_cash_equivalent?: boolean | null
          is_current?: boolean | null
          modulo_vinculado?: string | null
          name: string
          normal_side: string
          subclasificacion_resultado?: string | null
          type: string
          user_id: string
        }
        Update: {
          afecta_ebitda?: boolean | null
          clasificacion_flujo?: string | null
          clasificacion_resultado?: string | null
          company_id?: string
          created_at?: string
          es_capital_trabajo?: boolean | null
          es_extraordinaria?: boolean | null
          es_financiera?: boolean | null
          es_partida_no_monetaria?: boolean | null
          expense_category?: string | null
          id?: string
          is_active?: boolean
          is_cash_equivalent?: boolean | null
          is_current?: boolean | null
          modulo_vinculado?: string | null
          name?: string
          normal_side?: string
          subclasificacion_resultado?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changed_fields: string[] | null
          company_id: string
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string
          table_name: string
          user_id: string
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          company_id: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          table_name: string
          user_id: string
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          company_id?: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      auxiliary_ledger: {
        Row: {
          account_id: string
          client_name: string
          closed_date: string | null
          company_id: string
          created_at: string
          definition_id: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          client_name: string
          closed_date?: string | null
          company_id: string
          created_at?: string
          definition_id?: string | null
          id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          client_name?: string
          closed_date?: string | null
          company_id?: string
          created_at?: string
          definition_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auxiliary_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auxiliary_ledger_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "auxiliary_ledger_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      auxiliary_ledger_definitions: {
        Row: {
          account_id: string
          company_id: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          account_id: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          account_id?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auxiliary_ledger_definitions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      auxiliary_movement_details: {
        Row: {
          amount: number
          aux_entry_id: string
          company_id: string
          created_at: string
          id: string
          journal_entry_id: string
          movement_date: string
          movement_type: string
          user_id: string
        }
        Insert: {
          amount: number
          aux_entry_id: string
          company_id?: string
          created_at?: string
          id?: string
          journal_entry_id: string
          movement_date: string
          movement_type: string
          user_id: string
        }
        Update: {
          amount?: number
          aux_entry_id?: string
          company_id?: string
          created_at?: string
          id?: string
          journal_entry_id?: string
          movement_date?: string
          movement_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auxiliary_movement_details_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_aux_entry"
            columns: ["aux_entry_id"]
            isOneToOne: false
            referencedRelation: "auxiliary_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_schedules: {
        Row: {
          company_id: string
          enabled: boolean
          interval_hours: number
          last_run_at: string | null
          retention_count: number
          updated_at: string
        }
        Insert: {
          company_id: string
          enabled?: boolean
          interval_hours?: number
          last_run_at?: string | null
          retention_count?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          enabled?: boolean
          interval_hours?: number
          last_run_at?: string | null
          retention_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          country: string
          created_at: string
          currency: string
          holding_id: string | null
          id: string
          is_holding: boolean
          logo_url: string | null
          name: string
          plan_cuentas_base: boolean
          slug: string
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          currency?: string
          holding_id?: string | null
          id?: string
          is_holding?: boolean
          logo_url?: string | null
          name: string
          plan_cuentas_base?: boolean
          slug: string
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          currency?: string
          holding_id?: string | null
          id?: string
          is_holding?: boolean
          logo_url?: string | null
          name?: string
          plan_cuentas_base?: boolean
          slug?: string
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_backups: {
        Row: {
          company_id: string
          counts: Json | null
          created_at: string
          id: string
          kind: string
          payload: Json
          size_bytes: number | null
          version: string
        }
        Insert: {
          company_id: string
          counts?: Json | null
          created_at?: string
          id?: string
          kind?: string
          payload: Json
          size_bytes?: number | null
          version?: string
        }
        Update: {
          company_id?: string
          counts?: Json | null
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          size_bytes?: number | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_backups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          invited_by: string | null
          role: string
          role_typed: Database["public"]["Enums"]["company_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          invited_by?: string | null
          role: string
          role_typed?: Database["public"]["Enums"]["company_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          role_typed?: Database["public"]["Enums"]["company_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_module_config: {
        Row: {
          company_id: string
          config_value: string | null
          id: string
          industry_type: string | null
          is_visible: boolean
          submodule: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          config_value?: string | null
          id?: string
          industry_type?: string | null
          is_visible?: boolean
          submodule: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          config_value?: string | null
          id?: string
          industry_type?: string | null
          is_visible?: boolean
          submodule?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_module_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_sale_account_config: {
        Row: {
          account_codigo: string
          company_id: string
          created_at: string
          enabled: boolean
          id: string
          is_custom: boolean
          label: string | null
          tipo_pago: string
          updated_at: string
        }
        Insert: {
          account_codigo: string
          company_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_custom?: boolean
          label?: string | null
          tipo_pago: string
          updated_at?: string
        }
        Update: {
          account_codigo?: string
          company_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_custom?: boolean
          label?: string | null
          tipo_pago?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_sale_account_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_sheet_cells: {
        Row: {
          cell_type: string
          col_index: number
          company_id: string
          created_at: string
          formula: string | null
          id: string
          row_index: number
          sheet_id: string
          style: Json | null
          user_id: string
          value: string | null
        }
        Insert: {
          cell_type?: string
          col_index: number
          company_id: string
          created_at?: string
          formula?: string | null
          id?: string
          row_index: number
          sheet_id: string
          style?: Json | null
          user_id: string
          value?: string | null
        }
        Update: {
          cell_type?: string
          col_index?: number
          company_id?: string
          created_at?: string
          formula?: string | null
          id?: string
          row_index?: number
          sheet_id?: string
          style?: Json | null
          user_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_sheet_cells_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_sheet_cells_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "cost_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_sheets: {
        Row: {
          company_id: string
          created_at: string
          fecha: string
          id: string
          metadata: Json | null
          nombre: string
          referencia_importacion: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          fecha?: string
          id?: string
          metadata?: Json | null
          nombre: string
          referencia_importacion?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          fecha?: string
          id?: string
          metadata?: Json | null
          nombre?: string
          referencia_importacion?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_sheets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          activo: boolean
          ciudad: string | null
          codigo: string | null
          company_id: string
          created_at: string
          credito_autorizado: number
          dias_credito: number
          email: string | null
          id: string
          nit: string | null
          nombre_corto: string | null
          notas: string | null
          razon_social: string
          telefono: string | null
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activo?: boolean
          ciudad?: string | null
          codigo?: string | null
          company_id: string
          created_at?: string
          credito_autorizado?: number
          dias_credito?: number
          email?: string | null
          id?: string
          nit?: string | null
          nombre_corto?: string | null
          notas?: string | null
          razon_social: string
          telefono?: string | null
          tipo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activo?: boolean
          ciudad?: string | null
          codigo?: string | null
          company_id?: string
          created_at?: string
          credito_autorizado?: number
          dias_credito?: number
          email?: string | null
          id?: string
          nit?: string | null
          nombre_corto?: string | null
          notas?: string | null
          razon_social?: string
          telefono?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      debt_payments: {
        Row: {
          company_id: string
          created_at: string
          fecha: string
          id: string
          journal_entry_id: string | null
          monto: number
          notas: string | null
          payable_id: string | null
          receivable_id: string | null
          tipo_pago: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          fecha: string
          id?: string
          journal_entry_id?: string | null
          monto: number
          notas?: string | null
          payable_id?: string | null
          receivable_id?: string | null
          tipo_pago: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          fecha?: string
          id?: string
          journal_entry_id?: string | null
          monto?: number
          notas?: string | null
          payable_id?: string | null
          receivable_id?: string | null
          tipo_pago?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "payables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "receivables"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_years: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          end_date: string
          id: string
          net_result_snapshot: number | null
          notes: string | null
          start_date: string
          status: string
          updated_at: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          created_at?: string
          end_date: string
          id?: string
          net_result_snapshot?: number | null
          notes?: string | null
          start_date: string
          status?: string
          updated_at?: string
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          created_at?: string
          end_date?: string
          id?: string
          net_result_snapshot?: number | null
          notes?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_years_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_lots: {
        Row: {
          cantidad: number
          company_id: string
          costo_total: number
          costo_unitario: number
          created_at: string
          fecha_ingreso: string
          id: string
          numero_lote: string | null
          product_id: string
          sheet_id: string | null
          user_id: string
        }
        Insert: {
          cantidad?: number
          company_id: string
          costo_total?: number
          costo_unitario?: number
          created_at?: string
          fecha_ingreso?: string
          id?: string
          numero_lote?: string | null
          product_id: string
          sheet_id?: string | null
          user_id: string
        }
        Update: {
          cantidad?: number
          company_id?: string
          costo_total?: number
          costo_unitario?: number
          created_at?: string
          fecha_ingreso?: string
          id?: string
          numero_lote?: string | null
          product_id?: string
          sheet_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_lots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_lots_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "cost_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          cantidad_disponible: number
          cantidad_inicial: number
          company_id: string
          costo_unitario: number
          created_at: string
          fecha_ingreso: string
          id: string
          import_lot_id: string | null
          product_id: string
          shipment_id: string | null
          shipment_product_id: string | null
          user_id: string
        }
        Insert: {
          cantidad_disponible?: number
          cantidad_inicial?: number
          company_id: string
          costo_unitario?: number
          created_at?: string
          fecha_ingreso?: string
          id?: string
          import_lot_id?: string | null
          product_id: string
          shipment_id?: string | null
          shipment_product_id?: string | null
          user_id: string
        }
        Update: {
          cantidad_disponible?: number
          cantidad_inicial?: number
          company_id?: string
          costo_unitario?: number
          created_at?: string
          fecha_ingreso?: string
          id?: string
          import_lot_id?: string | null
          product_id?: string
          shipment_id?: string | null
          shipment_product_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_import_lot_id_fkey"
            columns: ["import_lot_id"]
            isOneToOne: false
            referencedRelation: "import_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          cantidad: number
          company_id: string
          costo_total: number
          costo_unitario: number
          created_at: string
          fecha: string
          id: string
          inventory_lot_id: string | null
          journal_entry_id: string | null
          metodo_valuacion: string
          product_id: string
          referencia: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          cantidad?: number
          company_id: string
          costo_total?: number
          costo_unitario?: number
          created_at?: string
          fecha?: string
          id?: string
          inventory_lot_id?: string | null
          journal_entry_id?: string | null
          metodo_valuacion?: string
          product_id: string
          referencia?: string | null
          tipo: string
          user_id: string
        }
        Update: {
          cantidad?: number
          company_id?: string
          costo_total?: number
          costo_unitario?: number
          created_at?: string
          fecha?: string
          id?: string
          inventory_lot_id?: string | null
          journal_entry_id?: string | null
          metodo_valuacion?: string
          product_id?: string
          referencia?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_inventory_lot_id_fkey"
            columns: ["inventory_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_analyses: {
        Row: {
          company_id: string
          costo_capital_anual: number
          created_at: string
          embarque_id: string | null
          estado: string
          flete_cif_pct: number | null
          fuc_pct: number
          id: string
          nombre: string
          notas: string | null
          plazo_importacion_meses: number
          tc_oficial: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          costo_capital_anual?: number
          created_at?: string
          embarque_id?: string | null
          estado?: string
          flete_cif_pct?: number | null
          fuc_pct?: number
          id?: string
          nombre?: string
          notas?: string | null
          plazo_importacion_meses?: number
          tc_oficial?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          costo_capital_anual?: number
          created_at?: string
          embarque_id?: string | null
          estado?: string
          flete_cif_pct?: number | null
          fuc_pct?: number
          id?: string
          nombre?: string
          notas?: string | null
          plazo_importacion_meses?: number
          tc_oficial?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investment_analyses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_analysis_items: {
        Row: {
          analysis_id: string
          cantidad: number
          cantidad_sin_factura: number
          costo_bateria: number
          created_at: string
          envio_local: number
          especificacion: string | null
          flete_cif_pct: number | null
          ga_manual: number | null
          ga_pct: number
          garantia: number
          hs_code: string | null
          id: string
          iva_aduana_manual: number | null
          link_producto: string | null
          m1: number | null
          m2: number | null
          m3: number | null
          mapped_shipment_product_ids: string[]
          meses_venta_override: number | null
          modalidad_venta: string
          nombre: string
          orden: number
          otros_costos: number
          pasaje: number
          peso_bruto: number | null
          precio_usd: number
          precio_venta: number
          precio_venta_sin_factura: number
          tarifa_envio: number
          tarifa_manipuleo: number
          tax_pct: number
          tc: number
          tc_envio: number | null
          tc_oficial: number | null
          tiene_bateria: boolean
          updated_at: string
          usa_ga_manual: boolean
          usa_iva_manual: boolean
          usa_peso_bruto: boolean
          velocidad_venta: number
        }
        Insert: {
          analysis_id: string
          cantidad?: number
          cantidad_sin_factura?: number
          costo_bateria?: number
          created_at?: string
          envio_local?: number
          especificacion?: string | null
          flete_cif_pct?: number | null
          ga_manual?: number | null
          ga_pct?: number
          garantia?: number
          hs_code?: string | null
          id?: string
          iva_aduana_manual?: number | null
          link_producto?: string | null
          m1?: number | null
          m2?: number | null
          m3?: number | null
          mapped_shipment_product_ids?: string[]
          meses_venta_override?: number | null
          modalidad_venta?: string
          nombre?: string
          orden?: number
          otros_costos?: number
          pasaje?: number
          peso_bruto?: number | null
          precio_usd?: number
          precio_venta?: number
          precio_venta_sin_factura?: number
          tarifa_envio?: number
          tarifa_manipuleo?: number
          tax_pct?: number
          tc?: number
          tc_envio?: number | null
          tc_oficial?: number | null
          tiene_bateria?: boolean
          updated_at?: string
          usa_ga_manual?: boolean
          usa_iva_manual?: boolean
          usa_peso_bruto?: boolean
          velocidad_venta?: number
        }
        Update: {
          analysis_id?: string
          cantidad?: number
          cantidad_sin_factura?: number
          costo_bateria?: number
          created_at?: string
          envio_local?: number
          especificacion?: string | null
          flete_cif_pct?: number | null
          ga_manual?: number | null
          ga_pct?: number
          garantia?: number
          hs_code?: string | null
          id?: string
          iva_aduana_manual?: number | null
          link_producto?: string | null
          m1?: number | null
          m2?: number | null
          m3?: number | null
          mapped_shipment_product_ids?: string[]
          meses_venta_override?: number | null
          modalidad_venta?: string
          nombre?: string
          orden?: number
          otros_costos?: number
          pasaje?: number
          peso_bruto?: number | null
          precio_usd?: number
          precio_venta?: number
          precio_venta_sin_factura?: number
          tarifa_envio?: number
          tarifa_manipuleo?: number
          tax_pct?: number
          tc?: number
          tc_envio?: number | null
          tc_oficial?: number | null
          tiene_bateria?: boolean
          updated_at?: string
          usa_ga_manual?: boolean
          usa_iva_manual?: boolean
          usa_peso_bruto?: boolean
          velocidad_venta?: number
        }
        Relationships: [
          {
            foreignKeyName: "investment_analysis_items_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "investment_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_codes: {
        Row: {
          can_view_accounts: boolean
          can_view_auxiliary: boolean
          can_view_journal: boolean
          can_view_ledger: boolean
          can_view_reports: boolean
          code: string
          company_id: string
          created_at: string
          expires_at: string
          id: string
          owner_id: string
          role_to_assign: Database["public"]["Enums"]["company_role"]
          used: boolean
          used_by: string | null
        }
        Insert: {
          can_view_accounts?: boolean
          can_view_auxiliary?: boolean
          can_view_journal?: boolean
          can_view_ledger?: boolean
          can_view_reports?: boolean
          code: string
          company_id?: string
          created_at?: string
          expires_at: string
          id?: string
          owner_id: string
          role_to_assign?: Database["public"]["Enums"]["company_role"]
          used?: boolean
          used_by?: string | null
        }
        Update: {
          can_view_accounts?: boolean
          can_view_auxiliary?: boolean
          can_view_journal?: boolean
          can_view_ledger?: boolean
          can_view_reports?: boolean
          code?: string
          company_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          owner_id?: string
          role_to_assign?: Database["public"]["Enums"]["company_role"]
          used?: boolean
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitation_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          company_id: string
          created_at: string
          date: string
          entry_time: string | null
          id: string
          memo: string | null
          user_id: string
          void_of: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          entry_time?: string | null
          id: string
          memo?: string | null
          user_id: string
          void_of?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          entry_time?: string | null
          id?: string
          memo?: string | null
          user_id?: string
          void_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_void_of_fkey"
            columns: ["void_of"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          credit: number
          debit: number
          entry_id: string
          id: number
          line_memo: string | null
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          entry_id: string
          id?: number
          line_memo?: string | null
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          entry_id?: string
          id?: number
          line_memo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      kardex_definitions: {
        Row: {
          account_id: string
          company_id: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          account_id: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          account_id?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kardex_definitions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      kardex_entries: {
        Row: {
          account_id: string
          company_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          account_id: string
          company_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          account_id?: string
          company_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kardex_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      kardex_movements: {
        Row: {
          company_id: string
          concepto: string
          costo_total: number
          costo_unitario: number
          created_at: string
          entrada: number
          fecha: string
          id: string
          journal_entry_id: string | null
          kardex_id: string
          saldo: number
          saldo_valorado: number
          salidas: number
          user_id: string
        }
        Insert: {
          company_id: string
          concepto: string
          costo_total?: number
          costo_unitario?: number
          created_at?: string
          entrada?: number
          fecha: string
          id?: string
          journal_entry_id?: string | null
          kardex_id: string
          saldo?: number
          saldo_valorado?: number
          salidas?: number
          user_id: string
        }
        Update: {
          company_id?: string
          concepto?: string
          costo_total?: number
          costo_unitario?: number
          created_at?: string
          entrada?: number
          fecha?: string
          id?: string
          journal_entry_id?: string | null
          kardex_id?: string
          saldo?: number
          saldo_valorado?: number
          salidas?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kardex_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kardex_movements_kardex_id_fkey"
            columns: ["kardex_id"]
            isOneToOne: false
            referencedRelation: "kardex_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacion_documentos: {
        Row: {
          categoria: string
          descripcion: string | null
          id: string
          licitacion_id: string
          nombre: string
          path: string
          size: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          categoria?: string
          descripcion?: string | null
          id?: string
          licitacion_id: string
          nombre: string
          path: string
          size?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          categoria?: string
          descripcion?: string | null
          id?: string
          licitacion_id?: string
          nombre?: string
          path?: string
          size?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licitacion_documentos_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: false
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacion_productos: {
        Row: {
          cantidad: number
          costo_bateria: number
          created_at: string
          envio_local: number
          especificacion: string | null
          flete_cif_pct: number | null
          fuente: string
          ga_manual: number | null
          ga_pct: number
          garantia: number
          hs_code: string | null
          id: string
          iva_aduana_manual: number | null
          licitacion_id: string
          link_producto: string | null
          m1: number | null
          m2: number | null
          m3: number | null
          nombre: string
          orden: number
          origen: string
          otros_costos: number
          pasaje: number
          peso_bruto: number | null
          precio_entidad: number | null
          precio_local: number | null
          precio_ofertado: number
          precio_usd: number
          tarifa_envio: number
          tarifa_manipuleo: number
          tax_pct: number
          tc: number
          tc_envio: number | null
          tc_oficial: number | null
          tiene_bateria: boolean
          tiene_factura: boolean
          updated_at: string
          usa_ga_manual: boolean
          usa_iva_manual: boolean
          usa_peso_bruto: boolean
        }
        Insert: {
          cantidad?: number
          costo_bateria?: number
          created_at?: string
          envio_local?: number
          especificacion?: string | null
          flete_cif_pct?: number | null
          fuente?: string
          ga_manual?: number | null
          ga_pct?: number
          garantia?: number
          hs_code?: string | null
          id?: string
          iva_aduana_manual?: number | null
          licitacion_id: string
          link_producto?: string | null
          m1?: number | null
          m2?: number | null
          m3?: number | null
          nombre?: string
          orden?: number
          origen?: string
          otros_costos?: number
          pasaje?: number
          peso_bruto?: number | null
          precio_entidad?: number | null
          precio_local?: number | null
          precio_ofertado?: number
          precio_usd?: number
          tarifa_envio?: number
          tarifa_manipuleo?: number
          tax_pct?: number
          tc?: number
          tc_envio?: number | null
          tc_oficial?: number | null
          tiene_bateria?: boolean
          tiene_factura?: boolean
          updated_at?: string
          usa_ga_manual?: boolean
          usa_iva_manual?: boolean
          usa_peso_bruto?: boolean
        }
        Update: {
          cantidad?: number
          costo_bateria?: number
          created_at?: string
          envio_local?: number
          especificacion?: string | null
          flete_cif_pct?: number | null
          fuente?: string
          ga_manual?: number | null
          ga_pct?: number
          garantia?: number
          hs_code?: string | null
          id?: string
          iva_aduana_manual?: number | null
          licitacion_id?: string
          link_producto?: string | null
          m1?: number | null
          m2?: number | null
          m3?: number | null
          nombre?: string
          orden?: number
          origen?: string
          otros_costos?: number
          pasaje?: number
          peso_bruto?: number | null
          precio_entidad?: number | null
          precio_local?: number | null
          precio_ofertado?: number
          precio_usd?: number
          tarifa_envio?: number
          tarifa_manipuleo?: number
          tax_pct?: number
          tc?: number
          tc_envio?: number | null
          tc_oficial?: number | null
          tiene_bateria?: boolean
          tiene_factura?: boolean
          updated_at?: string
          usa_ga_manual?: boolean
          usa_iva_manual?: boolean
          usa_peso_bruto?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "licitacion_productos_licitacion_id_fkey"
            columns: ["licitacion_id"]
            isOneToOne: false
            referencedRelation: "licitaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      licitaciones: {
        Row: {
          company_id: string
          created_at: string
          datos_ia: Json
          embarque_id: string | null
          entidad: string
          envio_licitacion: number
          estado: string
          fecha_adjudicacion_est: string | null
          fecha_cobro: string | null
          fecha_contrato: string | null
          fecha_entrega_real: string | null
          fecha_limite_entrega: string | null
          fecha_presentacion: string | null
          flete_cif_pct: number | null
          garantia_licitacion: number
          id: string
          nombre: string
          notas: string | null
          numero_sicoes: string
          otros_costos_licitacion: number
          pasaje_licitacion: number
          plazo_entrega_dias: number | null
          precio_referencial: number | null
          tc_oficial: number | null
          tipo_proceso: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          datos_ia?: Json
          embarque_id?: string | null
          entidad?: string
          envio_licitacion?: number
          estado?: string
          fecha_adjudicacion_est?: string | null
          fecha_cobro?: string | null
          fecha_contrato?: string | null
          fecha_entrega_real?: string | null
          fecha_limite_entrega?: string | null
          fecha_presentacion?: string | null
          flete_cif_pct?: number | null
          garantia_licitacion?: number
          id?: string
          nombre?: string
          notas?: string | null
          numero_sicoes?: string
          otros_costos_licitacion?: number
          pasaje_licitacion?: number
          plazo_entrega_dias?: number | null
          precio_referencial?: number | null
          tc_oficial?: number | null
          tipo_proceso?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          datos_ia?: Json
          embarque_id?: string | null
          entidad?: string
          envio_licitacion?: number
          estado?: string
          fecha_adjudicacion_est?: string | null
          fecha_cobro?: string | null
          fecha_contrato?: string | null
          fecha_entrega_real?: string | null
          fecha_limite_entrega?: string | null
          fecha_presentacion?: string | null
          flete_cif_pct?: number | null
          garantia_licitacion?: number
          id?: string
          nombre?: string
          notas?: string | null
          numero_sicoes?: string
          otros_costos_licitacion?: number
          pasaje_licitacion?: number
          plazo_entrega_dias?: number | null
          precio_referencial?: number | null
          tc_oficial?: number | null
          tipo_proceso?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "licitaciones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licitaciones_embarque_id_fkey"
            columns: ["embarque_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      member_permissions: {
        Row: {
          can_approve: boolean
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_export: boolean
          can_view: boolean
          company_member_id: string
          created_at: string
          id: string
          module: Database["public"]["Enums"]["erp_module"]
          updated_at: string
        }
        Insert: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_export?: boolean
          can_view?: boolean
          company_member_id: string
          created_at?: string
          id?: string
          module: Database["public"]["Enums"]["erp_module"]
          updated_at?: string
        }
        Update: {
          can_approve?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_export?: boolean
          can_view?: boolean
          company_member_id?: string
          created_at?: string
          id?: string
          module?: Database["public"]["Enums"]["erp_module"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_permissions_company_member_id_fkey"
            columns: ["company_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      payables: {
        Row: {
          company_id: string
          created_at: string
          cuenta_gasto_id: string | null
          cuenta_pasivo_id: string | null
          estado: string
          fecha_emision: string
          fecha_vencimiento: string | null
          id: string
          journal_entry_id: string | null
          moneda: string
          monto_original: number
          monto_pendiente: number
          notas: string | null
          numero_documento: string
          proveedor_nit: string | null
          proveedor_nombre: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          cuenta_gasto_id?: string | null
          cuenta_pasivo_id?: string | null
          estado?: string
          fecha_emision: string
          fecha_vencimiento?: string | null
          id?: string
          journal_entry_id?: string | null
          moneda?: string
          monto_original: number
          monto_pendiente: number
          notas?: string | null
          numero_documento: string
          proveedor_nit?: string | null
          proveedor_nombre: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          cuenta_gasto_id?: string | null
          cuenta_pasivo_id?: string | null
          estado?: string
          fecha_emision?: string
          fecha_vencimiento?: string | null
          id?: string
          journal_entry_id?: string | null
          moneda?: string
          monto_original?: number
          monto_pendiente?: number
          notas?: string | null
          numero_documento?: string
          proveedor_nit?: string | null
          proveedor_nombre?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payables_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          codigo: string
          company_id: string
          created_at: string | null
          id: string
          nombre: string
        }
        Insert: {
          codigo: string
          company_id: string
          created_at?: string | null
          id?: string
          nombre: string
        }
        Update: {
          codigo?: string
          company_id?: string
          created_at?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_fotos: {
        Row: {
          company_id: string
          id: string
          nombre: string
          path: string
          product_id: string
          sesion_id: string
          sesion_nombre: string | null
          size: number | null
          sort_order: number
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          company_id: string
          id?: string
          nombre: string
          path: string
          product_id: string
          sesion_id: string
          sesion_nombre?: string | null
          size?: number | null
          sort_order?: number
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          company_id?: string
          id?: string
          nombre?: string
          path?: string
          product_id?: string
          sesion_id?: string
          sesion_nombre?: string | null
          size?: number | null
          sort_order?: number
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_fotos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_fotos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_publicaciones: {
        Row: {
          company_id: string
          id: string
          product_id: string
          publicado: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          product_id: string
          publicado?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          product_id?: string
          publicado?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_publicaciones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_publicaciones_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tipos_inventario: {
        Row: {
          codigo: string
          company_id: string
          created_at: string | null
          id: string
          nombre: string
          valor: string
        }
        Insert: {
          codigo: string
          company_id: string
          created_at?: string | null
          id?: string
          nombre: string
          valor: string
        }
        Update: {
          codigo?: string
          company_id?: string
          created_at?: string | null
          id?: string
          nombre?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tipos_inventario_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          archived_reason: string | null
          categoria: string | null
          category_id: string | null
          codigo: string
          comision_bs: number | null
          company_id: string
          condicion: string | null
          costo_con_iva_bs: number | null
          created_at: string
          cuenta_inventario_id: string | null
          descripcion: string | null
          descripcion_catalogo: string | null
          especificacion: string | null
          id: string
          is_active: boolean
          iva_importado_bs: number | null
          metodo_valuacion: string
          mostrar_en_catalogo: boolean
          nombre: string
          oculto_en_gestion: boolean
          precio_actualizado_at: string | null
          precio_lista: number | null
          precio_lista_anterior: number | null
          precio_minimo: number | null
          precio_minimo_negociacion: number | null
          status: string
          tipo_inventario: string | null
          unidad_medida: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_reason?: string | null
          categoria?: string | null
          category_id?: string | null
          codigo: string
          comision_bs?: number | null
          company_id: string
          condicion?: string | null
          costo_con_iva_bs?: number | null
          created_at?: string
          cuenta_inventario_id?: string | null
          descripcion?: string | null
          descripcion_catalogo?: string | null
          especificacion?: string | null
          id?: string
          is_active?: boolean
          iva_importado_bs?: number | null
          metodo_valuacion?: string
          mostrar_en_catalogo?: boolean
          nombre: string
          oculto_en_gestion?: boolean
          precio_actualizado_at?: string | null
          precio_lista?: number | null
          precio_lista_anterior?: number | null
          precio_minimo?: number | null
          precio_minimo_negociacion?: number | null
          status?: string
          tipo_inventario?: string | null
          unidad_medida?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          archived_reason?: string | null
          categoria?: string | null
          category_id?: string | null
          codigo?: string
          comision_bs?: number | null
          company_id?: string
          condicion?: string | null
          costo_con_iva_bs?: number | null
          created_at?: string
          cuenta_inventario_id?: string | null
          descripcion?: string | null
          descripcion_catalogo?: string | null
          especificacion?: string | null
          id?: string
          is_active?: boolean
          iva_importado_bs?: number | null
          metodo_valuacion?: string
          mostrar_en_catalogo?: boolean
          nombre?: string
          oculto_en_gestion?: boolean
          precio_actualizado_at?: string | null
          precio_lista?: number | null
          precio_lista_anterior?: number | null
          precio_minimo?: number | null
          precio_minimo_negociacion?: number | null
          status?: string
          tipo_inventario?: string | null
          unidad_medida?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quarterly_closures: {
        Row: {
          balances: Json
          closure_date: string
          company_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balances?: Json
          closure_date: string
          company_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balances?: Json
          closure_date?: string
          company_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quarterly_closures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      receivables: {
        Row: {
          company_id: string
          created_at: string
          cuenta_activo_id: string | null
          cuenta_ingreso_id: string | null
          customer_id: string | null
          estado: string
          fecha_emision: string
          fecha_vencimiento: string | null
          id: string
          journal_entry_id: string | null
          moneda: string
          monto_original: number
          monto_pendiente: number
          notas: string | null
          numero_documento: string
          sale_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          cuenta_activo_id?: string | null
          cuenta_ingreso_id?: string | null
          customer_id?: string | null
          estado?: string
          fecha_emision: string
          fecha_vencimiento?: string | null
          id?: string
          journal_entry_id?: string | null
          moneda?: string
          monto_original: number
          monto_pendiente: number
          notas?: string | null
          numero_documento: string
          sale_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          cuenta_activo_id?: string | null
          cuenta_ingreso_id?: string | null
          customer_id?: string | null
          estado?: string
          fecha_emision?: string
          fecha_vencimiento?: string | null
          id?: string
          journal_entry_id?: string | null
          moneda?: string
          monto_original?: number
          monto_pendiente?: number
          notas?: string | null
          numero_documento?: string
          sale_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      report_settings: {
        Row: {
          company_id: string
          cost_of_sales_keywords: string[]
          created_at: string
          id: string
          operating_expense_keywords: string[]
          other_expense_keywords: string[]
          tax_enabled: boolean
          tax_rate: number
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          cost_of_sales_keywords?: string[]
          created_at?: string
          id?: string
          operating_expense_keywords?: string[]
          other_expense_keywords?: string[]
          tax_enabled?: boolean
          tax_rate?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          cost_of_sales_keywords?: string[]
          created_at?: string
          id?: string
          operating_expense_keywords?: string[]
          other_expense_keywords?: string[]
          tax_enabled?: boolean
          tax_rate?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          cantidad: number
          costo_total: number | null
          costo_unitario: number | null
          created_at: string
          cuenta_inventario_id: string | null
          id: string
          inventory_movement_id: string | null
          margen_bruto: number | null
          metodo_valuacion: string
          precio_unitario_neto: number
          product_codigo: string | null
          product_id: string
          product_nombre: string
          sale_id: string
          subtotal_neto: number
        }
        Insert: {
          cantidad: number
          costo_total?: number | null
          costo_unitario?: number | null
          created_at?: string
          cuenta_inventario_id?: string | null
          id?: string
          inventory_movement_id?: string | null
          margen_bruto?: number | null
          metodo_valuacion: string
          precio_unitario_neto: number
          product_codigo?: string | null
          product_id: string
          product_nombre: string
          sale_id: string
          subtotal_neto: number
        }
        Update: {
          cantidad?: number
          costo_total?: number | null
          costo_unitario?: number | null
          created_at?: string
          cuenta_inventario_id?: string | null
          id?: string
          inventory_movement_id?: string | null
          margen_bruto?: number | null
          metodo_valuacion?: string
          precio_unitario_neto?: number
          product_codigo?: string | null
          product_id?: string
          product_nombre?: string
          sale_id?: string
          subtotal_neto?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          aux_entry_id: string | null
          canal: string
          cliente_nombre: string | null
          company_id: string
          con_factura: boolean
          created_at: string
          customer_id: string | null
          estado: string
          fecha: string
          glosa: string | null
          id: string
          journal_entry_id: string | null
          numero: string
          precio_neto_total: number
          tipo_pago: string
          total_cobrado: number
          total_costo: number | null
          total_it: number
          total_iva: number
          user_id: string
          vendedor_member_id: string | null
          void_journal_entry_id: string | null
          void_reason: string | null
        }
        Insert: {
          aux_entry_id?: string | null
          canal: string
          cliente_nombre?: string | null
          company_id: string
          con_factura?: boolean
          created_at?: string
          customer_id?: string | null
          estado?: string
          fecha: string
          glosa?: string | null
          id?: string
          journal_entry_id?: string | null
          numero: string
          precio_neto_total: number
          tipo_pago: string
          total_cobrado: number
          total_costo?: number | null
          total_it?: number
          total_iva?: number
          user_id: string
          vendedor_member_id?: string | null
          void_journal_entry_id?: string | null
          void_reason?: string | null
        }
        Update: {
          aux_entry_id?: string | null
          canal?: string
          cliente_nombre?: string | null
          company_id?: string
          con_factura?: boolean
          created_at?: string
          customer_id?: string | null
          estado?: string
          fecha?: string
          glosa?: string | null
          id?: string
          journal_entry_id?: string | null
          numero?: string
          precio_neto_total?: number
          tipo_pago?: string
          total_cobrado?: number
          total_costo?: number | null
          total_it?: number
          total_iva?: number
          user_id?: string
          vendedor_member_id?: string | null
          void_journal_entry_id?: string | null
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_vendedor_member_id_fkey"
            columns: ["vendedor_member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_access: {
        Row: {
          can_view_accounts: boolean
          can_view_auxiliary: boolean
          can_view_journal: boolean
          can_view_ledger: boolean
          can_view_reports: boolean
          created_at: string
          id: string
          owner_id: string
          viewer_id: string
        }
        Insert: {
          can_view_accounts?: boolean
          can_view_auxiliary?: boolean
          can_view_journal?: boolean
          can_view_ledger?: boolean
          can_view_reports?: boolean
          created_at?: string
          id?: string
          owner_id: string
          viewer_id: string
        }
        Update: {
          can_view_accounts?: boolean
          can_view_auxiliary?: boolean
          can_view_journal?: boolean
          can_view_ledger?: boolean
          can_view_reports?: boolean
          created_at?: string
          id?: string
          owner_id?: string
          viewer_id?: string
        }
        Relationships: []
      }
      shipments: {
        Row: {
          company_id: string
          created_at: string
          data: Json
          id: string
          numero: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          data?: Json
          id?: string
          numero: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          data?: Json
          id?: string
          numero?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ajustar_costo_lote: {
        Args: {
          p_company_id: string
          p_concepto: string
          p_fecha: string
          p_journal_entry_id?: string
          p_lot_id: string
          p_monto: number
        }
        Returns: Json
      }
      assign_default_owner_role: { Args: { _user_id: string }; Returns: Json }
      assign_default_permissions: {
        Args: {
          p_member_id: string
          p_role: Database["public"]["Enums"]["company_role"]
        }
        Returns: undefined
      }
      attach_payable_payment_to_journal_line: {
        Args: {
          p_company_id: string
          p_fecha: string
          p_journal_entry_id: string
          p_monto: number
          p_notas: string
          p_payable_id: string
          p_tipo_pago: string
        }
        Returns: Json
      }
      attach_payable_to_journal_line: {
        Args: {
          p_company_id: string
          p_cuenta_gasto_id: string
          p_cuenta_pasivo_id: string
          p_fecha_emision: string
          p_fecha_vencimiento: string
          p_journal_entry_id: string
          p_moneda: string
          p_monto_original: number
          p_notas: string
          p_numero_documento: string
          p_proveedor_nit: string
          p_proveedor_nombre: string
        }
        Returns: Json
      }
      attach_receivable_payment_to_journal_line: {
        Args: {
          p_company_id: string
          p_fecha: string
          p_journal_entry_id: string
          p_monto: number
          p_notas: string
          p_receivable_id: string
          p_tipo_pago: string
        }
        Returns: Json
      }
      attach_receivable_to_journal_line: {
        Args: {
          p_company_id: string
          p_cuenta_activo_id: string
          p_cuenta_ingreso_id: string
          p_customer_id: string
          p_fecha_emision: string
          p_fecha_vencimiento: string
          p_journal_entry_id: string
          p_moneda: string
          p_monto_original: number
          p_notas: string
          p_numero_documento: string
        }
        Returns: Json
      }
      build_company_backup: { Args: { p_company_id: string }; Returns: Json }
      create_company_backup: {
        Args: { p_company_id: string; p_kind?: string }
        Returns: Json
      }
      create_invitation_code: {
        Args: {
          p_company_id: string
          p_expires_days?: number
          p_role: Database["public"]["Enums"]["company_role"]
        }
        Returns: string
      }
      create_my_company: {
        Args: {
          p_country?: string
          p_currency?: string
          p_name: string
          p_slug: string
        }
        Returns: Json
      }
      create_payable_with_journal: { Args: { payload: Json }; Returns: Json }
      create_receivable_with_journal: { Args: { payload: Json }; Returns: Json }
      create_sale: { Args: { payload: Json }; Returns: Json }
      default_permissions_for_role: {
        Args: { p_role: Database["public"]["Enums"]["company_role"] }
        Returns: {
          can_approve: boolean
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_export: boolean
          can_view: boolean
          module: Database["public"]["Enums"]["erp_module"]
        }[]
      }
      get_balance_sheet: {
        Args: { as_of_date: string }
        Returns: {
          saldo: number
          tipo: string
        }[]
      }
      get_catalog_costo_referencia: {
        Args: { p_company_id: string }
        Returns: {
          costo_sin_iva: number
          iva_importado: number
          product_id: string
        }[]
      }
      get_catalog_productos: {
        Args: { p_company_id: string }
        Returns: {
          comision_bs: number
          condicion: string
          descripcion_catalogo: string
          especificacion: string
          id: string
          nombre: string
          precio_actualizado_at: string
          precio_con_factura: number
          precio_lista: number
          precio_lista_anterior: number
          precio_minimo_negociacion: number
        }[]
      }
      get_catalog_stock: {
        Args: { p_company_id: string }
        Returns: {
          product_id: string
          stock_disponible: number
        }[]
      }
      get_company_kpis: {
        Args: { p_company_id: string; p_year?: number }
        Returns: {
          cuentas_x_cobrar: number
          cuentas_x_pagar: number
          gastos_periodo: number
          ingresos_periodo: number
          resultado_neto: number
          total_activos: number
          total_pasivos: number
          total_patrimonio: number
          total_ventas_mes: number
        }[]
      }
      get_company_members_detail: {
        Args: { p_company_id: string }
        Returns: {
          display_name: string
          email: string
          joined_at: string
          member_id: string
          modules_total: number
          modules_with_view: number
          role: string
          user_id: string
        }[]
      }
      get_company_module_config: {
        Args: { p_company_id: string }
        Returns: {
          config_value: string
          is_visible: boolean
          submodule: string
        }[]
      }
      get_holding_summary: {
        Args: { p_year?: number }
        Returns: {
          company_id: string
          company_name: string
          currency: string
          cxc_pendiente: number
          cxp_pendiente: number
          gastos: number
          ingresos: number
          resultado_neto: number
          total_activos: number
          total_pasivos: number
          total_patrimonio: number
          ventas_mes: number
        }[]
      }
      get_income_statement: {
        Args: { from_date: string; to_date: string }
        Returns: {
          gastos: number
          ingresos: number
          utilidad: number
        }[]
      }
      get_member_permissions: {
        Args: { p_member_id: string }
        Returns: {
          can_approve: boolean
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_export: boolean
          can_view: boolean
          module: string
        }[]
      }
      get_my_companies: {
        Args: never
        Returns: {
          company_id: string
          country: string
          currency: string
          holding_id: string
          is_holding: boolean
          joined_at: string
          logo_url: string
          name: string
          role: string
          slug: string
        }[]
      }
      get_my_permissions: {
        Args: { p_company_id: string }
        Returns: {
          can_approve: boolean
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_export: boolean
          can_view: boolean
          module: string
        }[]
      }
      get_my_ventas: {
        Args: { p_company_id: string }
        Returns: {
          comision: number
          fecha: string
          numero: string
          productos: string
        }[]
      }
      get_products_stock_batch: {
        Args: { p_company_id: string; p_product_ids: string[] }
        Returns: {
          cpp: number
          product_id: string
          stock: number
          valor_total: number
        }[]
      }
      get_shipment_realized_sales: {
        Args: { p_company_id: string; p_shipment_id: string }
        Returns: {
          con_factura: number
          costo: number
          ingreso_neto: number
          primera_entrada: string
          shipment_product_id: string
          sin_factura: number
          ultima_venta: string
          unidades: number
        }[]
      }
      get_shipment_realized_sales_detail: {
        Args: { p_company_id: string; p_shipment_id: string }
        Returns: {
          con_factura: number
          costo: number
          fecha: string
          ingreso_neto: number
          shipment_product_id: string
          sin_factura: number
          unidades: number
        }[]
      }
      get_trial_balance: {
        Args: { period: string }
        Returns: {
          balance: number
          credit: number
          debit: number
          id: string
          name: string
        }[]
      }
      get_ventas_por_vendedor: {
        Args: { p_company_id: string }
        Returns: {
          cantidad: number
          fecha: string
          numero: string
          product_id: string
          product_nombre: string
          sale_id: string
          vendedor_member_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_shared_access: {
        Args: { _owner_id: string; _viewer_id: string }
        Returns: boolean
      }
      next_journal_entry_id:
        | { Args: { p_date: string; p_user_id: string }; Returns: string }
        | {
            Args: { p_company_id: string; p_date: string; p_user_id: string }
            Returns: string
          }
      redeem_invitation_code: {
        Args: { _code: string; _user_id: string }
        Returns: Json
      }
      register_payable_payment_with_journal: {
        Args: { payload: Json }
        Returns: Json
      }
      register_receivable_payment_with_journal: {
        Args: { payload: Json }
        Returns: Json
      }
      remove_company_member: {
        Args: { p_member_id: string }
        Returns: undefined
      }
      rename_account_code: {
        Args: { p_company_id: string; p_new_id: string; p_old_id: string }
        Returns: Json
      }
      revoke_shared_access: {
        Args: { _owner_id: string; _viewer_id: string }
        Returns: boolean
      }
      run_scheduled_backups: { Args: never; Returns: Json }
      set_company_module_config: {
        Args: {
          p_company_id: string
          p_is_visible: boolean
          p_submodule: string
        }
        Returns: undefined
      }
      update_member_module_permission: {
        Args: {
          p_can_approve: boolean
          p_can_create: boolean
          p_can_delete: boolean
          p_can_edit: boolean
          p_can_export: boolean
          p_can_view: boolean
          p_member_id: string
          p_module: Database["public"]["Enums"]["erp_module"]
        }
        Returns: undefined
      }
      update_member_role: {
        Args: {
          p_member_id: string
          p_new_role: Database["public"]["Enums"]["company_role"]
        }
        Returns: undefined
      }
      void_sale: {
        Args: { p_reason: string; p_sale_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "owner" | "viewer"
      company_role:
        | "owner"
        | "manager"
        | "accountant"
        | "auditor"
        | "viewer"
        | "custom"
      erp_module:
        | "accounts"
        | "journal"
        | "ledger"
        | "auxiliary_ledgers"
        | "reports"
        | "fiscal_years"
        | "inventory"
        | "sales"
        | "customers"
        | "receivables"
        | "payables"
        | "shipments"
        | "settings"
        | "holding"
        | "licitaciones"
        | "investments"
        | "catalogo_ventas"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "viewer"],
      company_role: [
        "owner",
        "manager",
        "accountant",
        "auditor",
        "viewer",
        "custom",
      ],
      erp_module: [
        "accounts",
        "journal",
        "ledger",
        "auxiliary_ledgers",
        "reports",
        "fiscal_years",
        "inventory",
        "sales",
        "customers",
        "receivables",
        "payables",
        "shipments",
        "settings",
        "holding",
        "licitaciones",
        "investments",
        "catalogo_ventas",
      ],
    },
  },
} as const
