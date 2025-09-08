// lib/types.ts
export type Json =
  | null | boolean | number | string | Json[] | { [key: string]: Json };

export type Snapshot<T = Json> = { rev: number; state: T };

export type PageMeta = { id: string; title: string };

export type Dict = Record<string, unknown>;
