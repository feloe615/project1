import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, Card, Field, Screen } from '../components/ui';
import { authError } from '../lib/authErrors';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';

export default function NewPassword() {
  const c = useColors();
  const { setRecovering } = useStore();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!supabase) return;
    if (pw.length < 8) return setErr('Das Passwort braucht mindestens 8 Zeichen.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(authError(error));
    setRecovering(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen>
        <Card title="Neues Passwort festlegen">
          <Field label="Neues Passwort (mind. 8 Zeichen)" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          {err && <Banner text={err} tone="bad" />}
          <Button title="Passwort speichern" onPress={save} loading={busy} />
        </Card>
      </Screen>
    </SafeAreaView>
  );
}
