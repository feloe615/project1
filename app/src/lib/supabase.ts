import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isConfigured = /^https:\/\//.test(url) && !!anonKey && !/DEIN/.test(url + anonKey);

// Für automatisierte Tests kann ein Ersatz-Client gesetzt werden (nur Web).
const override = (globalThis as any).__sbOverride as SupabaseClient | undefined;

export const supabase: SupabaseClient | null =
  override ??
  (isConfigured
    ? createClient(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      })
    : null);

// Token nur auffrischen, solange die App im Vordergrund ist.
if (supabase && !override && Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => {
    if (s === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
