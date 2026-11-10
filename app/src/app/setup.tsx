import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'react-native';
import { Card, Muted, Screen } from '../components/ui';
import { useColors } from '../lib/theme';

export default function Setup() {
  const c = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen>
        <Text style={{ fontSize: 28, fontWeight: '700', color: c.text }}>Resell Scaler</Text>
        <Card title="Einrichtung fehlt">
          <Muted>Die App ist noch nicht mit der Datenbank verbunden.</Muted>
          <Text style={{ color: c.text, lineHeight: 22 }}>
            1. Kostenloses Projekt auf supabase.com anlegen.{'\n'}
            2. Im SQL Editor die Datei supabase/schema.sql ausführen.{'\n'}
            3. Die Datei .env.example nach .env kopieren und Project URL sowie anon public Key eintragen.{'\n'}
            4. Die App neu starten (npx expo start).
          </Text>
          <Muted>Die ausführliche Anleitung steht in ANLEITUNG.md.</Muted>
        </Card>
      </Screen>
    </SafeAreaView>
  );
}
