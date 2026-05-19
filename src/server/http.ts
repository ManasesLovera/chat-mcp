export function jsonResponse(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export function errorResponse(status: number, error: string, details?: unknown) {
  return jsonResponse(
    {
      error,
      details: details ?? null,
    },
    { status },
  );
}
