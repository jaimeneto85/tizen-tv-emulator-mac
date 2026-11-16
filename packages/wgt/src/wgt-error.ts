export type WgtErrorCode = 'NOT_A_WGT' | 'INVALID_CONFIG' | 'NOT_INSTALLED' | 'UNSAFE_ENTRY';

export class WgtError extends Error {
    constructor(public readonly code: WgtErrorCode, message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'WgtError';
    }
}
