import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Banner, BarList, Button, Card, Kpi, Muted, Pill, Row, Screen, useToast } from '../../components/ui';
import { demoItems, eur, pct, stats } from '../../lib/calc';
import { useStore } from '../../lib/store';
import { useColors } from '../../lib/theme';

export default function Overview() {
  const c = useColors();
  const toast = useToast();
  const { items, state, loading, error, reload, saveItems } = useStore();
  const s = useMemo(() => stats(items, state), [items, state]);
  const [demoBusy, setDemoBusy] = useState(false);

  const loadDemo = async () => {
    setDemoBusy(true);
    await saveItems(demoItems(state.platforms));
    setDemoBusy(false);
    toast('40 Beispielartikel geladen. Du kannst sie unter „Mehr“ wieder löschen.');
  };

  return (
    <Screen refresh={reload} refreshing={loading}>
      {error && <Banner text={error} tone="bad" />}

      {!items.length && !loading ? (
        <Card title="Leg los">
          <Muted>Erfasse deine Einkäufe und Verkäufe. Hier siehst du dann Umsatz, Gewinn, ROI und deine besten Kategorien.</Muted>
          <Row>
            <Button title="Ersten Artikel anlegen" onPress={() => router.push('/artikel')} />
            <Button title="Beispieldaten laden" kind="ghost" onPress={loadDemo} loading={demoBusy} />
          </Row>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Kpi label="Gewinn 30 Tage" value={eur(s.profit30)} tone={s.profit30 >= 0 ? 'good' : 'bad'} />
        <Kpi label="Gewinn gesamt" value={eur(s.profit)} tone={s.profit >= 0 ? 'good' : 'bad'} />
        <Kpi label="Umsatz gesamt" value={eur(s.revenue)} />
        <Kpi label="ROI" value={s.cost ? pct((s.profit / s.cost) * 100) : '–'} />
        <Kpi label="Marge" value={s.revenue ? pct((s.profit / s.revenue) * 100) : '–'} />
        <Kpi label="Verkauft / Lager" value={`${s.sold.length} / ${s.stock.length}`} />
        <Kpi label="Kapital im Lager" value={eur(s.stockValue)} />
        <Kpi label="Ø Tage bis Verkauf" value={s.sold.length ? s.avgDays.toFixed(0) : '–'} />
      </View>
      {state.settings.fixed > 0 && <Muted>„Gewinn 30 Tage“ ist nach Abzug von {eur(state.settings.fixed)} Fixkosten.</Muted>}

      <Card title="Gewinn pro Monat">
        <BarList rows={s.byMonth} format={eur} empty="Noch keine Verkäufe erfasst." />
      </Card>
      <Card title="Gewinn nach Plattform">
        <BarList rows={s.byPlatform} format={eur} empty="Noch keine Verkäufe erfasst." />
      </Card>
      <Card title="Beste Kategorien">
        <Muted>Ø Gewinn je Verkauf, in Klammern die Anzahl.</Muted>
        <BarList rows={s.byCategory} format={eur} empty="Noch keine Verkäufe erfasst." />
      </Card>
      <Card title={`Ladenhüter (über ${state.settings.oldDays} Tage)`}>
        {s.old.length ? (
          <>
            <Muted>{eur(s.old.reduce((a, r) => a + r.it.buy, 0))} gebundenes Kapital. Tipp: Preis senken, neu einstellen oder im Bundle verkaufen.</Muted>
            {s.old.slice(0, 8).map((r) => (
              <View key={r.it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: c.text, flex: 1 }} numberOfLines={1} onPress={() => router.push({ pathname: '/artikel', params: { id: r.it.id } })}>{r.it.name}</Text>
                <Pill text={`${r.age} Tage`} tone="warn" />
                <Text style={{ color: c.text, width: 80, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{eur(r.it.buy)}</Text>
              </View>
            ))}
          </>
        ) : (
          <Muted>Keine Ladenhüter.</Muted>
        )}
      </Card>
    </Screen>
  );
}
