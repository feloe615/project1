import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useColors } from '../../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (name: IconName) => ({ color, size }: { color: unknown; size: number }) => <Ionicons name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
        headerStyle: { backgroundColor: c.card },
        headerTitleStyle: { color: c.text, fontWeight: '700' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Übersicht', tabBarIcon: icon('stats-chart') }} />
      <Tabs.Screen name="lager" options={{ title: 'Lager', tabBarIcon: icon('cube-outline') }} />
      <Tabs.Screen name="rechner" options={{ title: 'Rechner', tabBarIcon: icon('calculator-outline') }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: icon('trending-up') }} />
      <Tabs.Screen name="mehr" options={{ title: 'Mehr', tabBarIcon: icon('settings-outline') }} />
    </Tabs>
  );
}
