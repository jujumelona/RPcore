// src/utils/fuzzySearch.ts
// ══════════════════════════════
// Fuse.js 기반 공용 퍼지 검색 유틸리티
//
// v1.0: 다국어 문자열 정규화 + 공용 검색 래퍼 추가
// ══════════════════════════════

import Fuse from 'fuse.js';

export interface FuzzySearchField<T> {
  name: string;
  weight?: number;
  getValue: (_item: T) => string | string[] | null | undefined;
}

interface SearchDocument<T> {
  __item: T;
  [key: string]: T | string | string[];
}

export interface FuzzySearchOptions {
  limit?: number;
  threshold?: number;
  minMatchCharLength?: number;
}

function normalizeLatinDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

export function normalizeSearchText(value: string): string {
  return normalizeLatinDiacritics(value.normalize('NFKC'))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeFieldValue(value: string | string[] | null | undefined): string | string[] {
  if (Array.isArray(value)) {
    return value
      .map(entry => normalizeSearchText(entry))
      .filter(entry => entry.length > 0);
  }

  return normalizeSearchText(value ?? '');
}

function buildSearchDocuments<T>(
  items: T[],
  fields: Array<FuzzySearchField<T>>,
): Array<SearchDocument<T>> {
  return items.map(item => {
    const document: SearchDocument<T> = { __item: item };

    fields.forEach(field => {
      document[field.name] = normalizeFieldValue(field.getValue(item));
    });

    return document;
  });
}

function fieldContainsQuery(value: string | string[], query: string): boolean {
  if (Array.isArray(value)) {
    return value.some(entry => entry.includes(query));
  }

  return value.includes(query);
}

function uniqueItems<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function fuzzySearch<T>(
  items: T[],
  query: string,
  fields: Array<FuzzySearchField<T>>,
  options?: FuzzySearchOptions,
): T[] {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return items;
  }

  if (items.length === 0 || fields.length === 0) {
    return [];
  }

  const documents = buildSearchDocuments(items, fields);
  const fuse = new Fuse(documents, {
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: options?.minMatchCharLength ?? 2,
    shouldSort: true,
    threshold: options?.threshold ?? 0.34,
    keys: fields.map(field => ({
      name: field.name,
      weight: field.weight,
    })),
  });

  const fuseMatches = fuse
    .search(normalizedQuery, options?.limit ? { limit: options.limit } : undefined)
    .map(result => result.item.__item);

  const containsMatches = documents
    .filter(document =>
      fields.some(field => fieldContainsQuery(
        document[field.name] as string | string[],
        normalizedQuery,
      )))
    .map(document => document.__item);

  const merged = uniqueItems([...fuseMatches, ...containsMatches]);
  return typeof options?.limit === 'number' ? merged.slice(0, options.limit) : merged;
}
