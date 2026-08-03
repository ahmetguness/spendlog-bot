export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(message, "VALIDATION_ERROR");
  }
}
export class UnauthorizedError extends AppError {
  constructor() {
    super("Unauthorized", "UNAUTHORIZED");
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, "NOT_FOUND");
  }
}
export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, "CONFLICT");
  }
}
export class ExternalServiceError extends AppError {
  constructor(message = "External service failed") {
    super(message, "EXTERNAL_SERVICE_ERROR");
  }
}
export class DatabaseError extends AppError {
  constructor(message = "Database error") {
    super(message, "DATABASE_ERROR");
  }
}
