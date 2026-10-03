import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native'
import { getProductOptions, registerProduct, uploadPhoto, type Choice, type Pairing, type ProductForm } from '@/lib/api'
import { CUSTOMER_TYPES, PRICE_TYPES, PRODUCT_STATUSES, UNITS, VISIBILITIES } from '@/lib/productChoices'
import { base, useColors } from '@/lib/theme'
import { Chips, Field, ScanBarcodeModal, Section, Select, SmallButton, Toggle } from './form'

type Tier = {
  key: string
  priceType: string
  price: string
  minimumQuantity: string
  maximumQuantity: string
  customerType: string
  variantKey: string
}
type VariantRow = { key: string; variantName: string; sku: string; barcode: string; unit: string }
type Spec = { key: string; name: string; value: string }
type Photo = { imageUrl: string; mediaType: 'IMAGE' | 'VIDEO' }

let counter = 0
const newKey = (prefix: string) => `${prefix}-${Date.now()}-${++counter}`
const newTier = (priceType = 'RETAIL'): Tier => ({
  key: newKey('tier'),
  priceType,
  price: '',
  minimumQuantity: '1',
  maximumQuantity: '',
  customerType: '',
  variantKey: '',
})

/** "" -> null, "12.5" -> 12.5, "abc" -> NaN (refused) */
const toNumber = (text: string) => (text.trim() === '' ? null : Number(text.trim().replace(',', '.')))
const isBad = (value: number | null, whole = false, min = 0) =>
  value !== null && (Number.isNaN(value) || value < min || (whole && !Number.isInteger(value)))

/**
 * Registering a product on the phone, with the same details as the web app's Add product: details, photos, selling
 * prices, variants, specifications, and order rules, plus the starting stock at the connected store.
 */
export default function ProductFormPhone({
  pairing,
  barcode,
  onSaved,
  onBack,
}: {
  pairing: Pairing
  barcode: string
  onSaved: (productName: string) => void
  onBack: () => void
}) {
  const colors = useColors()
  const [options, setOptions] = useState<{ categories: Choice[]; brands: Choice[]; currency: string } | null>(null)
  const [details, setDetails] = useState({
    productName: '',
    sku: '',
    unit: 'pcs',
    categoryId: '',
    brandId: '',
    status: 'ACTIVE',
    visibility: 'PUBLIC',
    description: '',
    costPrice: '',
  })
  const [rules, setRules] = useState({ moq: '1', max: '', multiple: '1', minValue: '', leadTime: '', preorder: false })
  const [photos, setPhotos] = useState<Photo[]>([])
  const [tiers, setTiers] = useState<Tier[]>([newTier()])
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [specs, setSpecs] = useState<Spec[]>([])
  const [stock, setStock] = useState('')
  const [scanningVariant, setScanningVariant] = useState('') // the variant whose barcode is being scanned
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getProductOptions(pairing).then(setOptions, (err: Error) => setError(err.message))
  }, [pairing])

  const set = <K extends keyof typeof details>(key: K, value: (typeof details)[K]) => setDetails((d) => ({ ...d, [key]: value }))
  const updateTier = (key: string, change: Partial<Tier>) => setTiers((list) => list.map((t) => (t.key === key ? { ...t, ...change } : t)))
  const updateVariant = (key: string, change: Partial<VariantRow>) =>
    setVariants((list) => list.map((v) => (v.key === key ? { ...v, ...change } : v)))
  const updateSpec = (key: string, change: Partial<Spec>) => setSpecs((list) => list.map((s) => (s.key === key ? { ...s, ...change } : s)))

  async function addPhoto(source: 'camera' | 'library') {
    setError('')
    const permission =
      source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setError(source === 'camera' ? 'Allow the camera to take a photo.' : 'Allow the gallery to choose a photo.')
      return
    }
    const pick = source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync
    const result = await pick({ mediaTypes: ['images', 'videos'], quality: 0.7 })
    const asset = result.canceled ? null : result.assets?.[0]
    if (!asset) return
    setUploading(true)
    try {
      const type = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg')
      const name = asset.fileName ?? `product.${type.split('/')[1] ?? 'jpg'}`
      const uploaded = await uploadPhoto(pairing, { uri: asset.uri, name, type })
      setPhotos((list) => [...list, { imageUrl: uploaded.url, mediaType: uploaded.mediaType }])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  // ---- Checking and sending ------------------------------------------------------------------------------

  const cost = toNumber(details.costPrice)
  const moq = toNumber(rules.moq)
  const max = toNumber(rules.max)
  const multiple = toNumber(rules.multiple)
  const minValue = toNumber(rules.minValue)
  const leadTime = toNumber(rules.leadTime)
  const stockAmount = toNumber(stock)
  const pricedTiers = tiers.filter((t) => t.price.trim() !== '')

  function problem(): string {
    if (!details.productName.trim()) return 'Enter the product name.'
    if (isBad(cost)) return 'The cost price must be a number.'
    if (!pricedTiers.length) return 'Add at least one selling price.'
    for (const tier of pricedTiers) {
      const from = toNumber(tier.minimumQuantity)
      const to = toNumber(tier.maximumQuantity)
      if (isBad(toNumber(tier.price))) return 'Each selling price must be a number.'
      if (from === null || isBad(from, true, 1)) return 'Each price needs a "from quantity" of 1 or more.'
      if (isBad(to, true, 1) || (to !== null && to < from)) return 'A "to quantity" must be at least its "from quantity".'
    }
    if (variants.some((v) => !v.variantName.trim())) return 'Give each variant a name (or remove it).'
    if (moq === null || isBad(moq, true, 1)) return 'The minimum order quantity must be 1 or more.'
    if (multiple === null || isBad(multiple, true, 1)) return 'Order multiples must be 1 or more.'
    if (isBad(max, true, 1) || (max !== null && max < moq)) return 'The maximum order quantity must be at least the minimum.'
    if (isBad(minValue) || isBad(leadTime, true)) return 'Check the minimum order value and lead time.'
    if (isBad(stockAmount)) return 'The starting stock must be a number.'
    return ''
  }

  async function save() {
    const why = problem()
    if (why) {
      setError(why)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }
    const form: ProductForm = {
      productName: details.productName.trim(),
      sku: details.sku.trim(),
      barcode,
      unit: details.unit,
      categoryId: details.categoryId || null,
      brandId: details.brandId || null,
      status: details.status,
      visibility: details.visibility,
      description: details.description.trim(),
      costPrice: cost,
      orderRules: {
        minimumOrderQuantity: moq ?? 1,
        maximumOrderQuantity: max,
        orderMultiple: multiple ?? 1,
        minimumOrderValue: minValue,
        leadTimeDays: leadTime,
        preorderAllowed: rules.preorder,
      },
      images: photos.map((photo, i) => ({ ...photo, sortOrder: i, isPrimary: false })), // the first photo becomes the thumbnail
      specifications: specs.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), value: s.value.trim() })),
      variants: variants.map((v) => ({
        key: v.key,
        variantName: v.variantName.trim(),
        sku: v.sku.trim(),
        barcode: v.barcode.trim(),
        unit: v.unit,
      })),
      prices: pricedTiers.map((t) => ({
        priceType: t.priceType,
        price: toNumber(t.price) ?? 0,
        currency: options?.currency ?? 'PHP',
        minimumQuantity: toNumber(t.minimumQuantity) ?? 1,
        maximumQuantity: toNumber(t.maximumQuantity),
        customerType: t.customerType || null,
        variantKey: variants.some((v) => v.key === t.variantKey) ? t.variantKey : null,
      })),
      stock: variants.length ? 0 : (stockAmount ?? 0),
    }
    setError('')
    setSaving(true)
    try {
      const saved = await registerProduct(pairing, form)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      onSaved(saved.productName)
    } catch (err) {
      setError((err as Error).message)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setSaving(false)
    }
  }

  if (!options) {
    return error ? <Text style={{ color: colors.danger }}>{error}</Text> : <ActivityIndicator color={colors.accent} />
  }

  const variantChoices: Choice[] = [
    { value: '', label: 'All variants' },
    ...variants.map((v) => ({ value: v.key, label: v.variantName || 'Unnamed' })),
  ]

  return (
    <View style={{ gap: 14 }}>
      <Section title="Product details">
        <Text style={{ color: colors.muted }}>Barcode: {barcode}</Text>
        <Field
          label="Product name"
          required
          value={details.productName}
          onChange={(v) => set('productName', v)}
          placeholder="e.g. Chocolate croissant"
        />
        <Field label="SKU" value={details.sku} onChange={(v) => set('sku', v)} placeholder="e.g. CRS-CHOC-01" />
        <Chips label="Unit" value={details.unit} options={UNITS} onChange={(v) => set('unit', v)} />
        <Select label="Category" value={details.categoryId} options={options.categories} onChange={(v) => set('categoryId', v)} />
        <Select label="Brand" value={details.brandId} options={options.brands} onChange={(v) => set('brandId', v)} />
        <Chips label="Status" value={details.status} options={PRODUCT_STATUSES} onChange={(v) => set('status', v)} />
        <Chips label="Visibility" value={details.visibility} options={VISIBILITIES} onChange={(v) => set('visibility', v)} />
        <Field label="Description" multiline value={details.description} onChange={(v) => set('description', v)} />
        <Field
          label="Cost price (private)"
          keyboardType="decimal-pad"
          value={details.costPrice}
          onChange={(v) => set('costPrice', v)}
          hint="What one unit costs you. Used for profit margin; never shown to others."
        />
      </Section>

      <Section title="Photos and videos" hint="The first photo is the product's picture in lists.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((photo, i) => (
            <View key={photo.imageUrl} style={{ width: 84, gap: 4 }}>
              {photo.mediaType === 'IMAGE' ? (
                <Image source={{ uri: photo.imageUrl }} style={{ width: 84, height: 84, borderRadius: 10, backgroundColor: colors.page }} />
              ) : (
                <View
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: 10,
                    backgroundColor: colors.page,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: colors.heading }}>▶ Video</Text>
                </View>
              )}
              <SmallButton
                label={i === 0 ? 'Remove (main)' : 'Remove'}
                danger
                onPress={() => setPhotos((list) => list.filter((_, j) => j !== i))}
              />
            </View>
          ))}
        </View>
        {uploading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SmallButton label="📷 Take photo" onPress={() => addPhoto('camera')} />
            <SmallButton label="🖼 From gallery" onPress={() => addPhoto('library')} />
          </View>
        )}
      </Section>

      <Section title="Selling prices" hint={`In ${options.currency}. A price can be for a quantity range or one kind of buyer.`}>
        {tiers.map((tier, i) => (
          <View key={tier.key} style={{ gap: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.line, paddingTop: i ? 12 : 0 }}>
            <Chips
              label="Price type"
              value={tier.priceType}
              options={PRICE_TYPES}
              onChange={(v) => updateTier(tier.key, { priceType: v })}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field
                flex
                label="Price"
                required
                keyboardType="decimal-pad"
                value={tier.price}
                onChange={(v) => updateTier(tier.key, { price: v })}
                placeholder="0.00"
              />
              <Field
                flex
                label="From qty"
                keyboardType="number-pad"
                value={tier.minimumQuantity}
                onChange={(v) => updateTier(tier.key, { minimumQuantity: v })}
              />
              <Field
                flex
                label="To qty"
                keyboardType="number-pad"
                value={tier.maximumQuantity}
                onChange={(v) => updateTier(tier.key, { maximumQuantity: v })}
                placeholder="No limit"
              />
            </View>
            <Select
              label="For"
              value={tier.customerType}
              options={CUSTOMER_TYPES.slice(1)}
              emptyLabel="Everyone"
              onChange={(v) => updateTier(tier.key, { customerType: v })}
            />
            {variants.length > 0 && (
              <Select
                label="Variant"
                value={tier.variantKey}
                options={variantChoices.slice(1)}
                emptyLabel="All variants"
                onChange={(v) => updateTier(tier.key, { variantKey: v })}
              />
            )}
            {tiers.length > 1 && (
              <SmallButton label="Remove this price" danger onPress={() => setTiers((list) => list.filter((t) => t.key !== tier.key))} />
            )}
          </View>
        ))}
        <SmallButton label="+ Add a price" onPress={() => setTiers((list) => [...list, newTier('WHOLESALE')])} />
      </Section>

      <Section title="Variants" hint="Sizes, flavors, colors… each can have its own barcode and prices. Leave empty if there is only one.">
        {variants.map((variant, i) => (
          <View key={variant.key} style={{ gap: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.line, paddingTop: i ? 12 : 0 }}>
            <Field
              label="Variant name"
              required
              value={variant.variantName}
              onChange={(v) => updateVariant(variant.key, { variantName: v })}
              placeholder="e.g. 1.5L"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field flex label="SKU" value={variant.sku} onChange={(v) => updateVariant(variant.key, { sku: v })} />
              <Field flex label="Barcode" value={variant.barcode} onChange={(v) => updateVariant(variant.key, { barcode: v })} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <SmallButton label="📷 Scan its barcode" onPress={() => setScanningVariant(variant.key)} />
              <SmallButton label="Remove variant" danger onPress={() => setVariants((list) => list.filter((v) => v.key !== variant.key))} />
            </View>
          </View>
        ))}
        <SmallButton
          label="+ Add a variant"
          onPress={() => setVariants((list) => [...list, { key: newKey('new'), variantName: '', sku: '', barcode: '', unit: '' }])}
        />
      </Section>

      <Section title="Specifications" hint="e.g. Weight: 500 g, Material: Steel">
        {specs.map((spec) => (
          <View key={spec.key} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <Field flex label="Name" value={spec.name} onChange={(v) => updateSpec(spec.key, { name: v })} />
            <Field flex label="Value" value={spec.value} onChange={(v) => updateSpec(spec.key, { value: v })} />
            <SmallButton label="✕" danger onPress={() => setSpecs((list) => list.filter((s) => s.key !== spec.key))} />
          </View>
        ))}
        <SmallButton
          label="+ Add a specification"
          onPress={() => setSpecs((list) => [...list, { key: newKey('spec'), name: '', value: '' }])}
        />
      </Section>

      <Section title="Order rules for buyers">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field
            flex
            label="Minimum order (MOQ)"
            required
            keyboardType="number-pad"
            value={rules.moq}
            onChange={(v) => setRules({ ...rules, moq: v })}
          />
          <Field
            flex
            label="Maximum order"
            keyboardType="number-pad"
            value={rules.max}
            onChange={(v) => setRules({ ...rules, max: v })}
            placeholder="No limit"
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field
            flex
            label="In multiples of"
            required
            keyboardType="number-pad"
            value={rules.multiple}
            onChange={(v) => setRules({ ...rules, multiple: v })}
          />
          <Field
            flex
            label="Lead time (days)"
            keyboardType="number-pad"
            value={rules.leadTime}
            onChange={(v) => setRules({ ...rules, leadTime: v })}
          />
        </View>
        <Field
          label="Minimum order value"
          keyboardType="decimal-pad"
          value={rules.minValue}
          onChange={(v) => setRules({ ...rules, minValue: v })}
        />
        <Toggle label="Pre-orders allowed" value={rules.preorder} onChange={(v) => setRules({ ...rules, preorder: v })} />
      </Section>

      <Section title="Starting stock" hint={`At ${pairing.session.locationName}.`}>
        {variants.length ? (
          <Text style={{ color: colors.muted }}>With variants, add each variant’s stock in the web app (Inventory) or with the till.</Text>
        ) : (
          <Field label={`Stock here (${details.unit})`} keyboardType="decimal-pad" value={stock} onChange={setStock} placeholder="0" />
        )}
      </Section>

      {!!error && <Text style={{ color: colors.danger, fontWeight: '600' }}>{error}</Text>}
      <Pressable
        style={[base.button, { backgroundColor: colors.accent, opacity: saving || uploading ? 0.6 : 1 }]}
        disabled={saving || uploading}
        onPress={save}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={[base.buttonText, { color: '#fff' }]}>Register product</Text>}
      </Pressable>
      <Pressable onPress={onBack}>
        <Text style={[base.link, { color: colors.accent, textAlign: 'center' }]}>Back</Text>
      </Pressable>

      <ScanBarcodeModal
        visible={!!scanningVariant}
        onClose={() => setScanningVariant('')}
        onScanned={(code) => {
          updateVariant(scanningVariant, { barcode: code })
          setScanningVariant('')
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        }}
      />
    </View>
  )
}
