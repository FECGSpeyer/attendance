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
          conductors: Json | null
          created_at: string | null
          criticalPlayers: number[]
          date: string | null
          excused: string[] | null
          id: number
          img: string | null
          notes: string | null
          plan: Json | null
          playerNotes: Json | null
          players: Json | null
          type: string
          typeInfo: string | null
        }
        Insert: {
          conductors?: Json | null
          created_at?: string | null
          criticalPlayers?: number[]
          date?: string | null
          excused?: string[] | null
          id?: number
          img?: string | null
          notes?: string | null
          plan?: Json | null
          playerNotes?: Json | null
          players?: Json | null
          type?: string
          typeInfo?: string | null
        }
        Update: {
          conductors?: Json | null
          created_at?: string | null
          criticalPlayers?: number[]
          date?: string | null
          excused?: string[] | null
          id?: number
          img?: string | null
          notes?: string | null
          plan?: Json | null
          playerNotes?: Json | null
          players?: Json | null
          type?: string
          typeInfo?: string | null
        }
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
        }
      }
      history: {
        Row: {
          conductor: number | null
          created_at: string | null
          date: string | null
          id: number
          name: string | null
          songId: number | null
        }
        Insert: {
          conductor?: number | null
          created_at?: string | null
          date?: string | null
          id?: number
          name?: string | null
          songId?: number | null
        }
        Update: {
          conductor?: number | null
          created_at?: string | null
          date?: string | null
          id?: number
          name?: string | null
          songId?: number | null
        }
      }
      instruments: {
        Row: {
          clefs: string[] | null
          created_at: string | null
          id: number
          name: string | null
          notes: string | null
          range: string | null
          tuning: string
        }
        Insert: {
          clefs?: string[] | null
          created_at?: string | null
          id?: number
          name?: string | null
          notes?: string | null
          range?: string | null
          tuning?: string
        }
        Update: {
          clefs?: string[] | null
          created_at?: string | null
          id?: number
          name?: string | null
          notes?: string | null
          range?: string | null
          tuning?: string
        }
      }
      meetings: {
        Row: {
          attendees: number[]
          created_at: string | null
          date: string
          id: number
          notes: string | null
        }
        Insert: {
          attendees?: number[]
          created_at?: string | null
          date?: string
          id?: number
          notes?: string | null
        }
        Update: {
          attendees?: number[]
          created_at?: string | null
          date?: string
          id?: number
          notes?: string | null
        }
      }
      player: {
        Row: {
          appId: string | null
          birthday: string | null
          correctBirthday: boolean
          created_at: string | null
          criticalReason: number | null
          email: string | null
          firstName: string | null
          hasTeacher: boolean | null
          history: Json[]
          id: number
          img: string | null
          instrument: number | null
          isCritical: boolean | null
          isLeader: boolean | null
          joined: string | null
          lastName: string | null
          lastSolve: string | null
          left: string | null
          notes: string | null
          otherExercise: string | null
          otherOrchestras: string[]
          paused: boolean | null
          playsSince: string | null
          teacher: number | null
          testResult: string | null
        }
        Insert: {
          appId?: string | null
          birthday?: string | null
          correctBirthday?: boolean
          created_at?: string | null
          criticalReason?: number | null
          email?: string | null
          firstName?: string | null
          hasTeacher?: boolean | null
          history?: Json[]
          id?: number
          img?: string | null
          instrument?: number | null
          isCritical?: boolean | null
          isLeader?: boolean | null
          joined?: string | null
          lastName?: string | null
          lastSolve?: string | null
          left?: string | null
          notes?: string | null
          otherExercise?: string | null
          otherOrchestras?: string[]
          paused?: boolean | null
          playsSince?: string | null
          teacher?: number | null
          testResult?: string | null
        }
        Update: {
          appId?: string | null
          birthday?: string | null
          correctBirthday?: boolean
          created_at?: string | null
          criticalReason?: number | null
          email?: string | null
          firstName?: string | null
          hasTeacher?: boolean | null
          history?: Json[]
          id?: number
          img?: string | null
          instrument?: number | null
          isCritical?: boolean | null
          isLeader?: boolean | null
          joined?: string | null
          lastName?: string | null
          lastSolve?: string | null
          left?: string | null
          notes?: string | null
          otherExercise?: string | null
          otherOrchestras?: string[]
          paused?: boolean | null
          playsSince?: string | null
          teacher?: number | null
          testResult?: string | null
        }
      }
      songs: {
        Row: {
          created_at: string | null
          id: number
          link: string | null
          name: string | null
          number: number | null
          withChoir: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          link?: string | null
          name?: string | null
          number?: number | null
          withChoir?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: number
          link?: string | null
          name?: string | null
          number?: number | null
          withChoir?: boolean | null
        }
      }
      teachers: {
        Row: {
          created_at: string | null
          id: number
          instruments: number[] | null
          name: string | null
          notes: string | null
          number: string | null
          private: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          instruments?: number[] | null
          name?: string | null
          notes?: string | null
          number?: string | null
          private?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: number
          instruments?: number[] | null
          name?: string | null
          notes?: string | null
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
