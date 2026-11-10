import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Button, Card, confirmAsync, Field, KV, Muted, NumCommit, Row, Screen, useToast } from '../../components/ui';
import { authError } from '../../lib/authErrors';
import { defaultState, demoItems, isUuid, Item, newId, num, parseCsv, Platform as Plat, toCsv, today, UserState } from '../../lib/calc';
import { pickTextFile, shareTextFile } from '../../lib/files';
import { useStore } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import { useColors } from '../../lib/theme';

export default function More() {
  const c = useColors();
  const toast = useToast();
  const { session, items, state, updateState, setPlatforms, saveItems, wipe } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [pw, setPw] = useState('');

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast((e as Error).message || 'Das hat nicht geklappt.'); } finally { setBusy(null); }
  };

  /* Plattformen */
  const editPlat = (i: number, patch: Partial<Plat>) => {
    const next = state.platforms.map((p, k) => (k === i ? { ...p, ...patch } : p));
    void setPlatforms(next);
  };
  const renamePlat = (i: number, oldName: string, newName: string) => {
    const name = newName.trim() || oldName;
    const next = state.platforms.map((p, k) => (k === i ? { ...p, name } : p));
    void setPlatforms(next, [oldName, name]);
  };
  const removePlat = async (i: number) => {
    if (state.platforms.length < 2) return toast('Mindestens eine Plattform muss bleiben.');
    const p = state.platforms[i];
    if (!(await confirmAsync('Plattform entfernen?', `„${p.name}“ entfernen? Bestehende Artikel behalten den Namen, werden aber ohne Gebühren gerechnet.`, 'Entfernen', true))) return;
    void setPlatforms(state.platforms.filter((_, k) => k !== i));
  };

  /* Daten */
  const importBackup = () => withBusy('backup-in', async () => {
    const text = await pickTextFile(['application/json', 'text/plain', '*/*']);
    if (text == null) return;
    let obj: Partial<UserState> & { items?: any[] };
    try { obj = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges Backup.'); }
    const d = defaultState();
    updateState({
      platforms: Array.isArray(obj.platforms) && obj.platforms.length ? obj.platforms : d.platforms,
      settings: { ...d.settings, ...(obj.settings ?? {}) },
      checks: obj.checks ?? {},
    });
    const list: Item[] = (obj.items ?? []).map((it: any) => ({
      id: isUuid(it.id) ? it.id : newId(), name: String(it.name ?? 'Ohne Namen'), cat: it.cat ?? '', src: it.src ?? '',
      buy: num(it.buy), buyDate: it.buyDate || today(), plat: it.plat ?? '',
      sell: it.sell === '' || it.sell == null ? null : num(it.sell), sellDate: it.sellDate ?? '', ship: num(it.ship),
    }));
    await saveItems(list);
    toast(`Backup geladen: ${list.length} Artikel`);
  });

  const importCsv = () => withBusy('csv-in', async () => {
    const text = await pickTextFile(['text/csv', 'text/comma-separated-values', 'text/plain', '*/*']);
    if (text == null) return;
    const list = parseCsv(text, state.platforms[0]?.name ?? '');
    await saveItems(list);
    toast(`${list.length} Artikel importiert`);
  });

  const deleteAll = async () => {
    if (!(await confirmAsync('Alle Daten löschen?', 'Alle Artikel und Einstellungen werden endgültig gelöscht. Lade vorher am besten ein Backup herunter.', 'Alles löschen', true))) return;
    await withBusy('wipe', async () => { await wipe(); toast('Alle Daten gelöscht'); });
  };

  /* Konto */
  const changePw = () => withBusy('pw', async () => {
    if (pw.length < 8) throw new Error('Das Passwort braucht mindestens 8 Zeichen.');
    const { error } = await supabase!.auth.updateUser({ password: pw });
    if (error) throw new Error(authError(error));
    setPw('');
    toast('Passwort geändert');
  });
  const logout = async () => { await supabase?.auth.signOut(); };
  const deleteAccount = async () => {
    if (!(await confirmAsync('Konto löschen?', 'Dein Konto und alle deine Daten werden endgültig gelöscht. Das kann nicht rückgängig gemacht werden.', 'Konto löschen', true))) return;
    await withBusy('del', async () => {
      const { error } = await supabase!.rpc('delete_account');
      if (error) throw new Error(`Konto konnte nicht gelöscht werden: ${error.message}`);
      await supabase!.auth.signOut();
    });
  };

  return (
    <Screen>
      <Card title="Plattform-Gebühren">
        <Muted>Beispielwerte. Gebühren ändern sich und hängen davon ab, ob du privat oder gewerblich verkaufst. Gleiche sie mit deinen aktuellen Konditionen ab.</Muted>
        {state.platforms.map((p, i) => (
          <View key={`${i}-${p.name}`} style={{ gap: 8, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: c.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                defaultValue={p.name}
                onEndEditing={Platform.OS !== 'web' ? (e) => renamePlat(i, p.name, e.nativeEvent.text) : undefined}
                onBlur={Platform.OS === 'web' ? (e: any) => { const t = e?.target?.value; if (typeof t === 'string' && t !== p.name) renamePlat(i, p.name, t); } : undefined}
                style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: '600', paddingVertical: 4 }}
                accessibilityLabel="Plattformname"
              />
              <Pressable onPress={() => removePlat(i)} accessibilityLabel={`${p.name} entfernen`} hitSlop={10}>
                <Ionicons name="trash-outline" size={20} color={c.bad} />
              </Pressable>
            </View>
            <Row>
              <NumCommit label="% vom Verkaufspreis" initial={p.pct} onCommit={(n) => editPlat(i, { pct: n })} />
              <NumCommit label="Fix je Verkauf (€)" initial={p.fix} onCommit={(n) => editPlat(i, { fix: n })} />
            </Row>
          </View>
        ))}
        <Button title="+ Plattform hinzufügen" kind="ghost" small onPress={() => setPlatforms([...state.platforms, { name: `Plattform ${state.platforms.length + 1}`, pct: 0, fix: 0 }])} />
      </Card>

      <Card title="Einstellungen">
        <Row>
          <NumCommit key={`old-${state.settings.oldDays === 60}`} label="Ladenhüter ab (Tagen)" initial={state.settings.oldDays} onCommit={(n) => updateState({ settings: { ...state.settings, oldDays: n } })} />
          <NumCommit label="Fixkosten pro Monat (€)" initial={state.settings.fixed} onCommit={(n) => updateState({ settings: { ...state.settings, fixed: n } })} hint="z. B. Software, Material" />
        </Row>
      </Card>

      <Card title="Daten">
        <KV k="Artikel in deinem Konto" v={String(items.length)} />
        <Row>
          <Button title="CSV exportieren" kind="ghost" small loading={busy === 'csv-out'} onPress={() => withBusy('csv-out', () => shareTextFile(`reselling-${today()}.csv`, toCsv(items, state.platforms), 'text/csv'))} />
          <Button title="CSV importieren" kind="ghost" small loading={busy === 'csv-in'} onPress={importCsv} />
        </Row>
        <Row>
          <Button title="Backup teilen" kind="ghost" small loading={busy === 'backup-out'} onPress={() => withBusy('backup-out', () => shareTextFile(`reselling-backup-${today()}.json`, JSON.stringify({ ...state, items }, null, 2), 'application/json'))} />
          <Button title="Backup laden" kind="ghost" small loading={busy === 'backup-in'} onPress={importBackup} />
        </Row>
        <Row>
          <Button title="Beispieldaten laden" kind="ghost" small loading={busy === 'demo'} onPress={() => withBusy('demo', async () => { await saveItems(demoItems(state.platforms)); toast('40 Beispielartikel geladen'); })} />
          <Button title="Alle Daten löschen" kind="danger" small loading={busy === 'wipe'} onPress={deleteAll} />
        </Row>
        <Muted>CSV-Spalten: name, cat, src, buy, buyDate, plat, sell, sellDate, ship (Trennzeichen Semikolon).</Muted>
      </Card>

      <Card title="Konto">
        <KV k="Angemeldet als" v={session?.user.email ?? ''} />
        <Field label="Neues Passwort (mind. 8 Zeichen)" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        <Row>
          <Button title="Passwort ändern" kind="ghost" small loading={busy === 'pw'} onPress={changePw} />
          <Button title="Abmelden" kind="ghost" small onPress={logout} />
        </Row>
        <Button title="Konto löschen" kind="danger" small loading={busy === 'del'} onPress={deleteAccount} />
      </Card>
      <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>Resell Scaler 1.0</Text>
    </Screen>
  );
}
