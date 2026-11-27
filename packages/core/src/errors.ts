export type VaultErrorCode =
  | "bad-argument"
  | "bad-magic"
  | "unsupported-version"
  | "truncated"
  | "bad-header"
  | "auth-failed"
  | "corrupt";

export class VaultError extends Error {
  readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = "VaultError";
    this.code = code;
  }
}
