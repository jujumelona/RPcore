import * as zod from 'zod';

const z = (zod as Record<string, unknown>).z ?? (zod as any);

export * from 'zod';
export { z };

export function parse(schema: any, data: any) {
  if (schema && typeof schema.parse === 'function') {
    return schema.parse(data);
  }
  const maybeParse = (zod as Record<string, unknown>).parse;
  if (typeof maybeParse === 'function') {
    return maybeParse(schema, data);
  }
  return data;
}

export function toJSONSchema(_schema: any) {
  // Best-effort fallback to keep runtime stable when zod v4 is unavailable.
  return {};
}

export default z;
