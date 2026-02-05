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

    describe('getModifiedPlayersForList - lateCount', () => {
        const createMockPlayer = (id: number, instrument: number, personAttendances: any[] = [], lastLateReset?: string): any => ({
            id,
            firstName: 'Test',
            lastName: `Player${id}`,
            instrument,
            joined: '2020-01-01',
            img: null,
            person_attendances: personAttendances,
            lastLateReset,
            additional_fields: {},
        });

        const createMockAttendance = (id: number, date: string, typeId = 1): any => ({
            id,
            date,
            type_id: typeId,
        });

        const createMockPersonAttendance = (attendanceId: number, status: AttendanceStatus): any => ({
            attendance_id: attendanceId,
            status,
        });

        const mockInstruments: any[] = [
            { id: 1, name: 'Violin', maingroup: false, tenantId: 1 },
        ];

        const mockTypes: any[] = [
            { id: 1, include_in_average: true },
        ];

        it('should count unexcused late arrivals', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const attendances = [
                createMockAttendance(1, yesterday.toISOString()),
                createMockAttendance(2, yesterday.toISOString()),
                createMockAttendance(3, yesterday.toISOString()),
            ];

            const player = createMockPlayer(1, 1, [
                createMockPersonAttendance(1, AttendanceStatus.Late),
                createMockPersonAttendance(2, AttendanceStatus.Late),
                createMockPersonAttendance(3, AttendanceStatus.Present),
            ]);

            const result = Utils.getModifiedPlayersForList(
                [player],
                mockInstruments,
                attendances,
                mockTypes
            );

            expect(result[0].lateCount).toBe(2);
        });

        it('should not count excused late arrivals in lateCount', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const attendances = [
                createMockAttendance(1, yesterday.toISOString()),
                createMockAttendance(2, yesterday.toISOString()),
            ];

            const player = createMockPlayer(1, 1, [
                createMockPersonAttendance(1, AttendanceStatus.Late),
                createMockPersonAttendance(2, AttendanceStatus.LateExcused),
            ]);

            const result = Utils.getModifiedPlayersForList(
                [player],
                mockInstruments,
                attendances,
                mockTypes
            );

            expect(result[0].lateCount).toBe(1);
        });

        it('should only count late arrivals after lastLateReset', () => {
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const attendances = [
                createMockAttendance(1, twoDaysAgo.toISOString()),
                createMockAttendance(2, yesterday.toISOString()),
            ];

            // lastLateReset is between the two attendances
            const lastLateReset = new Date();
            lastLateReset.setDate(lastLateReset.getDate() - 1);
            lastLateReset.setHours(lastLateReset.getHours() - 12);

            const player = createMockPlayer(1, 1, [
                createMockPersonAttendance(1, AttendanceStatus.Late), // Before lastLateReset
                createMockPersonAttendance(2, AttendanceStatus.Late), // After lastLateReset
            ], lastLateReset.toISOString());

            const result = Utils.getModifiedPlayersForList(
                [player],
                mockInstruments,
                attendances,
                mockTypes
            );

            // Only the late arrival after lastLateReset should be counted
            expect(result[0].lateCount).toBe(1);
        });

        it('should return 0 lateCount when no late arrivals', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const attendances = [
                createMockAttendance(1, yesterday.toISOString()),
            ];

            const player = createMockPlayer(1, 1, [
                createMockPersonAttendance(1, AttendanceStatus.Present),
            ]);

            const result = Utils.getModifiedPlayersForList(
                [player],
                mockInstruments,
                attendances,
                mockTypes
            );

            expect(result[0].lateCount).toBe(0);
        });

        it('should handle players with no attendances', () => {
            const player = createMockPlayer(1, 1, []);

            const result = Utils.getModifiedPlayersForList(
                [player],
                mockInstruments,
                [],
                mockTypes
            );

            expect(result[0].lateCount).toBe(0);
        });
    });
});
