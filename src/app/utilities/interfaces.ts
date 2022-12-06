export interface Person {
    id?: number;
    created_at?: string;
    lastName: string;
    firstName: string;
    birthday: string;
    joined: string;
    isPresent?: boolean;
    isInactive?: boolean;
    left?: string;
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
    teacher?: number;
    teacherName?: string;
    isCritical: boolean;
    lastSolve?: string;
}

export interface Instrument {
    id?: number;
    created_at?: string;
    name: string;
    tuning?: string;
    notes?: string;
    range?: string;
    count?: number;
    clefs?: string[];
    clefText?: string;
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
    excused?: string[];
}

export interface Song {
    id?: number;
    created_at?: string;
    name: string;
    number: number;
    withChoir: boolean;
    lastSung?: string;
    link?: string;
    conductor?: string;
}

export interface PersonAttendance {
    id: number;
    date: string;
    attended: boolean;
    text: string;
}

export interface History {
    id?: number;
    created_at?: string;
    date: string;
    songId: number;
    number?: number;
    name?: string;
    conductor: number;
    conductorName?: string;
}

export interface Teacher {
    id?: number;
    created_at?: string;
    name: string;
    instruments: number[];
    notes: string;
    insNames?: string;
    number: string;
    private: boolean;
}
