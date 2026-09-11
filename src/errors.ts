export class ArkoviaError extends Error {
  readonly code: number | undefined;
  readonly description: string | undefined;
  readonly response?: unknown;

  constructor(message: string, options: {
    code?: number | undefined;
    description?: string | undefined;
    response?: unknown;
    cause?: unknown;
  } = {}) {
    super(message, { cause: options.cause });
    this.name = "ArkoviaError";
    this.code = options.code;
    this.description = options.description;
    this.response = options.response;
  }
}

export class ArkoviaNetworkError extends ArkoviaError {
  readonly attemptedNodes: readonly string[];

  constructor(message: string, attemptedNodes: readonly string[], cause?: unknown) {
    super(message, { cause });
    this.name = "ArkoviaNetworkError";
    this.attemptedNodes = attemptedNodes;
  }
}

export class ArkoviaTimeoutError extends ArkoviaNetworkError {
  constructor(node: string, timeoutMs: number, cause?: unknown) {
    super(`Arkovia node timed out after ${timeoutMs} ms: ${node}`, [node], cause);
    this.name = "ArkoviaTimeoutError";
  }
}
