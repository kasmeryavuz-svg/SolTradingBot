export class MlError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MlError';
  }
}

export class MlTrainingError extends MlError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MlTrainingError';
  }
}
