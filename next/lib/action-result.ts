export type ActionResult<T, C extends string> =
  | Readonly<{ ok: true; data: T }>
  | Readonly<{ ok: false; code: C; message: string }>;
