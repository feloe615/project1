import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider, useToast } from '../components/ui';
import { StoreProvider, useStore } from '../lib/store';
import { isConfigured, supabase } from '../lib/supabase';
import { useColors, useIsDark } from '../lib/theme';

function Navigator() {
  const c = useColors();
  const { session, authReady, recovering } = useStore();
  const configured = !!supabase;
  if (!authReady) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.accent} /></View>;
  }
  const signedIn = !!session;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
        headerStyle: { backgroundColor: c.card },
        headerTintColor: c.accent,
        headerTitleStyle: { color: c.text },
      }}
    >
      <Stack.Protected guard={!configured}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
      <Stack.Protected guard={configured && !signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && recovering}>
        <Stack.Screen name="neues-passwort" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !recovering}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="artikel" options={{ presentation: 'modal', headerShown: true, title: 'Artikel' }} />
      </Stack.Protected>
      <Stack.Screen name="auth-callback" />
    </Stack>
  );
}

function WithStore() {
  const toast = useToast();
  return (
    <StoreProvider onError={toast}>
      <Navigator />
    </StoreProvider>
  );
}

export default function RootLayout() {
  const dark = useIsDark();
  void isConfigured;
  return (
    <SafeAreaProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ToastProvider>
        <WithStore />
      </ToastProvider>
    </SafeAreaProvider>
  );
}
