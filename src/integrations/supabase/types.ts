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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          cost: number | null
          created_at: string
          description: string | null
          end_date: string | null
          hours: number | null
          id: string
          parent_id: string | null
          phase_id: string | null
          priority: string
          project_id: string
          start_date: string | null
          status: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          hours?: number | null
          id?: string
          parent_id?: string | null
          phase_id?: string | null
          priority?: string
          project_id: string
          start_date?: string | null
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          hours?: number | null
          id?: string
          parent_id?: string | null
          phase_id?: string | null
          priority?: string
          project_id?: string
          start_date?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_comments: {
        Row: {
          activity_id: string
          author: string | null
          content: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          author?: string | null
          content: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          author?: string | null
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_comments_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_investments: {
        Row: {
          activity_id: string
          amount: number
          description: string | null
          id: string
          recorded_at: string
        }
        Insert: {
          activity_id: string
          amount: number
          description?: string | null
          id?: string
          recorded_at?: string
        }
        Update: {
          activity_id?: string
          amount?: number
          description?: string | null
          id?: string
          recorded_at?: string
        }
        Relationships: []
      }
      investment_history: {
        Row: {
          amount: number
          description: string | null
          id: string
          project_id: string
          recorded_at: string
        }
        Insert: {
          amount: number
          description?: string | null
          id?: string
          project_id: string
          recorded_at?: string
        }
        Update: {
          amount?: number
          description?: string | null
          id?: string
          project_id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons_learned: {
        Row: {
          category: string
          created_at: string
          id: string
          impact: string | null
          phase_id: string | null
          problem: string
          project_id: string
          reported_by: string | null
          solution: string | null
          suggestion: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          impact?: string | null
          phase_id?: string | null
          problem: string
          project_id: string
          reported_by?: string | null
          solution?: string | null
          suggestion?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          impact?: string | null
          phase_id?: string | null
          problem?: string
          project_id?: string
          reported_by?: string | null
          solution?: string | null
          suggestion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_learned_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_learned_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          activity_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          project_id: string | null
          title: string
          type: string
        }
        Insert: {
          activity_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          project_id?: string | null
          title: string
          type: string
        }
        Update: {
          activity_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          project_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      phases: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          project_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          project_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          project_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_documents: {
        Row: {
          activity_id: string | null
          created_at: string
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          phase_id: string | null
          project_id: string
          updated_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          activity_id?: string | null
          created_at?: string
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          phase_id?: string | null
          project_id: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          activity_id?: string | null
          created_at?: string
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          phase_id?: string | null
          project_id?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          assignees: string[] | null
          blockers: string | null
          budget_planned: number | null
          budget_used: number | null
          created_at: string
          description: string | null
          display_order: number | null
          due_date: string | null
          id: string
          owner: string | null
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignees?: string[] | null
          blockers?: string | null
          budget_planned?: number | null
          budget_used?: number | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          due_date?: string | null
          id?: string
          owner?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignees?: string[] | null
          blockers?: string | null
          budget_planned?: number | null
          budget_used?: number | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          due_date?: string | null
          id?: string
          owner?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          id: string
          lag_days: number | null
          predecessor_id: string
          successor_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          id?: string
          lag_days?: number | null
          predecessor_id: string
          successor_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          id?: string
          lag_days?: number | null
          predecessor_id?: string
          successor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          activity_id: string
          created_at: string
          description: string | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          project_id: string
          started_at: string
          user_name: string | null
        }
        Insert: {
          activity_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          project_id: string
          started_at: string
          user_name?: string | null
        }
        Update: {
          activity_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          project_id?: string
          started_at?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
