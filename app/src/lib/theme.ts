import { useColorScheme } from 'react-native';

const light = {
  bg: '#f4f6f8', card: '#ffffff', text: '#17202b', muted: '#5a6878', line: '#dde3ea', input: '#f4f6f8',
  accent: '#1f6f6a', accentSoft: '#e2f1ef', onAccent: '#ffffff',
  good: '#1a7f45', goodSoft: '#e3f3ea', bad: '#bf3434', badSoft: '#f8e5e5', warn: '#a86d12', warnSoft: '#f7eedd',
};
const dark: typeof light = {
  bg: '#0f1418', card: '#171e24', text: '#e6ecf1', muted: '#93a1ae', line: '#28323b', input: '#0f1418',
  accent: '#4fbdb3', accentSoft: '#16302e', onAccent: '#08201e',
  good: '#4cc47e', goodSoft: '#16301f', bad: '#ff7a7a', badSoft: '#3a1c1c', warn: '#e6b450', warnSoft: '#3a2e14',
};
export type Colors = typeof light;
export const useColors = (): Colors => (useColorScheme() === 'dark' ? dark : light);
export const useIsDark = () => useColorScheme() === 'dark';
