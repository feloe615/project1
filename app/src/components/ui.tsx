import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../lib/theme';

/* ---------- Bestätigen (Alert auf Handy, confirm im Web) ---------- */
export function confirmAsync(title: string, message: string, ok = 'OK', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Abbrechen', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <SafeAreaView edges={['bottom']} pointerEvents="none" style={styles.toastWrap}>
          <View style={[styles.toast, { backgroundColor: c.text }]}>
            <Text style={{ color: c.bg, fontSize: 14 }}>{msg}</Text>
          </View>
        </SafeAreaView>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- Layout ---------- */
export function Screen({ children, refresh, refreshing }: { children: React.ReactNode; refresh?: () => void; refreshing?: boolean }) {
  const c = useColors();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={refresh ? <RefreshControl refreshing={!!refreshing} onRefresh={refresh} tintColor={c.accent} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ title, children, style, right }: { title?: string; children: React.ReactNode; style?: ViewStyle; right?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }, style]}>
      {(title || right) && (
        <View style={styles.cardHead}>
          {title ? <Text style={[styles.h2, { color: c.text }]}>{title}</Text> : <View />}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  const c = useColors();
  return <Text style={[{ color: c.muted, fontSize: 13, lineHeight: 19 }, style]}>{children}</Text>;
}

export function Banner({ text, tone = 'warn' }: { text: string; tone?: 'warn' | 'bad' | 'good' }) {
  const c = useColors();
  const bg = tone === 'bad' ? c.badSoft : tone === 'good' ? c.goodSoft : c.warnSoft;
  const fg = tone === 'bad' ? c.bad : tone === 'good' ? c.good : c.text;
  return <View style={[styles.banner, { backgroundColor: bg }]}><Text style={{ color: fg, fontSize: 14, lineHeight: 20 }}>{text}</Text></View>;
}

/* ---------- Eingaben ---------- */
export function Field({ label, hint, style, ...props }: TextInputProps & { label: string; hint?: string; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[styles.input, { color: c.text, backgroundColor: c.input, borderColor: c.line }]}
      />
      {hint ? <Text style={{ color: c.muted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

export function NumField(props: Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'> & { label: string; value: string; onChange: (v: string) => void; hint?: string; style?: ViewStyle }) {
  const { value, onChange, ...rest } = props;
  return <Field {...rest} value={value} onChangeText={(t) => onChange(t.replace(/[^0-9.,-]/g, ''))} keyboardType="decimal-pad" inputMode="decimal" />;
}

/** Zahlenfeld mit eigenem Text-Zustand: Komma-Eingaben bleiben erhalten, gespeichert wird die Zahl. */
export function NumCommit({ initial, onCommit, ...rest }: Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'> & { label: string; initial: number; onCommit: (n: number) => void; hint?: string; style?: ViewStyle }) {
  const [text, setText] = useState(String(initial).replace('.', ','));
  return <NumField {...rest} value={text} onChange={(t) => { setText(t); const n = parseFloat(t.replace(',', '.')); onCommit(Number.isFinite(n) ? n : 0); }} />;
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.row, style]}>
      {React.Children.map(children, (ch) => (ch ? <View style={styles.rowCell}>{ch}</View> : null))}
    </View>
  );
}

export function Button({ title, onPress, kind = 'primary', small, disabled, loading, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; small?: boolean; disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  const c = useColors();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn, small && styles.btnSmall,
        { backgroundColor: primary ? c.accent : 'transparent', borderColor: primary ? c.accent : c.line, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={primary ? c.onAccent : c.accent} /> : (
        <Text style={{ color: primary ? c.onAccent : kind === 'danger' ? c.bad : c.text, fontWeight: '600', fontSize: small ? 13 : 15 }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={[styles.seg, { backgroundColor: c.input, borderColor: c.line }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segBtn, active && { backgroundColor: c.card }]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <Text style={{ color: active ? c.text : c.muted, fontWeight: active ? '600' : '400', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- Anzeige ---------- */
export function Pill({ text, tone = 'accent' }: { text: string; tone?: 'accent' | 'good' | 'warn' | 'bad' }) {
  const c = useColors();
  const map = { accent: [c.accentSoft, c.accent], good: [c.goodSoft, c.good], warn: [c.warnSoft, c.warn], bad: [c.badSoft, c.bad] } as const;
  const [bg, fg] = map[tone];
  return <View style={[styles.pill, { backgroundColor: bg }]}><Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{text}</Text></View>;
}

export function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const c = useColors();
  return (
    <View style={[styles.kpi, { backgroundColor: c.card, borderColor: c.line }]}>
      <Text style={[styles.kpiLabel, { color: c.muted }]} numberOfLines={2}>{label}</Text>
      <Text style={[styles.kpiValue, { color: tone === 'good' ? c.good : tone === 'bad' ? c.bad : c.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

export function BarList({ rows, format, empty }: { rows: { label: string; value: number }[]; format: (n: number) => string; empty: string }) {
  const c = useColors();
  if (!rows.length) return <Muted style={{ textAlign: 'center', paddingVertical: 12 }}>{empty}</Muted>;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r, i) => (
        <View key={r.label + i} style={styles.barRow}>
          <Text style={{ color: c.text, fontSize: 13, width: 104 }} numberOfLines={1}>{r.label}</Text>
          <View style={{ flex: 1 }}>
            <View style={{ height: 12, borderRadius: 4, backgroundColor: r.value < 0 ? c.bad : c.accent, width: `${Math.max(2, (Math.abs(r.value) / max) * 100)}%` }} />
          </View>
          <Text style={{ color: c.text, fontSize: 13, width: 84, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{format(r.value)}</Text>
        </View>
      ))}
    </View>
  );
}

export function KV({ k, v, tone }: { k: string; v: string; tone?: 'good' | 'bad' }) {
  const c = useColors();
  return (
    <View style={styles.kv}>
      <Text style={{ color: c.muted, fontSize: 14, flex: 1 }}>{k}</Text>
      <Text style={{ color: tone === 'good' ? c.good : tone === 'bad' ? c.bad : c.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{v}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { padding: 16, gap: 14, paddingBottom: 40 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h2: { fontSize: 17, fontWeight: '700' },
  banner: { borderRadius: 10, padding: 12 },
  field: { gap: 4 },
  rowCell: { flexGrow: 1, flexBasis: 140, minWidth: 0 },
  label: { fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 11 : 8, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' },
  btn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingHorizontal: 12, paddingVertical: 7 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  kpi: { flexGrow: 1, flexBasis: '45%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 2 },
  kpiLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 2 },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 70, alignItems: 'center', paddingHorizontal: 16 },
  toast: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, maxWidth: 480 },
});
