import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Banner, Button } from '../components/ui';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';

// Ziel der Links aus Bestätigungs- und Passwort-Mails (resellscaler://auth-callback?code=…)
export default function AuthCallback() {
  const c = useColors();
  const params = useLocalSearchParams<{ code?: string; next?: string; error_description?: string }>();
  const { setRecovering } = useStore();
  const [err, setErr] = useState<string | null>(params.error_description ?? null);

  useEffect(() => {
    if (!supabase || !params.code) {
      if (!params.error_description) router.replace('/');
      return;
    }
    supabase.auth.exchangeCodeForSession(params.code).then(({ error }) => {
      if (error) return setErr('Der Link ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.');
      if (params.next === 'reset') setRecovering(true);
      router.replace('/');
    });
  }, [params.code, params.next, params.error_description, setRecovering]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: c.bg }}>
      {err ? (
        <>
          <Banner text={err} tone="bad" />
          <Button title="Zur Anmeldung" onPress={() => router.replace('/')} />
        </>
      ) : (
        <ActivityIndicator color={c.accent} />
      )}
    </View>
  );
}
