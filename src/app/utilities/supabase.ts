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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          conductors: Json | null
          created_at: string | null
          criticalPlayers: number[] | null
          date: string | null
          excused: string[]
          id: number
          img: string | null
          notes: string | null
          plan: Json | null
          playerNotes: Json | null
          players: Json | null
          save_in_history: boolean | null
          songs: number[]
          tenantId: number
          type: string | null
          typeInfo: string | null
        }
        Insert: {
          conductors?: Json | null
          created_at?: string | null
          criticalPlayers?: number[] | null
          date?: string | null
          excused?: string[]
          id?: number
          img?: string | null
          notes?: string | null
          plan?: Json | null
          playerNotes?: Json | null
          players?: Json | null
          save_in_history?: boolean | null
          songs?: number[]
          tenantId: number
          type?: string | null
          typeInfo?: string | null
        }
        Update: {
          conductors?: Json | null
          created_at?: string | null
          criticalPlayers?: number[] | null
          date?: string | null
          excused?: string[]
          id?: number
          img?: string | null
          notes?: string | null
          plan?: Json | null
          playerNotes?: Json | null
          players?: Json | null
          save_in_history?: boolean | null
          songs?: number[]
          tenantId?: number
          type?: string | null
          typeInfo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_attendance_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_types: {
        Row: {
          available_statuses: number[]
          created_at: string
          default_plan: Json | null
          default_status: number | null
          end_time: string | null
          id: string
          manage_songs: boolean | null
          name: string | null
          relevant_groups: number[] | null
          start_time: string | null
          tenant_id: number | null
        }
        Insert: {
          available_statuses?: number[]
          created_at?: string
          default_plan?: Json | null
          default_status?: number | null
          end_time?: string | null
          id?: string
          manage_songs?: boolean | null
          name?: string | null
          relevant_groups?: number[] | null
          start_time?: string | null
          tenant_id?: number | null
        }
        Update: {
          available_statuses?: number[]
          created_at?: string
          default_plan?: Json | null
          default_status?: number | null
          end_time?: string | null
          id?: string
          manage_songs?: boolean | null
          name?: string | null
          relevant_groups?: number[] | null
          start_time?: string | null
          tenant_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendanceTypes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conductors: {
        Row: {
          appId: string | null
          birthday: string | null
          correctBirthday: boolean | null
          created_at: string | null
          email: string | null
          firstName: string | null
          id: number
          img: string | null
          joined: string | null
          lastName: string | null
          left: string | null
          notes: string | null
          tenantId: number
        }
        Insert: {
          appId?: string | null
          birthday?: string | null
          correctBirthday?: boolean | null
          created_at?: string | null
          email?: string | null
          firstName?: string | null
          id?: number
          img?: string | null
          joined?: string | null
          lastName?: string | null
          left?: string | null
          notes?: string | null
          tenantId: number
        }
        Update: {
          appId?: string | null
          birthday?: string | null
          correctBirthday?: boolean | null
          created_at?: string | null
          email?: string | null
          firstName?: string | null
          id?: number
          img?: string | null
          joined?: string | null
          lastName?: string | null
          left?: string | null
          notes?: string | null
          tenantId?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_conductors_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      group_categories: {
        Row: {
          created_at: string
          id: number
          name: string | null
          tenant_id: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          name?: string | null
          tenant_id?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          name?: string | null
          tenant_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "group_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      history: {
        Row: {
          attendance_id: number | null
          created_at: string | null
          date: string | null
          id: number
          otherConductor: string | null
          person_id: number | null
          songId: number | null
          tenantId: number | null
          visible: boolean | null
        }
        Insert: {
          attendance_id?: number | null
          created_at?: string | null
          date?: string | null
          id?: number
          otherConductor?: string | null
          person_id?: number | null
          songId?: number | null
          tenantId?: number | null
          visible?: boolean | null
        }
        Update: {
          attendance_id?: number | null
          created_at?: string | null
          date?: string | null
          id?: number
          otherConductor?: string | null
          person_id?: number | null
          songId?: number | null
          tenantId?: number | null
          visible?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "history_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_songId_fkey"
            columns: ["songId"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_history_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          category: number | null
          clefs: string[] | null
          created_at: string | null
          id: number
          legacyId: number | null
          maingroup: boolean | null
          name: string | null
          notes: string | null
          range: string | null
          tenantId: number
          tuning: string | null
        }
        Insert: {
          category?: number | null
          clefs?: string[] | null
          created_at?: string | null
          id?: number
          legacyId?: number | null
          maingroup?: boolean | null
          name?: string | null
          notes?: string | null
          range?: string | null
          tenantId: number
          tuning?: string | null
        }
        Update: {
          category?: number | null
          clefs?: string[] | null
          created_at?: string | null
          id?: number
          legacyId?: number | null
          maingroup?: boolean | null
          name?: string | null
          notes?: string | null
          range?: string | null
          tenantId?: number
          tuning?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instruments_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "group_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_instruments_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          attendees: number[] | null
          created_at: string | null
          date: string | null
          id: number
          notes: string | null
          tenantId: number | null
        }
        Insert: {
          attendees?: number[] | null
          created_at?: string | null
          date?: string | null
          id?: number
          notes?: string | null
          tenantId?: number | null
        }
        Update: {
          attendees?: number[] | null
          created_at?: string | null
          date?: string | null
          id?: number
          notes?: string | null
          tenantId?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "public_meetings_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          birthdays: boolean
          created_at: string
          enabled: boolean
          enabled_tenants: number[] | null
          id: string
          signins: boolean
          signouts: boolean
          telegram_chat_id: string | null
          updates: boolean | null
        }
        Insert: {
          birthdays?: boolean
          created_at?: string
          enabled?: boolean
          enabled_tenants?: number[] | null
          id: string
          signins?: boolean
          signouts?: boolean
          telegram_chat_id?: string | null
          updates?: boolean | null
        }
        Update: {
          birthdays?: boolean
          created_at?: string
          enabled?: boolean
          enabled_tenants?: number[] | null
          id?: string
          signins?: boolean
          signouts?: boolean
          telegram_chat_id?: string | null
          updates?: boolean | null
        }
        Relationships: []
      }
      parents: {
        Row: {
          appId: string | null
          created_at: string
          email: string | null
          firstName: string | null
          id: number
          lastName: string | null
          tenantId: number | null
        }
        Insert: {
          appId?: string | null
          created_at?: string
          email?: string | null
          firstName?: string | null
          id?: number
          lastName?: string | null
          tenantId?: number | null
        }
        Update: {
          appId?: string | null
          created_at?: string
          email?: string | null
          firstName?: string | null
          id?: number
          lastName?: string | null
          tenantId?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "parents_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      person_attendances: {
        Row: {
          attendance_id: number
          id: string
          notes: string | null
          person_id: number
          status: number
        }
        Insert: {
          attendance_id: number
          id?: string
          notes?: string | null
          person_id: number
          status: number
        }
        Update: {
          attendance_id?: number
          id?: string
          notes?: string | null
          person_id?: number
          status?: number
        }
        Relationships: [
          {
            foreignKeyName: "person_attendances_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_attendances_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "player"
            referencedColumns: ["id"]
          },
        ]
      }
      player: {
        Row: {
          appId: string | null
          birthday: string | null
          correctBirthday: boolean | null
          created_at: string | null
          criticalReason: number | null
          email: string | null
          examinee: boolean | null
          firstName: string | null
          hasTeacher: boolean | null
          history: Json | null
          id: number
          img: string | null
          instrument: number | null
          instruments: string | null
          isCritical: boolean | null
          isLeader: boolean | null
          joined: string | null
          lastName: string | null
          lastSolve: string | null
          left: string | null
          legacyConductorId: number | null
          legacyId: number | null
          notes: string | null
          otherExercise: string | null
          otherOrchestras: string[] | null
          parent_id: number | null
          paused: boolean | null
          playsSince: string | null
          range: string | null
          teacher: number | null
          tenantId: number
          testResult: string | null
        }
        Insert: {
          appId?: string | null
          birthday?: string | null
          correctBirthday?: boolean | null
          created_at?: string | null
          criticalReason?: number | null
          email?: string | null
          examinee?: boolean | null
          firstName?: string | null
          hasTeacher?: boolean | null
          history?: Json | null
          id?: number
          img?: string | null
          instrument?: number | null
          instruments?: string | null
          isCritical?: boolean | null
          isLeader?: boolean | null
          joined?: string | null
          lastName?: string | null
          lastSolve?: string | null
          left?: string | null
          legacyConductorId?: number | null
          legacyId?: number | null
          notes?: string | null
          otherExercise?: string | null
          otherOrchestras?: string[] | null
          parent_id?: number | null
          paused?: boolean | null
          playsSince?: string | null
          range?: string | null
          teacher?: number | null
          tenantId: number
          testResult?: string | null
        }
        Update: {
          appId?: string | null
          birthday?: string | null
          correctBirthday?: boolean | null
          created_at?: string | null
          criticalReason?: number | null
          email?: string | null
          examinee?: boolean | null
          firstName?: string | null
          hasTeacher?: boolean | null
          history?: Json | null
          id?: number
          img?: string | null
          instrument?: number | null
          instruments?: string | null
          isCritical?: boolean | null
          isLeader?: boolean | null
          joined?: string | null
          lastName?: string | null
          lastSolve?: string | null
          left?: string | null
          legacyConductorId?: number | null
          legacyId?: number | null
          notes?: string | null
          otherExercise?: string | null
          otherOrchestras?: string[] | null
          parent_id?: number | null
          paused?: boolean | null
          playsSince?: string | null
          range?: string | null
          teacher?: number | null
          tenantId?: number
          testResult?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_instrument_fkey"
            columns: ["instrument"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_player_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          created_at: string | null
          id: number
          name: string | null
          tenantId: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          name?: string | null
          tenantId?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string | null
          tenantId?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "public_scores_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          created_at: string | null
          id: number
          instrument_ids: number[] | null
          instruments: number[] | null
          legacyId: number | null
          link: string | null
          name: string | null
          number: number | null
          tenantId: number | null
          withChoir: boolean | null
          withOrchestra: boolean | null
          withSolo: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          instrument_ids?: number[] | null
          instruments?: number[] | null
          legacyId?: number | null
          link?: string | null
          name?: string | null
          number?: number | null
          tenantId?: number | null
          withChoir?: boolean | null
          withOrchestra?: boolean | null
          withSolo?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: number
          instrument_ids?: number[] | null
          instruments?: number[] | null
          legacyId?: number | null
          link?: string | null
          name?: string | null
          number?: number | null
          tenantId?: number | null
          withChoir?: boolean | null
          withOrchestra?: boolean | null
          withSolo?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "public_songs_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          id: number
          instruments: number[] | null
          legacyId: number | null
          name: string | null
          notes: string | null
          number: string | null
          private: boolean | null
          tenantId: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          instruments?: number[] | null
          legacyId?: number | null
          name?: string | null
          notes?: string | null
          number?: string | null
          private?: boolean | null
          tenantId?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          instruments?: number[] | null
          legacyId?: number | null
          name?: string | null
          notes?: string | null
          number?: string | null
          private?: boolean | null
          tenantId?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "public_teachers_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_group_tenants: {
        Row: {
          created_at: string
          id: number
          tenant_group: number | null
          tenant_id: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          tenant_group?: number | null
          tenant_id?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          tenant_group?: number | null
          tenant_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_group_tenants_tenant_group_fkey"
            columns: ["tenant_group"]
            isOneToOne: false
            referencedRelation: "tenant_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_group_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_groups: {
        Row: {
          created_at: string
          id: number
          name: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          name?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          name?: string | null
        }
        Relationships: []
      }
      tenants: {
        Row: {
          betaProgram: boolean
          created_at: string
          id: number
          longName: string | null
          maintainTeachers: boolean | null
          parents: boolean | null
          practiceEnd: string | null
          practiceStart: string | null
          region: string | null
          seasonStart: string | null
          shortName: string | null
          showHolidays: boolean | null
          type: string | null
          withExcuses: boolean | null
        }
        Insert: {
          betaProgram?: boolean
          created_at?: string
          id?: number
          longName?: string | null
          maintainTeachers?: boolean | null
          parents?: boolean | null
          practiceEnd?: string | null
          practiceStart?: string | null
          region?: string | null
          seasonStart?: string | null
          shortName?: string | null
          showHolidays?: boolean | null
          type?: string | null
          withExcuses?: boolean | null
        }
        Update: {
          betaProgram?: boolean
          created_at?: string
          id?: number
          longName?: string | null
          maintainTeachers?: boolean | null
          parents?: boolean | null
          practiceEnd?: string | null
          practiceStart?: string | null
          region?: string | null
          seasonStart?: string | null
          shortName?: string | null
          showHolidays?: boolean | null
          type?: string | null
          withExcuses?: boolean | null
        }
        Relationships: []
      }
      tenantUsers: {
        Row: {
          created_at: string
          email: string | null
          id: number
          parent_id: number | null
          role: number
          tenantId: number
          userId: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: number
          parent_id?: number | null
          role: number
          tenantId: number
          userId: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: number
          parent_id?: number | null
          role?: number
          tenantId?: number
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_tenantUsers_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenantUsers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      viewers: {
        Row: {
          appId: string | null
          created_at: string
          email: string | null
          firstName: string | null
          id: number
          lastName: string | null
          tenantId: number | null
        }
        Insert: {
          appId?: string | null
          created_at?: string
          email?: string | null
          firstName?: string | null
          id?: number
          lastName?: string | null
          tenantId?: number | null
        }
        Update: {
          appId?: string | null
          created_at?: string
          email?: string | null
          firstName?: string | null
          id?: number
          lastName?: string | null
          tenantId?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "public_viewers_tenantId_fkey"
            columns: ["tenantId"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_active_players_with_attendance: {
        Args: { p_tenant_id: number }
        Returns: Json
      }
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
