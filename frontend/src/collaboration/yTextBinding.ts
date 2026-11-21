import * as Y from 'yjs';
import type { SectionKey } from '../types/domain';
import { SECTION_ORDER } from '../utils/status';

export function ensureSectionText(doc: Y.Doc, key: SectionKey): Y.Text {
  const map = doc.getMap<Y.Text>('sections');
  let text = map.get(key);
  if (!text) {
    text = new Y.Text();
    map.set(key, text);
  }
  return text;
}

export function sectionSnapshot(doc: Y.Doc): Record<SectionKey, string> {
  const map = doc.getMap<Y.Text>('sections');
  const result = {} as Record<SectionKey, string>;
  SECTION_ORDER.forEach((key) => {
    result[key] = map.get(key)?.toString() ?? '';
  });
  return result;
}

/** 根据公共前后缀计算最小编辑区间，避免整段替换导致协作者内容丢失。 */
export function applyTextChange(yText: Y.Text, current: string, next: string): void {
  if (current === next) return;
  let prefix = 0;
  while (prefix < current.length && prefix < next.length && current[prefix] === next[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < current.length - prefix &&
    suffix < next.length - prefix &&
    current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const removed = current.length - prefix - suffix;
  const inserted = next.slice(prefix, next.length - suffix);
  if (removed > 0) yText.delete(prefix, removed);
  if (inserted) yText.insert(prefix, inserted);
}

export function replaceText(yText: Y.Text, next: string): void {
  if (yText.toString() === next) return;
  if (yText.length > 0) yText.delete(0, yText.length);
  if (next) yText.insert(0, next);
}
