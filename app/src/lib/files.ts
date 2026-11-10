import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Datei erzeugen und über das Teilen-Menü anbieten (Speichern, Mail, Drive …). */
export async function shareTextFile(filename: string, text: string, mimeType: string) {
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mimeType }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Teilen ist auf diesem Gerät nicht verfügbar.');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}

/** Textdatei auswählen und Inhalt lesen. null = abgebrochen. */
export async function pickTextFile(types: string[]): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0] as DocumentPicker.DocumentPickerAsset & { file?: Blob };
  if (Platform.OS === 'web') return asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
  return await new File(asset.uri).text();
}
