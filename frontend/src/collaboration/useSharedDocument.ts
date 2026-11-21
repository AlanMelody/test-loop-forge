import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { adapter, type ConnectionStatus, type PresenceUser } from '../adapters';
import type { RequirementDetail, SectionKey, User } from '../types/domain';
import { SECTION_ORDER } from '../utils/status';
import {
  applyTextChange,
  ensureSectionText,
  replaceText,
  sectionSnapshot,
} from './yTextBinding';

type SaveState = 'saved' | 'saving' | 'error';

function emptySections(): Record<SectionKey, string> {
  return { prd: '', technical: '', frontend: '', tests: '' };
}

export function useSharedDocument({
  requirementId,
  user,
  detail,
  onResync,
}: {
  requirementId: string;
  user: User | null;
  detail: RequirementDetail | null;
  onResync?(): void;
}) {
  const docRef = useRef<Y.Doc | null>(null);
  if (!docRef.current) docRef.current = new Y.Doc();
  const [sections, setSections] = useState<Record<SectionKey, string>>(emptySections);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const initializedRef = useRef(false);
  const localEditRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    const map = doc.getMap<Y.Text>('sections');
    const sync = () => setSections(sectionSnapshot(doc));
    map.observeDeep(sync);
    sync();
    return () => map.unobserveDeep(sync);
  }, []);

  // mock 模式从详情初始化本地 Y.Doc；real 模式内容由 Yjs 同步协议填充，避免重复插入。
  useEffect(() => {
    if (!detail || adapter.mode !== 'mock' || initializedRef.current) return;
    initializedRef.current = true;
    const doc = docRef.current;
    if (!doc) return;
    doc.transact(() => {
      SECTION_ORDER.forEach((key) => {
        replaceText(ensureSectionText(doc, key), detail.document.sections[key] ?? '');
      });
    }, 'init-from-detail');
    setSections({ ...detail.document.sections });
    localEditRef.current = false;
  }, [detail]);

  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !user) return;
    const disconnect = adapter.collaboration.connect({
      requirementId,
      doc,
      user,
      onStatusChange: setConnection,
      onPresenceChange: setPresence,
      onResync,
    });
    return () => disconnect();
  }, [requirementId, user, onResync]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const scheduleSave = useCallback(() => {
    setSaveState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveState('saved'), 250);
  }, []);

  const updateSection = useCallback(
    (key: SectionKey, next: string) => {
      const doc = docRef.current;
      if (!doc) return;
      const text = ensureSectionText(doc, key);
      const current = text.toString();
      if (current === next) return;
      localEditRef.current = true;
      doc.transact(() => applyTextChange(text, current, next), 'local-input');
      scheduleSave();
    },
    [scheduleSave],
  );

  const replaceSection = useCallback(
    (key: SectionKey, next: string) => {
      const doc = docRef.current;
      if (!doc) return;
      const text = ensureSectionText(doc, key);
      localEditRef.current = true;
      doc.transact(() => replaceText(text, next), 'ai-apply');
      scheduleSave();
    },
    [scheduleSave],
  );

  /** 冲突后重新读取：仅在 mock 模式替换本地 Y.Text，real 模式依赖 Yjs 同步。 */
  const reloadFromDetail = useCallback((next: RequirementDetail) => {
    if (adapter.mode !== 'mock' || !localEditRef.current) {
      localEditRef.current = false;
      return;
    }
    const doc = docRef.current;
    if (!doc) return;
    doc.transact(() => {
      SECTION_ORDER.forEach((key) => {
        replaceText(ensureSectionText(doc, key), next.document.sections[key] ?? '');
      });
    }, 'reload-after-conflict');
    setSections({ ...next.document.sections });
    localEditRef.current = false;
    setSaveState('saved');
  }, []);

  return {
    doc: docRef.current,
    sections,
    connection,
    presence,
    saveState,
    hasLocalEdits: localEditRef.current,
    updateSection,
    replaceSection,
    reloadFromDetail,
  };
}
