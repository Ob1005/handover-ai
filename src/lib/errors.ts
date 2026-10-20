export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "INVALID_INPUT",
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return Response.json(
      { error: error.message, code: error.code },
      {
        status: error.status,
        headers: {
          "Cache-Control": "no-store",
          ...(error.status === 429 ? { "Retry-After": "60" } : {}),
        },
      },
    );
  return Response.json(
    {
      error:
        "Noe gikk galt under behandlingen. Prøv igjen med mindre dokumenter.",
      code: "INTERNAL_ERROR",
    },
    { status: 500 },
  );
}
