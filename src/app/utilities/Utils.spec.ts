/**
 * Utils Unit Tests
 *
 * This file demonstrates how to write unit tests for utility functions
 * using Vitest. It tests pure functions without complex dependencies.
 */
import { describe, it, expect } from 'vitest';
import { Utils } from './Utils';
import { AttendanceStatus } from './constants';
import { PersonAttendance } from './interfaces';

describe('Utils', () => {
    describe('getId', () => {
        it('should return a number', () => {
            const id = Utils.getId();
            expect(typeof id).toBe('number');
        });

        it('should return a number in the expected range', () => {
            const id = Utils.getId();
            expect(id).toBeGreaterThanOrEqual(1000000000);
            expect(id).toBeLessThanOrEqual(999999999999);
        });

        it('should return different values on consecutive calls', () => {
            const id1 = Utils.getId();
            const id2 = Utils.getId();
            expect(id1).not.toBe(id2);
        });
    });

    describe('getPercentage', () => {
        it('should return 0 for empty array', () => {
            const result = Utils.getPercentage([]);
            expect(result).toBe(0);
        });

        it('should return 100 when all are present', () => {
            const attendances: Partial<PersonAttendance>[] = [
                { status: AttendanceStatus.Present },
                { status: AttendanceStatus.Present },
                { status: AttendanceStatus.Present },
            ];
            const result = Utils.getPercentage(attendances as PersonAttendance[]);
            expect(result).toBe(100);
        });

        it('should return 0 when all are absent', () => {
            const attendances: Partial<PersonAttendance>[] = [
                { status: AttendanceStatus.Absent },
                { status: AttendanceStatus.Absent },
            ];
            const result = Utils.getPercentage(attendances as PersonAttendance[]);
            expect(result).toBe(0);
        });

        it('should count Late as present', () => {
            const attendances: Partial<PersonAttendance>[] = [
                { status: AttendanceStatus.Late },
                { status: AttendanceStatus.Absent },
            ];
            const result = Utils.getPercentage(attendances as PersonAttendance[]);
            expect(result).toBe(50);
        });

        it('should count LateExcused as present', () => {
            const attendances: Partial<PersonAttendance>[] = [
                { status: AttendanceStatus.LateExcused },
                { status: AttendanceStatus.Absent },
            ];
            const result = Utils.getPercentage(attendances as PersonAttendance[]);
            expect(result).toBe(50);
        });

        it('should not count Excused as present', () => {
            const attendances: Partial<PersonAttendance>[] = [
                { status: AttendanceStatus.Present },
                { status: AttendanceStatus.Excused },
            ];
            const result = Utils.getPercentage(attendances as PersonAttendance[]);
            expect(result).toBe(50);
        });

        it('should round the percentage', () => {
            const attendances: Partial<PersonAttendance>[] = [
                { status: AttendanceStatus.Present },
                { status: AttendanceStatus.Present },
                { status: AttendanceStatus.Absent },
            ];
            // 2/3 = 66.666...% should round to 67
            const result = Utils.getPercentage(attendances as PersonAttendance[]);
            expect(result).toBe(67);
        });
    });

    describe('getClefText', () => {
        it('should return correct text for bass clef', () => {
            const result = Utils.getClefText('f');
            expect(result).toBe('Bassschlüssel');
        });

        it('should return correct text for treble clef', () => {
            const result = Utils.getClefText('g');
            expect(result).toBe('Violinschlüssel');
        });

        it('should return correct text for alto clef', () => {
            const result = Utils.getClefText('c');
            expect(result).toBe('Altschlüssel');
        });
    });
});
