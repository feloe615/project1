import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Banner, Button, Card, confirmAsync, Field, KV, Muted, NumField, Row, Screen, useToast } from '../components/ui';
import { calcItem, eur, isDate, Item, newId, num, pct, today } from '../lib/calc';
import { useStore } from '../lib/store';
import { useColors } from '../lib/theme';

const str = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

export default function ItemEditor() {
  const c = useColors();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { items, state, saveItem, deleteItem } = useStore();
  const existing = items.find((i) => i.id === id);

  const [name, setName] = useState(existing?.name ?? '');
  const [cat, setCat] = useState(existing?.cat ?? '');
  const [src, setSrc] = useState(existing?.src ?? '');
  const [buy, setBuy] = useState(str(existing?.buy));
  const [buyDate, setBuyDate] = useState(existing?.buyDate || today());
  const [plat, setPlat] = useState(existing?.plat || state.platforms[0]?.name || '');
  const [sold, setSold] = useState(existing ? existing.sell != null : false);
  const [sell, setSell] = useState(str(existing?.sell));
  const [sellDate, setSellDate] = useState(existing?.sellDate || today());
  const [ship, setShip] = useState(str(existing?.ship ?? 0));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cats = useMemo(() => [...new Set(items.map((i) => i.cat).filter(Boolean))].slice(0, 12), [items]);
  const draft: Item = {
    id: existing?.id ?? newId(), name: name.trim(), cat: cat.trim(), src: src.trim(), buy: num(buy), buyDate,
    plat, sell: sold ? num(sell) : null, sellDate: sold ? sellDate : '', ship: num(ship),
  };
  const preview = calcItem(draft, state.platforms);

  const save = async () => {
    if (!draft.name) return setErr('Bitte gib einen Artikelnamen ein.');
    if (!isDate(buyDate)) return setErr('Einkaufsdatum bitte im Format JJJJ-MM-TT eingeben, z. B. 2026-11-10.');
    if (sold && sell.trim() === '') return setErr('Bitte gib den Verkaufspreis ein oder schalte „Verkauft“ aus.');
    if (sold && !isDate(sellDate)) return setErr('Verkaufsdatum bitte im Format JJJJ-MM-TT eingeben.');
    setBusy(true);
    await saveItem(draft);
    setBusy(false);
    toast(existing ? 'Gespeichert' : 'Artikel angelegt');
    router.back();
  };

  const remove = async () => {
    if (!existing) return;
    if (!(await confirmAsync('Artikel löschen?', `„${existing.name}“ wird endgültig gelöscht.`, 'Löschen', true))) return;
    await deleteItem(existing.id);
    toast('Gelöscht');
    router.back();
  };

  const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: active ? c.accent : c.line, backgroundColor: active ? c.accentSoft : 'transparent' }}>
      <Text style={{ color: active ? c.accent : c.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: existing ? 'Artikel bearbeiten' : 'Neuer Artikel' }} />
      <Screen>
        <Card title="Einkauf">
          <Field label="Artikel" value={name} onChangeText={setName} placeholder="z. B. Nike Air Max 90, Gr. 43" testID="f_name" />
          <Field label="Kategorie" value={cat} onChangeText={setCat} placeholder="z. B. Sneaker" />
          {cats.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {cats.map((k) => <Chip key={k} label={k} active={k === cat} onPress={() => setCat(k)} />)}
            </ScrollView>
          )}
          <Field label="Einkaufsquelle" value={src} onChangeText={setSrc} placeholder="z. B. Flohmarkt" />
          <Row>
            <NumField label="Einkaufspreis (€)" value={buy} onChange={setBuy} placeholder="0,00" testID="f_buy" />
            <Field label="Einkaufsdatum" value={buyDate} onChangeText={setBuyDate} placeholder="JJJJ-MM-TT" />
          </Row>
        </Card>

        <Card title="Verkauf">
          <Text style={{ color: c.muted, fontSize: 13 }}>Plattform</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {state.platforms.map((p) => <Chip key={p.name} label={p.name} active={p.name === plat} onPress={() => setPlat(p.name)} />)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 16 }}>Verkauft</Text>
            <Switch value={sold} onValueChange={setSold} trackColor={{ true: c.accent, false: c.line }} testID="f_sold" />
          </View>
          {sold && (
            <Row>
              <NumField label="Verkaufspreis (€)" value={sell} onChange={setSell} placeholder="0,00" testID="f_sell" />
              <Field label="Verkaufsdatum" value={sellDate} onChangeText={setSellDate} placeholder="JJJJ-MM-TT" />
            </Row>
          )}
          <NumField label="Versand und Verpackung (€)" value={ship} onChange={setShip} placeholder="0,00" />
        </Card>

        {sold && (
          <Card title="Ergebnis">
            <KV k="Gebühren" v={eur(preview.fees)} />
            <KV k="Gewinn" v={eur(preview.profit)} tone={preview.profit >= 0 ? 'good' : 'bad'} />
            <KV k="ROI" v={pct(preview.roi)} />
            <KV k="Tage bis Verkauf" v={String(preview.age)} />
          </Card>
        )}
        {!sold && draft.buy > 0 && <Muted>Liegt seit {preview.age} Tagen im Lager.</Muted>}

        {err && <Banner text={err} tone="bad" />}
        <Button title="Speichern" onPress={save} loading={busy} />
        {existing && <Button title="Artikel löschen" kind="danger" onPress={remove} />}
      </Screen>
    </KeyboardAvoidingView>
  );
}
