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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          details: Json
          id: number
          organization_id: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json
          id?: never
          organization_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json
          id?: never
          organization_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_settings: {
        Row: {
          grace_days: number
          id: boolean
          prices_include_vat: boolean
          trial_days: number
          trial_storage_gb: number
          updated_at: string
          vat_percent: number
        }
        Insert: {
          grace_days?: number
          id?: boolean
          prices_include_vat?: boolean
          trial_days?: number
          trial_storage_gb?: number
          updated_at?: string
          vat_percent?: number
        }
        Update: {
          grace_days?: number
          id?: boolean
          prices_include_vat?: boolean
          trial_days?: number
          trial_storage_gb?: number
          updated_at?: string
          vat_percent?: number
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          email_consent: boolean
          field_revs: Json
          full_name: string
          id: string
          notes: string | null
          organization_id: string
          phone: string | null
          rev: number
          seq: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          email_consent?: boolean
          field_revs?: Json
          full_name: string
          id: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          rev?: number
          seq?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          email_consent?: boolean
          field_revs?: Json
          full_name?: string
          id?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          rev?: number
          seq?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          organization_id: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          is_clinician: boolean
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_clinician?: boolean
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_clinician?: boolean
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          address_line: string | null
          city: string | null
          country: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          postal_code: string | null
          tax_number: string | null
          type: Database["public"]["Enums"]["organization_type"]
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          postal_code?: string | null
          tax_number?: string | null
          type: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          postal_code?: string | null
          tax_number?: string | null
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          birth_date: string | null
          breed: string | null
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          field_revs: Json
          id: string
          microchip: string | null
          name: string
          neutered: boolean
          notes: string | null
          organization_id: string
          rev: number
          seq: number
          sex: Database["public"]["Enums"]["animal_sex"]
          species: Database["public"]["Enums"]["species"]
          updated_at: string
          updated_by: string | null
          weight_kg: number | null
        }
        Insert: {
          birth_date?: string | null
          breed?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          field_revs?: Json
          id: string
          microchip?: string | null
          name: string
          neutered?: boolean
          notes?: string | null
          organization_id: string
          rev?: number
          seq?: number
          sex?: Database["public"]["Enums"]["animal_sex"]
          species: Database["public"]["Enums"]["species"]
          updated_at?: string
          updated_by?: string | null
          weight_kg?: number | null
        }
        Update: {
          birth_date?: string | null
          breed?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          field_revs?: Json
          id?: string
          microchip?: string | null
          name?: string
          neutered?: boolean
          notes?: string | null
          organization_id?: string
          rev?: number
          seq?: number
          sex?: Database["public"]["Enums"]["animal_sex"]
          species?: Database["public"]["Enums"]["species"]
          updated_at?: string
          updated_by?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          key: string
          requires_clinician: boolean
          sort_order: number
        }
        Insert: {
          key: string
          requires_clinician?: boolean
          sort_order: number
        }
        Update: {
          key?: string
          requires_clinician?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      plans: {
        Row: {
          audience: Database["public"]["Enums"]["plan_audience"]
          created_at: string
          description: string
          features: string[]
          id: string
          is_default: boolean
          is_public: boolean
          key: string
          max_members: number | null
          monthly_price_huf: number | null
          name: string
          sort_order: number
          storage_gb: number
          stripe_monthly_price_id: string | null
          stripe_yearly_price_id: string | null
          updated_at: string
          yearly_price_huf: number | null
        }
        Insert: {
          audience: Database["public"]["Enums"]["plan_audience"]
          created_at?: string
          description?: string
          features?: string[]
          id?: string
          is_default?: boolean
          is_public?: boolean
          key: string
          max_members?: number | null
          monthly_price_huf?: number | null
          name: string
          sort_order?: number
          storage_gb: number
          stripe_monthly_price_id?: string | null
          stripe_yearly_price_id?: string | null
          updated_at?: string
          yearly_price_huf?: number | null
        }
        Update: {
          audience?: Database["public"]["Enums"]["plan_audience"]
          created_at?: string
          description?: string
          features?: string[]
          id?: string
          is_default?: boolean
          is_public?: boolean
          key?: string
          max_members?: number | null
          monthly_price_huf?: number | null
          name?: string
          sort_order?: number
          storage_gb?: number
          stripe_monthly_price_id?: string | null
          stripe_yearly_price_id?: string | null
          updated_at?: string
          yearly_price_huf?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          permission: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          permission?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_interval: string | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          organization_id: string
          past_due_since: string | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          organization_id: string
          past_due_since?: string | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          organization_id?: string
          past_due_since?: string | null
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_conflicts: {
        Row: {
          applied_value: Json | null
          created_at: string
          field: string
          id: number
          organization_id: string
          overwritten_by: string | null
          overwritten_value: Json | null
          record_id: string
          resolved_at: string | null
          resolved_by: string | null
          table_name: string
        }
        Insert: {
          applied_value?: Json | null
          created_at?: string
          field: string
          id?: never
          organization_id: string
          overwritten_by?: string | null
          overwritten_value?: Json | null
          record_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          table_name: string
        }
        Update: {
          applied_value?: Json | null
          created_at?: string
          field?: string
          id?: never
          organization_id?: string
          overwritten_by?: string | null
          overwritten_value?: Json | null
          record_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflicts_overwritten_by_fkey"
            columns: ["overwritten_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_teeth: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          field_revs: Json
          findings: Json
          id: string
          note: string | null
          organization_id: string
          pockets: Json
          procedures: Json
          rev: number
          seq: number
          tooth: number
          updated_at: string
          updated_by: string | null
          visit_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          field_revs?: Json
          findings?: Json
          id: string
          note?: string | null
          organization_id: string
          pockets?: Json
          procedures?: Json
          rev?: number
          seq?: number
          tooth: number
          updated_at?: string
          updated_by?: string | null
          visit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          field_revs?: Json
          findings?: Json
          id?: string
          note?: string | null
          organization_id?: string
          pockets?: Json
          procedures?: Json
          rev?: number
          seq?: number
          tooth?: number
          updated_at?: string
          updated_by?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_teeth_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_teeth_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_teeth_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visit_teeth_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          anesthesia_blocks: Json
          asa_status: number | null
          assistant_name: string | null
          blood_summary: string | null
          complaint_notes: string | null
          complaint_tags: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          diet_type: string | null
          feeding_advice: string | null
          field_revs: Json
          finalized_at: string | null
          finalized_by: string | null
          follow_up_date: string | null
          general_note: string | null
          home_brushing: string | null
          id: string
          last_fed_at: string | null
          medications: Json
          organization_id: string
          patient_id: string
          ready_to_finalize: boolean
          rev: number
          seq: number
          status: Database["public"]["Enums"]["visit_status"]
          sutures: string | null
          updated_at: string
          updated_by: string | null
          veterinarian_name: string | null
          visit_date: string
          weight_kg: number | null
        }
        Insert: {
          anesthesia_blocks?: Json
          asa_status?: number | null
          assistant_name?: string | null
          blood_summary?: string | null
          complaint_notes?: string | null
          complaint_tags?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          diet_type?: string | null
          feeding_advice?: string | null
          field_revs?: Json
          finalized_at?: string | null
          finalized_by?: string | null
          follow_up_date?: string | null
          general_note?: string | null
          home_brushing?: string | null
          id: string
          last_fed_at?: string | null
          medications?: Json
          organization_id: string
          patient_id: string
          ready_to_finalize?: boolean
          rev?: number
          seq?: number
          status?: Database["public"]["Enums"]["visit_status"]
          sutures?: string | null
          updated_at?: string
          updated_by?: string | null
          veterinarian_name?: string | null
          visit_date: string
          weight_kg?: number | null
        }
        Update: {
          anesthesia_blocks?: Json
          asa_status?: number | null
          assistant_name?: string | null
          blood_summary?: string | null
          complaint_notes?: string | null
          complaint_tags?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          diet_type?: string | null
          feeding_advice?: string | null
          field_revs?: Json
          finalized_at?: string | null
          finalized_by?: string | null
          follow_up_date?: string | null
          general_note?: string | null
          home_brushing?: string | null
          id?: string
          last_fed_at?: string | null
          medications?: Json
          organization_id?: string
          patient_id?: string
          ready_to_finalize?: boolean
          rev?: number
          seq?: number
          status?: Database["public"]["Enums"]["visit_status"]
          sutures?: string | null
          updated_at?: string
          updated_by?: string | null
          veterinarian_name?: string | null
          visit_date?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      create_invitation: {
        Args: {
          p_email: string
          p_organization_id: string
          p_role: Database["public"]["Enums"]["member_role"]
        }
        Returns: {
          invitation_id: string
          token: string
        }[]
      }
      create_organization: {
        Args: {
          p_address_line?: string
          p_city?: string
          p_country?: string
          p_email?: string
          p_name: string
          p_owner_is_clinician?: boolean
          p_phone?: string
          p_postal_code?: string
          p_tax_number?: string
          p_type: Database["public"]["Enums"]["organization_type"]
        }
        Returns: string
      }
      finalize_visit: {
        Args: { p_organization_id: string; p_visit_id: string }
        Returns: undefined
      }
      get_invitation: {
        Args: { p_token: string }
        Returns: {
          email: string
          organization_name: string
          role: Database["public"]["Enums"]["member_role"]
          state: string
        }[]
      }
      list_members: {
        Args: { p_organization_id: string }
        Returns: {
          email: string
          full_name: string
          is_clinician: boolean
          joined_at: string
          membership_id: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          title: string
          user_id: string
        }[]
      }
      list_public_plans: {
        Args: never
        Returns: {
          audience: Database["public"]["Enums"]["plan_audience"]
          description: string
          features: string[]
          key: string
          max_members: number
          monthly_price_huf: number
          name: string
          prices_include_vat: boolean
          storage_gb: number
          trial_days: number
          vat_percent: number
          yearly_price_huf: number
        }[]
      }
      log_auth_event: { Args: { p_event: string }; Returns: undefined }
      my_entitlements: {
        Args: { p_organization_id: string }
        Returns: {
          access: string
          cancel_at_period_end: boolean
          current_period_end: string
          features: string[]
          grace_ends_at: string
          max_members: number
          member_count: number
          pending_invitation_count: number
          plan_key: string
          plan_name: string
          status: Database["public"]["Enums"]["subscription_status"]
          storage_gb: number
          trial_ends_at: string
        }[]
      }
      my_permissions: { Args: { p_organization_id: string }; Returns: string[] }
      remove_member: { Args: { p_membership_id: string }; Returns: undefined }
      reopen_visit: {
        Args: {
          p_organization_id: string
          p_reason: string
          p_visit_id: string
        }
        Returns: undefined
      }
      resolve_sync_conflict: {
        Args: { p_conflict_id: number }
        Returns: undefined
      }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      set_member_status: {
        Args: {
          p_membership_id: string
          p_status: Database["public"]["Enums"]["member_status"]
        }
        Returns: undefined
      }
      sync_push_clients: {
        Args: { p_changes: Json; p_organization_id: string }
        Returns: Json
      }
      sync_push_patients: {
        Args: { p_changes: Json; p_organization_id: string }
        Returns: Json
      }
      sync_push_visit_teeth: {
        Args: { p_changes: Json; p_organization_id: string }
        Returns: Json
      }
      sync_push_visits: {
        Args: { p_changes: Json; p_organization_id: string }
        Returns: Json
      }
      update_member: {
        Args: {
          p_is_clinician?: boolean
          p_membership_id: string
          p_role: Database["public"]["Enums"]["member_role"]
        }
        Returns: undefined
      }
    }
    Enums: {
      animal_sex: "male" | "female" | "unknown"
      member_role: "owner" | "admin" | "vet" | "assistant" | "receptionist"
      member_status: "active" | "suspended"
      organization_type: "clinic" | "individual"
      plan_audience: "clinic" | "individual"
      species: "dog" | "cat"
      subscription_status: "trialing" | "active" | "past_due" | "canceled"
      visit_status: "draft" | "final"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      animal_sex: ["male", "female", "unknown"],
      member_role: ["owner", "admin", "vet", "assistant", "receptionist"],
      member_status: ["active", "suspended"],
      organization_type: ["clinic", "individual"],
      plan_audience: ["clinic", "individual"],
      species: ["dog", "cat"],
      subscription_status: ["trialing", "active", "past_due", "canceled"],
      visit_status: ["draft", "final"],
    },
  },
} as const
