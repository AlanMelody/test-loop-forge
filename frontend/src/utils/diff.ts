export type DiffKind = 'equal' | 'added' | 'removed';

export interface DiffSegment {
  kind: DiffKind;
  text: string;
}

/** 基于公共前后缀的最小差异，足以区分新增与删除，且对人工编辑保留原文。 */
export function diffText(before: string, after: string): DiffSegment[] {
  if (before === after) return before ? [{ kind: 'equal', text: before }] : [];

  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const segments: DiffSegment[] = [];
  if (prefix > 0) segments.push({ kind: 'equal', text: before.slice(0, prefix) });
  const removed = before.slice(prefix, before.length - suffix);
  const added = after.slice(prefix, after.length - suffix);
  if (removed) segments.push({ kind: 'removed', text: removed });
  if (added) segments.push({ kind: 'added', text: added });
  if (suffix > 0) segments.push({ kind: 'equal', text: before.slice(before.length - suffix) });
  return segments;
}
