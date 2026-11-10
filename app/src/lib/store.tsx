import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { defaultState, Item, num, Platform, UserState } from './calc';
import { supabase } from './supabase';

type Row = {
  id: string; user_id?: string; name: string; cat: string | null; src: string | null; buy: number | string;
  buy_date: string | null; plat: string | null; sell: number | string | null; sell_date: string | null; ship: number | string;
};

const toRow = (it: Item, uid: string): Row => ({
  id: it.id, user_id: uid, name: it.name || 'Ohne Namen', cat: it.cat || null, src: it.src || null, buy: num(it.buy),
  buy_date: it.buyDate || null, plat: it.plat || null, sell: it.sell == null ? null : num(it.sell),
  sell_date: it.sellDate || null, ship: num(it.ship),
});
const fromRow = (r: Row): Item => ({
  id: r.id, name: r.name ?? '', cat: r.cat ?? '', src: r.src ?? '', buy: num(r.buy), buyDate: r.buy_date ?? '',
  plat: r.plat ?? '', sell: r.sell == null ? null : num(r.sell), sellDate: r.sell_date ?? '', ship: num(r.ship),
});

async function run<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

type Store = {
  session: Session | null;
  authReady: boolean;
  recovering: boolean;
  setRecovering: (v: boolean) => void;
  items: Item[];
  state: UserState;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  saveItem: (it: Item) => Promise<void>;
  saveItems: (its: Item[]) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  updateState: (patch: Partial<UserState>) => void;
  setPlatforms: (p: Platform[], renamed?: [string, string]) => Promise<void>;
  wipe: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider fehlt');
  return s;
};

export function StoreProvider({ children, onError }: { children: React.ReactNode; onError: (msg: string) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [recovering, setRecovering] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [state, setState] = useState<UserState>(defaultState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = session?.user.id ?? null;
  const loadedAt = useRef(0);
  const stateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const fail = useCallback((e: unknown) => onError(`Speichern fehlgeschlagen: ${(e as Error)?.message || 'keine Verbindung'}`), [onError]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async () => {
    if (!supabase || !uid) return;
    setLoading(true);
    setError(null);
    try {
      const [rows, st] = await Promise.all([
        run(supabase.from('items').select('*').order('created_at')),
        run(supabase.from('user_settings').select('*').maybeSingle()),
      ]);
      setItems(((rows as Row[]) ?? []).map(fromRow));
      const d = defaultState();
      const s = st as Partial<UserState> | null;
      setState({
        platforms: Array.isArray(s?.platforms) && s!.platforms.length ? s!.platforms : d.platforms,
        settings: { ...d.settings, ...(s?.settings ?? {}) },
        checks: s?.checks ?? {},
      });
      loadedAt.current = Date.now();
    } catch (e) {
      setError(`Deine Daten konnten nicht geladen werden (${(e as Error).message}). Zieh die Liste nach unten, um es erneut zu versuchen.`);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (uid) reload();
    else { setItems([]); setState(defaultState()); }
  }, [uid, reload]);

  // Beim Zurückkehren in die App neu laden (Änderungen von anderen Geräten)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && uid && Date.now() - loadedAt.current > 60_000) reload();
    });
    return () => sub.remove();
  }, [uid, reload]);

  const upsert = useCallback((list: Item[]) => {
    setItems((prev) => {
      const m = new Map(prev.map((i) => [i.id, i]));
      list.forEach((i) => m.set(i.id, i));
      return [...m.values()];
    });
  }, []);

  const saveItems = useCallback(async (list: Item[]) => {
    if (!supabase || !uid || !list.length) return;
    upsert(list);
    try {
      for (let k = 0; k < list.length; k += 500) {
        await run(supabase.from('items').upsert(list.slice(k, k + 500).map((i) => toRow(i, uid))));
      }
    } catch (e) { fail(e); }
  }, [uid, upsert, fail]);

  const saveItem = useCallback((it: Item) => saveItems([it]), [saveItems]);

  const deleteItem = useCallback(async (id: string) => {
    if (!supabase) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try { await run(supabase.from('items').delete().eq('id', id)); } catch (e) { fail(e); }
  }, [fail]);

  const persistState = useCallback(() => {
    if (stateTimer.current) clearTimeout(stateTimer.current);
    stateTimer.current = setTimeout(() => {
      if (!supabase || !uid) return;
      const s = stateRef.current;
      run(supabase.from('user_settings').upsert({ user_id: uid, ...s, updated_at: new Date().toISOString() })).catch(fail);
    }, 600);
  }, [uid, fail]);

  const updateState = useCallback((patch: Partial<UserState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      stateRef.current = next;
      return next;
    });
    persistState();
  }, [persistState]);

  const setPlatforms = useCallback(async (platforms: Platform[], renamed?: [string, string]) => {
    updateState({ platforms });
    if (renamed && renamed[0] !== renamed[1]) {
      const moved = items.filter((i) => i.plat === renamed[0]).map((i) => ({ ...i, plat: renamed[1] }));
      if (moved.length) await saveItems(moved);
    }
  }, [items, saveItems, updateState]);

  const wipe = useCallback(async () => {
    if (!supabase || !uid) return;
    try {
      await run(supabase.from('items').delete().eq('user_id', uid));
      await run(supabase.from('user_settings').delete().eq('user_id', uid));
      setItems([]);
      setState(defaultState());
    } catch (e) { fail(e); }
  }, [uid, fail]);

  const value = useMemo<Store>(() => ({
    session, authReady, recovering, setRecovering, items, state, loading, error,
    reload, saveItem, saveItems, deleteItem, updateState, setPlatforms, wipe,
  }), [session, authReady, recovering, items, state, loading, error, reload, saveItem, saveItems, deleteItem, updateState, setPlatforms, wipe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
