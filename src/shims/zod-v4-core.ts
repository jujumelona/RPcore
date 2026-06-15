import * as zod from 'zod';

export const $ZodType = (zod as Record<string, unknown>).ZodType ?? (zod as Record<string, unknown>).ZodSchema ?? (zod as Record<string, unknown>).ZodTypeAny;

export type output<T> = T extends { _output: infer O } ? O : any;

export const JSONSchema = {
  JSONSchema: {} as Record<string, unknown> };

export default {
  $ZodType,
  JSONSchema };
