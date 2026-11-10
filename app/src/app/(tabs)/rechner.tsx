import { useState } from 'react';
import { Text, View } from 'react-native';
import { Card, Muted, NumField, Row, Screen } from '../../components/ui';
import { eur, fees, num, pct } from '../../lib/calc';
import { useStore } from '../../lib/store';
import { useColors } from '../../lib/theme';

export default function Calculator() {
  const c = useColors();
  const { state } = useStore();
  const [sell, setSell] = useState('60');
  const [buy, setBuy] = useState('15');
  const [ship, setShip] = useState('0');
  const [roi, setRoi] = useState('100');
  const S = num(sell), B = num(buy), SH = num(ship), R = num(roi);

  return (
    <Screen>
      <Card title="Lohnt sich der Einkauf?">
        <Muted>Schnell vor Ort prüfen: Was bleibt nach Gebühren und Versand übrig, und was darfst du maximal zahlen?</Muted>
        <Row>
          <NumField label="Erwarteter VK (€)" value={sell} onChange={setSell} />
          <NumField label="Einkaufspreis (€)" value={buy} onChange={setBuy} />
        </Row>
        <Row>
          <NumField label="Versand (€)" value={ship} onChange={setShip} />
          <NumField label="Ziel-ROI (%)" value={roi} onChange={setRoi} />
        </Row>
      </Card>

      {state.platforms.map((p) => {
        const f = fees(S, p.name, state.platforms);
        const profit = S - B - SH - f;
        const maxBuy = Math.max(0, (S - SH - f) / (1 + R / 100));
        const ok = B <= maxBuy;
        return (
          <View key={p.name} style={{ backgroundColor: c.card, borderColor: c.line, borderWidth: 0.5, borderRadius: 14, padding: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }}>{p.name}</Text>
              <Text style={{ color: profit >= 0 ? c.good : c.bad, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{eur(profit)}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              <Text style={{ color: c.muted, fontSize: 13 }}>Gebühren {eur(f)}</Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>Marge {S ? pct((profit / S) * 100) : '–'}</Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>ROI {B ? pct((profit / B) * 100) : '–'}</Text>
            </View>
            <Text style={{ color: ok ? c.good : c.warn, fontSize: 14 }}>
              Max. Einkaufspreis für {pct(R)} ROI: <Text style={{ fontWeight: '700' }}>{eur(maxBuy)}</Text>
            </Text>
          </View>
        );
      })}
      <Muted>Gebühren passt du unter „Mehr → Plattform-Gebühren“ an.</Muted>
    </Screen>
  );
}
