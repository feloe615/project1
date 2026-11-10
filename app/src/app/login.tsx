import * as Linking from 'expo-linking';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, Card, Field, Muted, Screen, Segmented } from '../components/ui';
import { authError } from '../lib/authErrors';
import { supabase } from '../lib/supabase';
import { useColors } from '../lib/theme';

type Mode = 'login' | 'signup' | 'reset';

export default function Login() {
  const c = useColors();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const submit = async () => {
    if (!supabase) return;
    setMsg(null);
    const mail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(mail)) return setMsg({ text: 'Bitte gib eine gültige E-Mail-Adresse ein.', ok: false });
    if (mode !== 'reset' && password.length < 8) return setMsg({ text: 'Das Passwort braucht mindestens 8 Zeichen.', ok: false });
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: mail, password, options: { emailRedirectTo: Linking.createURL('auth-callback') } });
        if (error) throw error;
        if (!data.session) setMsg({ text: 'Fast geschafft: Öffne den Bestätigungslink in deiner E-Mail auf diesem Handy. Danach bist du angemeldet.', ok: true });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: Linking.createURL('auth-callback', { queryParams: { next: 'reset' } }) });
        if (error) throw error;
        setMsg({ text: 'Wenn es ein Konto zu dieser E-Mail gibt, ist der Link unterwegs. Öffne ihn auf diesem Handy.', ok: true });
      }
    } catch (e) {
      setMsg({ text: authError(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, [string, string, string]> = {
    login: ['Willkommen zurück', 'Melde dich an, um deine Artikel und Zahlen zu sehen.', 'Anmelden'],
    signup: ['Konto erstellen', 'Kostenlos registrieren. Deine Daten sind nur für dich sichtbar.', 'Konto erstellen'],
    reset: ['Passwort zurücksetzen', 'Wir schicken dir einen Link per E-Mail.', 'Link senden'],
  };
  const [title, sub, cta] = titles[mode];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen>
          <View style={{ gap: 4, marginTop: 24, marginBottom: 8 }}>
            <Text style={{ fontSize: 30, fontWeight: '800', color: c.text, letterSpacing: -0.5 }}>Resell Scaler</Text>
            <Muted>Lager, Gewinne und Wachstumsplan für dein Reselling-Business.</Muted>
          </View>
          <Card>
            {mode !== 'reset' && (
              <Segmented<Mode>
                value={mode}
                onChange={(m) => { setMode(m); setMsg(null); }}
                options={[{ value: 'login', label: 'Anmelden' }, { value: 'signup', label: 'Registrieren' }]}
              />
            )}
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: c.text }}>{title}</Text>
              <Muted>{sub}</Muted>
            </View>
            <Field label="E-Mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" testID="email" />
            {mode !== 'reset' && (
              <Field
                label="Passwort (mind. 8 Zeichen)" value={password} onChangeText={setPassword} secureTextEntry
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                textContentType={mode === 'signup' ? 'newPassword' : 'password'} onSubmitEditing={submit} testID="password"
              />
            )}
            {msg && <Banner text={msg.text} tone={msg.ok ? 'good' : 'bad'} />}
            <Button title={cta} onPress={submit} loading={busy} />
            <Pressable onPress={() => { setMode(mode === 'reset' ? 'login' : 'reset'); setMsg(null); }} accessibilityRole="link">
              <Text style={{ color: c.accent, fontSize: 14 }}>{mode === 'reset' ? 'Zurück zur Anmeldung' : 'Passwort vergessen?'}</Text>
            </Pressable>
          </Card>
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
