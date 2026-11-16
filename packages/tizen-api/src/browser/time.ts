import { TYPE_MISMATCH_ERR, WebAPIException, expectNumber, expectString } from './errors.js';

const UNIT_MS: Record<string, number> = {
    MSECS: 1,
    SECS: 1000,
    MINS: 60000,
    HOURS: 3600000,
    DAYS: 86400000
};

const AVAILABLE_TIMEZONES = [
    'UTC', 'Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Europe/London', 'Europe/Berlin',
    'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Sao_Paulo', 'Australia/Sydney'
];

function localTimezone(): string {
    if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
        const resolved = Intl.DateTimeFormat().resolvedOptions();
        if (resolved.timeZone) {
            return resolved.timeZone;
        }
    }
    const offsetMinutes = -new Date().getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absolute = Math.abs(offsetMinutes);
    return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

export class TimeDuration {
    private readonly lengthMs: number;
    readonly unit: string;

    constructor(length: unknown, unit?: unknown) {
        this.unit = unit === undefined || unit === null ? 'MSECS' : expectString(unit);
        if (!(this.unit in UNIT_MS)) {
            throw new WebAPIException(TYPE_MISMATCH_ERR, `unknown duration unit: ${this.unit}`);
        }
        const factor = UNIT_MS[this.unit] as number;
        this.lengthMs = expectNumber(length) * factor;
        Object.freeze(this);
    }

    get length(): number {
        return this.lengthMs;
    }

    difference(other: TimeDuration): TimeDuration {
        assertDuration(other);
        return new TimeDuration(this.lengthMs - other.lengthMs, 'MSECS');
    }

    equalsTo(other: TimeDuration): boolean {
        assertDuration(other);
        return this.lengthMs === other.lengthMs;
    }

    lessThan(other: TimeDuration): boolean {
        assertDuration(other);
        return this.lengthMs < other.lengthMs;
    }

    greaterThan(other: TimeDuration): boolean {
        assertDuration(other);
        return this.lengthMs > other.lengthMs;
    }
}

function assertDuration(value: unknown): asserts value is TimeDuration {
    if (!(value instanceof TimeDuration)) {
        throw new WebAPIException(TYPE_MISMATCH_ERR, 'expected TimeDuration');
    }
}

function assertTZDate(value: unknown): asserts value is TZDate {
    if (!(value instanceof TZDate)) {
        throw new WebAPIException(TYPE_MISMATCH_ERR, 'expected TZDate');
    }
}

export class TZDate {
    private date: Date;
    private timezone: string | null;

    constructor(...args: unknown[]) {
        if (args.length === 0) {
            this.date = new Date();
        } else if (args.length === 1) {
            const value = args[0];
            this.date = value instanceof TZDate ? new Date(value.date.getTime()) : new Date(value as string | number | Date);
        } else {
            const numbers = args.map((arg) => expectNumber(arg));
            const part = (i: number, fallback: number): number => {
                const value = numbers[i];
                return value === undefined ? fallback : value;
            };
            this.date = new Date(Date.UTC(
                part(0, 0),
                part(1, 0),
                part(2, 1),
                part(3, 0),
                part(4, 0),
                part(5, 0),
                part(6, 0)
            ));
            this.date = new Date(this.date.getTime() + new Date().getTimezoneOffset() * 60000);
        }
        this.timezone = null;
    }

    getDate(): number {
        return this.date.getDate();
    }

    setDate(date: unknown): void {
        this.date.setDate(expectNumber(date));
    }

    getDay(): number {
        return this.date.getDay();
    }

    getFullYear(): number {
        return this.date.getFullYear();
    }

    setFullYear(year: unknown): void {
        this.date.setFullYear(expectNumber(year));
    }

    getHours(): number {
        return this.date.getHours();
    }

    setHours(hours: unknown): void {
        this.date.setHours(expectNumber(hours));
    }

    getMilliseconds(): number {
        return this.date.getMilliseconds();
    }

    setMilliseconds(ms: unknown): void {
        this.date.setMilliseconds(expectNumber(ms));
    }

    getMinutes(): number {
        return this.date.getMinutes();
    }

    setMinutes(minutes: unknown): void {
        this.date.setMinutes(expectNumber(minutes));
    }

    getMonth(): number {
        return this.date.getMonth();
    }

    setMonth(month: unknown): void {
        this.date.setMonth(expectNumber(month));
    }

    getSeconds(): number {
        return this.date.getSeconds();
    }

    setSeconds(seconds: unknown): void {
        this.date.setSeconds(expectNumber(seconds));
    }

    getUTCDate(): number {
        return this.date.getUTCDate();
    }

    setUTCDate(date: unknown): void {
        this.date.setUTCDate(expectNumber(date));
    }

    getUTCDay(): number {
        return this.date.getUTCDay();
    }

    getUTCFullYear(): number {
        return this.date.getUTCFullYear();
    }

    setUTCFullYear(year: unknown): void {
        this.date.setUTCFullYear(expectNumber(year));
    }

    getUTCHours(): number {
        return this.date.getUTCHours();
    }

    setUTCHours(hours: unknown): void {
        this.date.setUTCHours(expectNumber(hours));
    }

    getUTCMilliseconds(): number {
        return this.date.getUTCMilliseconds();
    }

    setUTCMilliseconds(ms: unknown): void {
        this.date.setUTCMilliseconds(expectNumber(ms));
    }

    getUTCMinutes(): number {
        return this.date.getUTCMinutes();
    }

    setUTCMinutes(minutes: unknown): void {
        this.date.setUTCMinutes(expectNumber(minutes));
    }

    getUTCMonth(): number {
        return this.date.getUTCMonth();
    }

    setUTCMonth(month: unknown): void {
        this.date.setUTCMonth(expectNumber(month));
    }

    getUTCSeconds(): number {
        return this.date.getUTCSeconds();
    }

    setUTCSeconds(seconds: unknown): void {
        this.date.setUTCSeconds(expectNumber(seconds));
    }

    getTimezone(): string {
        return this.timezone || localTimezone();
    }

    toTimezone(tzid: unknown): TZDate {
        expectString(tzid);
        const copy = new TZDate(this.date.getTime());
        copy.timezone = String(tzid);
        return copy;
    }

    toLocalTimezone(): TZDate {
        const copy = new TZDate(this.date.getTime());
        copy.timezone = localTimezone();
        return copy;
    }

    toUTC(): TZDate {
        const copy = new TZDate(this.date.getTime());
        copy.timezone = 'UTC';
        return copy;
    }

    difference(other: unknown): TimeDuration {
        assertTZDate(other);
        return new TimeDuration(this.date.getTime() - other.date.getTime(), 'MSECS');
    }

    equalsTo(other: unknown): boolean {
        assertTZDate(other);
        return this.date.getTime() === other.date.getTime();
    }

    earlierThan(other: unknown): boolean {
        assertTZDate(other);
        return this.date.getTime() < other.date.getTime();
    }

    laterThan(other: unknown): boolean {
        assertTZDate(other);
        return this.date.getTime() > other.date.getTime();
    }

    addDuration(duration: unknown): TZDate {
        assertDuration(duration);
        this.date = new Date(this.date.getTime() + duration.length);
        return this;
    }

    toLocaleDateString(): string {
        return this.date.toLocaleDateString();
    }

    toLocaleTimeString(): string {
        return this.date.toLocaleTimeString();
    }

    toLocaleString(): string {
        return this.date.toLocaleString();
    }

    toDateString(): string {
        return this.date.toDateString();
    }

    toTimeString(): string {
        return this.date.toTimeString();
    }

    toString(): string {
        return this.date.toString();
    }

    getTimezoneAbbreviation(): string {
        return '';
    }

    secondsFromUTC(): number {
        return -this.date.getTimezoneOffset() * 60;
    }

    isDST(): boolean {
        return false;
    }

    getPreviousDSTTransition(): TZDate | null {
        return null;
    }

    getNextDSTTransition(): TZDate | null {
        return null;
    }

    toDate(): Date {
        return new Date(this.date.getTime());
    }
}

export function createTimeManager(): Record<string, unknown> {
    let dateTimeListener: (() => void) | null = null;
    let timezoneListener: (() => void) | null = null;

    return {
        getCurrentDateTime() {
            return new TZDate();
        },
        getLocalTimezone() {
            return localTimezone();
        },
        getAvailableTimezones() {
            return AVAILABLE_TIMEZONES.slice();
        },
        getDateFormat(shortformat?: unknown) {
            return shortformat ? 'd/m/y' : 'D, M d, y';
        },
        getTimeFormat() {
            return 'h:m:s ap';
        },
        isLeapYear(year: unknown) {
            const value = expectNumber(year);
            return (value % 4 === 0 && value % 100 !== 0) || value % 400 === 0;
        },
        setDateTimeChangeListener(callback: unknown) {
            if (typeof callback !== 'function') {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'callback must be a function');
            }
            dateTimeListener = callback as () => void;
            return undefined;
        },
        unsetDateTimeChangeListener() {
            dateTimeListener = null;
            return undefined;
        },
        setTimezoneChangeListener(callback: unknown) {
            if (typeof callback !== 'function') {
                throw new WebAPIException(TYPE_MISMATCH_ERR, 'callback must be a function');
            }
            timezoneListener = callback as () => void;
            return undefined;
        },
        unsetTimezoneChangeListener() {
            timezoneListener = null;
            return undefined;
        },
        getListenerCount() {
            return (dateTimeListener ? 1 : 0) + (timezoneListener ? 1 : 0);
        }
    };
}
