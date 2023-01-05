export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[]

export interface Database {
  public: {
    Tables: {
      attendance: {
        Row: {
          id: number
          created_at: string | null
          date: string | null
          players: Json | null
          conductors: Json | null
          excused: string[] | null
          criticalPlayers: number[]
          type: string
          notes: string | null
          typeInfo: string | null
          playerNotes: Json | null
        }
        Insert: {
          id?: number
          created_at?: string | null
          date?: string | null
          players?: Json | null
          conductors?: Json | null
          excused?: string[] | null
          criticalPlayers?: number[]
          type?: string
          notes?: string | null
          typeInfo?: string | null
          playerNotes?: Json | null
        }
        Update: {
          id?: number
          created_at?: string | null
          date?: string | null
          players?: Json | null
          conductors?: Json | null
          excused?: string[] | null
          criticalPlayers?: number[]
          type?: string
          notes?: string | null
          typeInfo?: string | null
          playerNotes?: Json | null
        }
      }
      conductors: {
        Row: {
          id: number
          created_at: string | null
          firstName: string | null
          lastName: string | null
          birthday: string | null
          isInactive: boolean | null
          joined: string | null
          left: string | null
        }
        Insert: {
          id?: number
          created_at?: string | null
          firstName?: string | null
          lastName?: string | null
          birthday?: string | null
          isInactive?: boolean | null
          joined?: string | null
          left?: string | null
        }
        Update: {
          id?: number
          created_at?: string | null
          firstName?: string | null
          lastName?: string | null
          birthday?: string | null
          isInactive?: boolean | null
          joined?: string | null
          left?: string | null
        }
      }
      history: {
        Row: {
          id: number
          created_at: string | null
          name: string | null
          date: string | null
          conductor: number | null
          songId: number | null
        }
        Insert: {
          id?: number
          created_at?: string | null
          name?: string | null
          date?: string | null
          conductor?: number | null
          songId?: number | null
        }
        Update: {
          id?: number
          created_at?: string | null
          name?: string | null
          date?: string | null
          conductor?: number | null
          songId?: number | null
        }
      }
      instruments: {
        Row: {
          id: number
          created_at: string | null
          name: string | null
          tuning: string
          range: string | null
          notes: string | null
          clefs: string[] | null
        }
        Insert: {
          id?: number
          created_at?: string | null
          name?: string | null
          tuning?: string
          range?: string | null
          notes?: string | null
          clefs?: string[] | null
        }
        Update: {
          id?: number
          created_at?: string | null
          name?: string | null
          tuning?: string
          range?: string | null
          notes?: string | null
          clefs?: string[] | null
        }
      }
      meetings: {
        Row: {
          id: number
          created_at: string | null
          date: string
          attendees: number[]
          notes: string | null
        }
        Insert: {
          id?: number
          created_at?: string | null
          date?: string
          attendees?: number[]
          notes?: string | null
        }
        Update: {
          id?: number
          created_at?: string | null
          date?: string
          attendees?: number[]
          notes?: string | null
        }
      }
      player: {
        Row: {
          id: number
          created_at: string | null
          firstName: string | null
          lastName: string | null
          birthday: string | null
          playsSince: string | null
          joined: string | null
          isLeader: boolean | null
          hasTeacher: boolean | null
          instrument: number | null
          notes: string | null
          isInactive: boolean | null
          left: string | null
          teacher: number | null
          isCritical: boolean | null
          lastSolve: string | null
          correctBirthday: boolean
          paused: boolean | null
          history: Json[]
          criticalReason: number | null
          otherExercise: string | null
          otherOrchestras: string[]
        }
        Insert: {
          id?: number
          created_at?: string | null
          firstName?: string | null
          lastName?: string | null
          birthday?: string | null
          playsSince?: string | null
          joined?: string | null
          isLeader?: boolean | null
          hasTeacher?: boolean | null
          instrument?: number | null
          notes?: string | null
          isInactive?: boolean | null
          left?: string | null
          teacher?: number | null
          isCritical?: boolean | null
          lastSolve?: string | null
          correctBirthday?: boolean
          paused?: boolean | null
          history?: Json[]
          criticalReason?: number | null
          otherExercise?: string | null
          otherOrchestras?: string[]
        }
        Update: {
          id?: number
          created_at?: string | null
          firstName?: string | null
          lastName?: string | null
          birthday?: string | null
          playsSince?: string | null
          joined?: string | null
          isLeader?: boolean | null
          hasTeacher?: boolean | null
          instrument?: number | null
          notes?: string | null
          isInactive?: boolean | null
          left?: string | null
          teacher?: number | null
          isCritical?: boolean | null
          lastSolve?: string | null
          correctBirthday?: boolean
          paused?: boolean | null
          history?: Json[]
          criticalReason?: number | null
          otherExercise?: string | null
          otherOrchestras?: string[]
        }
      }
      songs: {
        Row: {
          id: number
          created_at: string | null
          name: string | null
          number: number | null
          withChoir: boolean | null
          link: string | null
        }
        Insert: {
          id?: number
          created_at?: string | null
          name?: string | null
          number?: number | null
          withChoir?: boolean | null
          link?: string | null
        }
        Update: {
          id?: number
          created_at?: string | null
          name?: string | null
          number?: number | null
          withChoir?: boolean | null
          link?: string | null
        }
      }
      teachers: {
        Row: {
          id: number
          created_at: string | null
          name: string | null
          notes: string | null
          instruments: number[] | null
          number: string | null
          private: boolean | null
        }
        Insert: {
          id?: number
          created_at?: string | null
          name?: string | null
          notes?: string | null
          instruments?: number[] | null
          number?: string | null
          private?: boolean | null
        }
        Update: {
          id?: number
          created_at?: string | null
          name?: string | null
          notes?: string | null
          instruments?: number[] | null
          number?: string | null
          private?: boolean | null
        }
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
  }
}
