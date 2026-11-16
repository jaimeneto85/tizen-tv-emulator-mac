export const UNKNOWN_ERR = 9999;
export const INDEX_SIZE_ERR = 1;
export const DOMSTRING_SIZE_ERR = 2;
export const HIERARCHY_REQUEST_ERR = 3;
export const WRONG_DOCUMENT_ERR = 4;
export const INVALID_CHARACTER_ERR = 5;
export const NO_DATA_ALLOWED_ERR = 6;
export const NO_MODIFICATION_ALLOWED_ERR = 7;
export const NOT_FOUND_ERR = 8;
export const NOT_SUPPORTED_ERR = 9;
export const INUSE_ATTRIBUTE_ERR = 10;
export const INVALID_STATE_ERR = 11;
export const SYNTAX_ERR = 12;
export const INVALID_MODIFICATION_ERR = 13;
export const NAMESPACE_ERR = 14;
export const INVALID_ACCESS_ERR = 15;
export const VALIDATION_ERR = 16;
export const TYPE_MISMATCH_ERR = 17;
export const SECURITY_ERR = 18;
export const NETWORK_ERR = 19;
export const ABORT_ERR = 20;
export const URL_MISMATCH_ERR = 21;
export const QUOTA_EXCEEDED_ERR = 22;
export const TIMEOUT_ERR = 23;
export const INVALID_NODE_TYPE_ERR = 24;
export const DATA_CLONE_ERR = 25;
export const INVALID_VALUES_ERR = 26;
export const IO_ERR = 27;
export const SERVICE_NOT_AVAILABLE_ERR = 28;

const ERROR_NAMES: Record<number, string> = {
    [INDEX_SIZE_ERR]: 'IndexSizeError',
    [DOMSTRING_SIZE_ERR]: 'DOMStringSizeError',
    [HIERARCHY_REQUEST_ERR]: 'HierarchyRequestError',
    [WRONG_DOCUMENT_ERR]: 'WrongDocumentError',
    [INVALID_CHARACTER_ERR]: 'InvalidCharacterError',
    [NO_DATA_ALLOWED_ERR]: 'NoDataAllowedError',
    [NO_MODIFICATION_ALLOWED_ERR]: 'NoModificationAllowedError',
    [NOT_FOUND_ERR]: 'NotFoundError',
    [NOT_SUPPORTED_ERR]: 'NotSupportedError',
    [INUSE_ATTRIBUTE_ERR]: 'InuseAttributeError',
    [INVALID_STATE_ERR]: 'InvalidStateError',
    [SYNTAX_ERR]: 'SyntaxError',
    [INVALID_MODIFICATION_ERR]: 'InvalidModificationError',
    [NAMESPACE_ERR]: 'NamespaceError',
    [INVALID_ACCESS_ERR]: 'InvalidAccessError',
    [VALIDATION_ERR]: 'ValidationError',
    [TYPE_MISMATCH_ERR]: 'TypeMismatchError',
    [SECURITY_ERR]: 'SecurityError',
    [NETWORK_ERR]: 'NetworkError',
    [ABORT_ERR]: 'AbortError',
    [URL_MISMATCH_ERR]: 'URLMismatchError',
    [QUOTA_EXCEEDED_ERR]: 'QuotaExceededError',
    [TIMEOUT_ERR]: 'TimeoutError',
    [INVALID_NODE_TYPE_ERR]: 'InvalidNodeTypeError',
    [DATA_CLONE_ERR]: 'DataCloneError',
    [INVALID_VALUES_ERR]: 'InvalidValuesError',
    [IO_ERR]: 'IOError',
    [SERVICE_NOT_AVAILABLE_ERR]: 'ServiceNotAvailableError'
};

const ERROR_MESSAGES: Record<number, string> = {
    [INDEX_SIZE_ERR]: 'The index is not in the allowed range',
    [DOMSTRING_SIZE_ERR]: 'The string size is invalid',
    [HIERARCHY_REQUEST_ERR]: 'The operation would yield an incorrect node tree',
    [WRONG_DOCUMENT_ERR]: 'The object is in the wrong document',
    [INVALID_CHARACTER_ERR]: 'The string contains invalid characters',
    [NO_DATA_ALLOWED_ERR]: 'No data is allowed in nodes of this type',
    [NO_MODIFICATION_ALLOWED_ERR]: 'The object can not be modified',
    [NOT_FOUND_ERR]: 'The object can not be found here',
    [NOT_SUPPORTED_ERR]: 'The operation is not supported',
    [INUSE_ATTRIBUTE_ERR]: 'The attribute is already in use elsewhere',
    [INVALID_STATE_ERR]: 'The object is in an invalid state',
    [SYNTAX_ERR]: 'The string did not match the expected pattern',
    [INVALID_MODIFICATION_ERR]: 'The object can not be modified in this way',
    [NAMESPACE_ERR]: 'The operation is not allowed by namespaces in profiles',
    [INVALID_ACCESS_ERR]: 'The object does not support the operation or argument',
    [VALIDATION_ERR]: 'The operation is insecure',
    [TYPE_MISMATCH_ERR]: 'The type of an object was incompatible with the expected type',
    [SECURITY_ERR]: 'The operation is insecure',
    [NETWORK_ERR]: 'A network error occurred',
    [ABORT_ERR]: 'The operation was aborted',
    [URL_MISMATCH_ERR]: 'The given URL does not match another URL',
    [QUOTA_EXCEEDED_ERR]: 'The quota has been exceeded',
    [TIMEOUT_ERR]: 'The operation timed out',
    [INVALID_NODE_TYPE_ERR]: 'The supplied node is invalid',
    [DATA_CLONE_ERR]: 'The object can not be cloned',
    [INVALID_VALUES_ERR]: 'The given values are invalid',
    [IO_ERR]: 'An I/O error occurred',
    [SERVICE_NOT_AVAILABLE_ERR]: 'The service is not available'
};

function normalizeCode(code: unknown): number {
    return typeof code === 'number' && !Number.isNaN(code) ? code : UNKNOWN_ERR;
}

export class WebAPIException extends Error {
    readonly code: number;

    constructor(code: unknown = UNKNOWN_ERR, message?: string, name?: string) {
        const normalized = normalizeCode(code);
        super(message !== undefined ? message : ERROR_MESSAGES[normalized] || 'Unknown error');
        this.code = normalized;
        const resolvedName = name !== undefined ? name : ERROR_NAMES[normalized] || 'UnknownError';
        Object.defineProperty(this, 'name', { value: resolvedName, writable: false, configurable: false });
    }
}

export class WebAPIError {
    readonly code: number;
    readonly message: string;
    readonly name: string;

    constructor(code: unknown, message?: string, name?: string) {
        const normalized = normalizeCode(code);
        this.code = normalized;
        this.message = message !== undefined ? message : ERROR_MESSAGES[normalized] || 'Unknown error';
        this.name = name !== undefined ? name : ERROR_NAMES[normalized] || 'UnknownError';
        Object.freeze(this);
    }
}

const CONSTANT_ENTRIES: ReadonlyArray<readonly [string, number]> = [
    ['UNKNOWN_ERR', UNKNOWN_ERR],
    ['INDEX_SIZE_ERR', INDEX_SIZE_ERR],
    ['DOMSTRING_SIZE_ERR', DOMSTRING_SIZE_ERR],
    ['HIERARCHY_REQUEST_ERR', HIERARCHY_REQUEST_ERR],
    ['WRONG_DOCUMENT_ERR', WRONG_DOCUMENT_ERR],
    ['INVALID_CHARACTER_ERR', INVALID_CHARACTER_ERR],
    ['NO_DATA_ALLOWED_ERR', NO_DATA_ALLOWED_ERR],
    ['NO_MODIFICATION_ALLOWED_ERR', NO_MODIFICATION_ALLOWED_ERR],
    ['NOT_FOUND_ERR', NOT_FOUND_ERR],
    ['NOT_SUPPORTED_ERR', NOT_SUPPORTED_ERR],
    ['INUSE_ATTRIBUTE_ERR', INUSE_ATTRIBUTE_ERR],
    ['INVALID_STATE_ERR', INVALID_STATE_ERR],
    ['SYNTAX_ERR', SYNTAX_ERR],
    ['INVALID_MODIFICATION_ERR', INVALID_MODIFICATION_ERR],
    ['NAMESPACE_ERR', NAMESPACE_ERR],
    ['INVALID_ACCESS_ERR', INVALID_ACCESS_ERR],
    ['VALIDATION_ERR', VALIDATION_ERR],
    ['TYPE_MISMATCH_ERR', TYPE_MISMATCH_ERR],
    ['SECURITY_ERR', SECURITY_ERR],
    ['NETWORK_ERR', NETWORK_ERR],
    ['ABORT_ERR', ABORT_ERR],
    ['URL_MISMATCH_ERR', URL_MISMATCH_ERR],
    ['QUOTA_EXCEEDED_ERR', QUOTA_EXCEEDED_ERR],
    ['TIMEOUT_ERR', TIMEOUT_ERR],
    ['INVALID_NODE_TYPE_ERR', INVALID_NODE_TYPE_ERR],
    ['DATA_CLONE_ERR', DATA_CLONE_ERR],
    ['INVALID_VALUES_ERR', INVALID_VALUES_ERR],
    ['IO_ERR', IO_ERR],
    ['SERVICE_NOT_AVAILABLE_ERR', SERVICE_NOT_AVAILABLE_ERR]
];

for (const [constantName, constantValue] of CONSTANT_ENTRIES) {
    Object.defineProperty(WebAPIException, constantName, { value: constantValue });
    Object.defineProperty(WebAPIException.prototype, constantName, { get: () => constantValue });
}

export function webAPIErrorFor(exception: WebAPIException): WebAPIError {
    return new WebAPIError(exception.code, exception.message, exception.name);
}

export function throwTypeMismatch(): never {
    throw new WebAPIException(TYPE_MISMATCH_ERR);
}

export function expectString(value: unknown): string {
    if (typeof value !== 'string') {
        throwTypeMismatch();
    }
    return value;
}

export function expectNonEmptyString(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
        throwTypeMismatch();
    }
    return value;
}

export function expectNumber(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throwTypeMismatch();
    }
    return value;
}

export function expectBoolean(value: unknown): boolean {
    if (typeof value !== 'boolean') {
        throwTypeMismatch();
    }
    return value;
}

export function expectFunction<T extends Function>(value: unknown): T {
    if (typeof value !== 'function') {
        throwTypeMismatch();
    }
    return value as T;
}

export function expectOptionalFunction<T extends Function>(value: unknown): T | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    return expectFunction<T>(value);
}

export function expectArray(value: unknown): unknown[] {
    if (!Array.isArray(value)) {
        throwTypeMismatch();
    }
    return value;
}

export function expectObject(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throwTypeMismatch();
    }
    return value as Record<string, unknown>;
}

export function deliverError(errorCallback: unknown, error: WebAPIException): void {
    const callback = expectOptionalFunction<(error: WebAPIError) => void>(errorCallback);
    if (callback) {
        callback(webAPIErrorFor(error));
    }
}
