export type TpkErrorCode =
    | 'NOT_A_TPK'
    | 'INVALID_MANIFEST'
    | 'UNSAFE_ENTRY'
    | 'TOO_LARGE'
    | 'NO_UI_APP'
    | 'NOT_DOTNET';

export class TpkError extends Error {
    constructor(public readonly code: TpkErrorCode, message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'TpkError';
    }
}
