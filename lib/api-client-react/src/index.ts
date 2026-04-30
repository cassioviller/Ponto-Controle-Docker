export * from "./generated/api";
export * from "./generated/api.schemas";
export { customFetch, setBaseUrl, setAuthTokenGetter, setEmpresaId, ApiError, ResponseParseError } from "./custom-fetch";
export type { AuthTokenGetter, CustomFetchOptions, ErrorType, BodyType } from "./custom-fetch";
