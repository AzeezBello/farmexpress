export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Express 5 types params as string | string[] once a handler is annotated with a custom Request type.
export function param(req: { params: Record<string, string | string[]> }, key = 'id') {
  const value = req.params[key];
  if (typeof value !== 'string' || !value) throw new HttpError(400, `Invalid ${key}`);
  return value;
}
