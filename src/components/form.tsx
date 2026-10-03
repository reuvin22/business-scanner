import { CameraView, type BarcodeType } from 'expo-camera'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Choice } from '@/lib/api'
import { base, useColors } from '@/lib/theme'
import CameraGate from './CameraGate'

// Small building blocks for the phone's forms (the product form mirrors the web app's)

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const colors = useColors()
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Text style={{ color: colors.heading, fontSize: 17, fontWeight: '800' }}>{title}</Text>
      {!!hint && <Text style={{ color: colors.muted, fontSize: 13, marginTop: -6 }}>{hint}</Text>}
      {children}
    </View>
  )
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  multiline,
  required,
  hint,
  flex,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  keyboardType?: KeyboardTypeOptions
  multiline?: boolean
  required?: boolean
  hint?: string
  flex?: boolean
}) {
  const colors = useColors()
  return (
    <View style={[{ gap: 6 }, flex && { flex: 1 }]}>
      <Text style={{ color: colors.heading, fontWeight: '700' }}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        style={[
          base.input,
          { backgroundColor: colors.page, borderColor: colors.line, color: colors.heading },
          multiline && { minHeight: 80, textAlignVertical: 'top' },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCorrect={!keyboardType}
      />
      {!!hint && <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text>}
    </View>
  )
}

/** A few choices, shown as buttons (e.g. status, price type). */
export function Chips({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Choice[]
  onChange: (value: string) => void
}) {
  const colors = useColors()
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.heading, fontWeight: '700' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => {
          const on = option.value === value
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.chip, { borderColor: on ? colors.accent : colors.line, backgroundColor: on ? colors.accent : colors.page }]}
            >
              <Text style={{ color: on ? '#fff' : colors.heading, fontWeight: '600' }}>{option.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** One choice from a longer list (e.g. category, brand), in a searchable sheet. */
export function Select({
  label,
  value,
  options,
  onChange,
  emptyLabel = 'None',
}: {
  label: string
  value: string
  options: Choice[]
  onChange: (value: string) => void
  emptyLabel?: string
}) {
  const colors = useColors()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const shown = useMemo(
    () => [{ value: '', label: emptyLabel }, ...options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))],
    [options, search, emptyLabel],
  )
  const current = options.find((o) => o.value === value)?.label ?? emptyLabel
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.heading, fontWeight: '700' }}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={[base.input, { backgroundColor: colors.page, borderColor: colors.line }]}>
        <Text style={{ color: value ? colors.heading : colors.muted }}>{current} ▾</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 }}>
            <Text style={{ flex: 1, color: colors.heading, fontSize: 18, fontWeight: '800' }}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Text style={{ color: colors.accent, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            style={[base.input, { marginHorizontal: 16, backgroundColor: colors.surface, borderColor: colors.line, color: colors.heading }]}
            placeholder="Search"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
          />
          <FlatList
            data={shown}
            keyExtractor={(item) => item.value || 'none'}
            contentContainerStyle={{ padding: 16, gap: 6 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item.value)
                  setOpen(false)
                  setSearch('')
                }}
                style={[styles.row, { borderColor: item.value === value ? colors.accent : colors.line, backgroundColor: colors.surface }]}
              >
                <Text style={{ color: colors.heading, fontWeight: item.value === value ? '800' : '500' }}>{item.label}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  )
}

export function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
  hint?: string
}) {
  const colors = useColors()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.heading, fontWeight: '700' }}>{label}</Text>
        {!!hint && <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent }} />
    </View>
  )
}

export function SmallButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const colors = useColors()
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[styles.chip, { borderColor: danger ? colors.danger : colors.accent }]}>
      <Text style={{ color: danger ? colors.danger : colors.accent, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  )
}

const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar']

/** A full-screen camera that reads one barcode (e.g. a variant's own barcode). */
export function ScanBarcodeModal({
  visible,
  onScanned,
  onClose,
}: {
  visible: boolean
  onScanned: (code: string) => void
  onClose: () => void
}) {
  const colors = useColors()
  const done = useRef(false)
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => (done.current = false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.side }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
          <Text style={{ flex: 1, color: '#fff', fontSize: 18, fontWeight: '800' }}>Scan the barcode</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ color: colors.lime, fontWeight: '700' }}>Close</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, margin: 16, borderRadius: 18, overflow: 'hidden' }}>
          <CameraGate>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={({ data }) => {
                if (done.current) return
                done.current = true
                onScanned(data.trim())
              }}
            />
          </CameraGate>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  section: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  row: { borderWidth: 1, borderRadius: 12, padding: 14 },
})
