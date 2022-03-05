export interface Person {
    id?: number;
    created_at?: string;
    lastName: string;
    firstName: string;
    birthday: string;
    joined: string;
    isPresent?: boolean;
    isInactive?: boolean;
}

export interface Player extends Person {
    instrument: number;
    instrumentName?: string;
    hasTeacher: boolean;
    playsSince: string;
    isLeader: boolean;
    notes: string;
    firstOfInstrument?: boolean;
    isNew?: boolean;
    instrumentLength?: number;
}

export interface Instrument {
    id?: number;
    created_at?: string;
    name: string;
    tuning?: string;
    notes?: string;
    count?: number;
}

export interface AttendanceItem {
    [props: number]: boolean;
}

export interface Attendance {
    id?: number;
    created_at?: string;
    date: string;
    isPractice: boolean;
    players?: AttendanceItem;
    conductors?: any;
    percentage?: number;
}

export interface PersonAttendance {
    id: number;
    date: string;
    attended: boolean;
}
