import { StyleSheet, useColorScheme } from 'react-native'

// The SIRIS colors (the same as the selling app), light and dark
const light = {
  page: '#f3f3f1',
  surface: '#ffffff',
  line: '#e2e2dd',
  heading: '#1d1d1b',
  text: '#3d3d3a',
  muted: '#7a7a74',
  accent: '#2f6b5a',
  side: '#2b2b2a',
  lime: '#dcf25a',
  ink: '#1d1d1b',
  danger: '#c2413b',
  dangerSoft: '#fdecec',
  up: '#2e8b6a',
  upSoft: '#e5f4ee',
}

const dark: typeof light = {
  page: '#141413',
  surface: '#1e1e1d',
  line: '#33332f',
  heading: '#f3f3ef',
  text: '#d6d6d0',
  muted: '#9a9a92',
  accent: '#5fb597',
  side: '#0d0d0c',
  lime: '#dcf25a',
  ink: '#1d1d1b',
  danger: '#f07a72',
  dangerSoft: '#3a1614',
  up: '#5fc79f',
  upSoft: '#13291f',
}

export type Colors = typeof light

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light
}

/** Styles shared by the screens (colors are added where they are used). */
export const base = StyleSheet.create({
  screen: { flex: 1 },
  padded: { padding: 20, gap: 14 },
  title: { fontSize: 24, fontWeight: '800' },
  hint: { fontSize: 14, lineHeight: 20 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  link: { fontSize: 15, fontWeight: '600', paddingVertical: 6 },
})
