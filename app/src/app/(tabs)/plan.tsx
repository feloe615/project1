import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, KV, Muted, NumField, Row, Screen } from '../../components/ui';
import { CHECKLIST, eur, goalPlan, num, simulate, stats } from '../../lib/calc';
import { useStore } from '../../lib/store';
import { useColors } from '../../lib/theme';

const s2 = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export default function Plan() {
  const c = useColors();
  const { items, state, updateState } = useStore();
  const st = useMemo(() => stats(items, state), [items, state]);

  const [goal, setGoal] = useState('2000');
  const [avgProfit, setAvgProfit] = useState('20');
  const [avgBuy, setAvgBuy] = useState('15');
  const [dayCount, setDayCount] = useState('30');
  const [minutes, setMinutes] = useState('25');
  const [sellThrough, setSellThrough] = useState('80');

  const [cap, setCap] = useState('500');
  const [roi, setRoi] = useState('80');
  const [turns, setTurns] = useState('1');
  const [reinv, setReinv] = useState('60');
  const [max, setMax] = useState('5000');
  const [months, setMonths] = useState('12');

  // Einmalig aus echten Verkäufen vorbefüllen (ab 3 Verkäufen)
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || st.sold.length < 3) return;
    prefilled.current = true;
    setAvgProfit(s2(st.profit / st.sold.length));
    setAvgBuy(s2(st.cost / st.sold.length));
    setDayCount(String(Math.max(1, Math.round(st.avgDays))));
    if (st.cost > 0) setRoi(String(Math.round((st.profit / st.cost) * 100)));
  }, [st]);

  const g = goalPlan({ goal: num(goal), avgProfit: num(avgProfit), avgBuy: num(avgBuy), days: num(dayCount), minutes: num(minutes), sellThrough: num(sellThrough), fixed: num(state.settings.fixed) });
  const sim = simulate({ capital: num(cap), roi: num(roi), turns: num(turns), reinvest: num(reinv), max: num(max), months: num(months) });
  const simMax = Math.max(...sim.data.map((d) => d.profit), 1);

  const total = CHECKLIST.reduce((a, [, l]) => a + l.length, 0);
  const done = Object.values(state.checks).filter(Boolean).length;
  const toggle = (k: string) => updateState({ checks: { ...state.checks, [k]: !state.checks[k] } });

  return (
    <Screen>
      <Card title="Ziel rückwärts rechnen">
        <Muted>{st.sold.length >= 3 ? 'Vorbefüllt aus deinen Verkäufen. Du kannst alles anpassen.' : 'Ab 3 Verkäufen werden die Werte aus deinen Daten vorbefüllt.'}</Muted>
        <NumField label="Ziel-Gewinn pro Monat (€)" value={goal} onChange={setGoal} />
        <Row>
          <NumField label="Ø Gewinn je Verkauf (€)" value={avgProfit} onChange={setAvgProfit} />
          <NumField label="Ø Einkaufspreis (€)" value={avgBuy} onChange={setAvgBuy} />
        </Row>
        <Row>
          <NumField label="Ø Tage bis Verkauf" value={dayCount} onChange={setDayCount} />
          <NumField label="Minuten pro Artikel" value={minutes} onChange={setMinutes} />
        </Row>
        <NumField label="Verkaufsquote (%)" value={sellThrough} onChange={setSellThrough} hint="Anteil der eingestellten Artikel, die sich verkaufen." />
        {g ? (
          <View style={{ backgroundColor: c.accentSoft, borderRadius: 10, padding: 12, gap: 4 }}>
            <Text style={{ color: c.text, fontWeight: '700', marginBottom: 4 }}>Für {eur(num(goal))} pro Monat brauchst du:</Text>
            <KV k="Verkäufe pro Monat" v={`${g.salesM} (≈ ${g.salesW.toLocaleString("de-DE", { maximumFractionDigits: 1 })}/Woche)`} />
            <KV k="Neue Artikel pro Monat" v={String(g.listM)} />
            <KV k="Artikel dauerhaft im Lager" v={String(g.stockNeeded)} />
            <KV k="Gebundenes Kapital" v={eur(g.capital)} />
            <KV k="Arbeit pro Woche" v={`${g.hoursW.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Std.`} />
            <KV k="Verdienst pro Stunde" v={eur(g.hourly)} />
            <Muted style={{ marginTop: 6 }}>
              {g.hoursW > 20
                ? 'Über 20 Std./Woche: Lager Fotos und Versand aus oder kauf höherpreisige Artikel ein, damit du pro Stunde mehr verdienst.'
                : 'Größter Hebel: Ein höherer Ø Gewinn je Artikel senkt Zeit- und Kapitalbedarf am stärksten.'}
            </Muted>
          </View>
        ) : (
          <Muted>Der Ø Gewinn je Verkauf muss größer als 0 sein.</Muted>
        )}
      </Card>

      <Card title="Wachstum mit Reinvestition">
        <Row>
          <NumField label="Startkapital (€)" value={cap} onChange={setCap} />
          <NumField label="ROI je Umschlag (%)" value={roi} onChange={setRoi} />
        </Row>
        <Row>
          <NumField label="Umschläge pro Monat" value={turns} onChange={setTurns} />
          <NumField label="Reinvestieren (%)" value={reinv} onChange={setReinv} />
        </Row>
        <Row>
          <NumField label="Max. Kapital (€)" value={max} onChange={setMax} hint="Grenze durch Zeit oder Lagerplatz" />
          <NumField label="Monate (1–36)" value={months} onChange={setMonths} />
        </Row>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 3, marginTop: 6 }} accessibilityLabel="Monatsgewinn und Entnahme je Monat">
          {sim.data.map((d) => (
            <View key={d.m} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
              <View style={{ height: `${(d.profit / simMax) * 100}%`, backgroundColor: c.accent, borderTopLeftRadius: 3, borderTopRightRadius: 3, justifyContent: 'flex-end', overflow: 'hidden' }}>
                <View style={{ height: d.profit ? `${(d.take / d.profit) * 100}%` : 0, backgroundColor: c.good }} />
              </View>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Legend color={c.accent} text="Gewinn/Monat" />
          <Legend color={c.good} text="davon entnommen" />
        </View>
        <KV k={`Kapital nach ${sim.data.length} Monaten`} v={eur(sim.capital)} />
        <KV k="Monatsgewinn am Ende" v={eur(sim.data[sim.data.length - 1].profit)} tone="good" />
        <KV k="Insgesamt entnommen" v={eur(sim.taken)} />
        {sim.capped && <Muted>Kapitallimit erreicht. Ab hier wächst nur noch die Entnahme. Um weiter zu wachsen, brauchst du mehr Lagerplatz, Zeit oder Hilfe.</Muted>}
      </Card>

      <Card title="Fahrplan zum Skalieren" right={<Text style={{ color: c.muted }}>{done} von {total}</Text>}>
        <View style={{ height: 8, backgroundColor: c.line, borderRadius: 99, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${(done / total) * 100}%`, backgroundColor: c.good }} />
        </View>
        {CHECKLIST.map(([title, list], si) => (
          <View key={title} style={{ gap: 2 }}>
            <Text style={{ color: c.text, fontWeight: '700', marginTop: 8, marginBottom: 4 }}>{title}</Text>
            {list.map((t, i) => {
              const k = `s${si}_${i}`;
              const on = !!state.checks[k];
              return (
                <Pressable key={k} onPress={() => toggle(k)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: c.line }}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? c.good : c.muted} />
                  <Text style={{ color: on ? c.muted : c.text, flex: 1, fontSize: 15, lineHeight: 21, textDecorationLine: on ? 'line-through' : 'none' }}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ color: c.muted, fontSize: 12 }}>{text}</Text>
    </View>
  );
}
