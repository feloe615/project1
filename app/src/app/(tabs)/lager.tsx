import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Banner, Muted, Pill, Segmented } from '../../components/ui';
import { calcItem, eur, fmtDate, pct } from '../../lib/calc';
import { useStore } from '../../lib/store';
import { useColors } from '../../lib/theme';

type Filter = 'all' | 'stock' | 'sold';

export default function Inventory() {
  const c = useColors();
  const { items, state, loading, error, reload } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items
      .map((it) => ({ it, ...calcItem(it, state.platforms) }))
      .filter((r) => filter === 'all' || (filter === 'sold' ? r.sold : !r.sold))
      .filter((r) => !query || [r.it.name, r.it.cat, r.it.src, r.it.plat].join(' ').toLowerCase().includes(query))
      .sort((a, b) => (b.it.sellDate || b.it.buyDate).localeCompare(a.it.sellDate || a.it.buyDate));
  }, [items, state.platforms, filter, q]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.it.id}
        onRefresh={reload}
        refreshing={loading}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 6 }}>
            {error && <Banner text={error} tone="bad" />}
            <View style={[s.search, { backgroundColor: c.card, borderColor: c.line }]}>
              <Ionicons name="search" size={18} color={c.muted} />
              <TextInput value={q} onChangeText={setQ} placeholder="Artikel, Kategorie, Plattform…" placeholderTextColor={c.muted} style={{ flex: 1, color: c.text, fontSize: 16, paddingVertical: 8 }} />
            </View>
            <Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: 'all', label: `Alle (${items.length})` }, { value: 'stock', label: 'Im Lager' }, { value: 'sold', label: 'Verkauft' }]} />
          </View>
        }
        ListEmptyComponent={
          <Muted style={{ textAlign: 'center', paddingVertical: 32 }}>
            {items.length ? 'Keine Treffer für diese Suche.' : 'Noch keine Artikel. Tippe auf „+“, um deinen ersten Einkauf zu erfassen.'}
          </Muted>
        }
        renderItem={({ item: r }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/artikel', params: { id: r.it.id } })}
            style={({ pressed }) => [s.row, { backgroundColor: c.card, borderColor: c.line, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{r.it.name}</Text>
              <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
                {[r.it.cat, r.it.plat].filter(Boolean).join(' · ') || 'Ohne Kategorie'}
              </Text>
              <Text style={{ color: c.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                EK {eur(r.it.buy)}{r.sold ? `  →  VK ${eur(r.it.sell!)}` : `  ·  seit ${fmtDate(r.it.buyDate)}`}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              {r.sold ? (
                <>
                  <Text style={{ color: r.profit >= 0 ? c.good : c.bad, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{eur(r.profit)}</Text>
                  <Pill text={`ROI ${pct(r.roi)}`} tone="good" />
                </>
              ) : (
                <Pill text={`${r.age} T. im Lager`} tone={r.age > state.settings.oldDays ? 'warn' : 'accent'} />
              )}
            </View>
          </Pressable>
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Artikel hinzufügen"
        onPress={() => router.push('/artikel')}
        style={({ pressed }) => [s.fab, { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="add" size={30} color={c.onAccent} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  row: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
});
