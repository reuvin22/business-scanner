import type { Choice } from './api'

// The same lists as the web app's product form (business/src/constants/options.ts)

const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ')
const choices = (...values: string[]): Choice[] => values.map((value) => ({ value, label: label(value) }))

export const UNITS = choices('pcs', 'box', 'case', 'pack', 'set', 'bottle', 'can', 'sack', 'kg', 'g', 'L', 'mL', 'm').map((c) => ({
  value: c.value,
  label: c.value,
}))
export const PRODUCT_STATUSES = choices('ACTIVE', 'DRAFT', 'ARCHIVED')
export const VISIBILITIES: Choice[] = [
  { value: 'PUBLIC', label: 'Public: in the directory' },
  { value: 'PRIVATE', label: 'Private: only your team' },
]
export const PRICE_TYPES = choices('RETAIL', 'WHOLESALE', 'DISTRIBUTOR', 'BULK', 'SPECIAL')
// Who a price tier is for ("" = everyone)
export const CUSTOMER_TYPES: Choice[] = [
  { value: '', label: 'Everyone' },
  ...choices(
    'MANUFACTURER',
    'SUPPLIER',
    'DISTRIBUTOR',
    'WHOLESALER',
    'RETAILER',
    'IMPORTER',
    'EXPORTER',
    'SERVICE_PROVIDER',
    'BRAND_OWNER',
    'FARMER_PRODUCER',
    'OTHER',
  ),
]
