// Calls to the SIRIS API. The phone does not sign in: it pairs with ONE till by scanning that till's QR code, and
// then sends the secret token it got with every scan. The token only adds products to that till's cart.

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://business-be-p3bx.onrender.com/api/v1').replace(/\/$/, '')

/** The phone's secret token must never travel unencrypted: only https (plain http only to a computer on the same
 * network, while developing). */
const SAFE_API = /^https:\/\//.test(API_URL) || /^http:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(API_URL)
/** The SIRIS web app (for "continue on the web"), e.g. https://siris.vercel.app */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type ValidationIssue = { msg?: string }

function readError(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return (detail as ValidationIssue[]).map((issue) => (issue.msg ?? '').replace(/^Value error, /, '')).join('\n')
  return fallback
}

async function api<T>(path: string, method = 'GET', body?: unknown, token?: string): Promise<T> {
  if (!SAFE_API) throw new ApiError(0, 'The SIRIS address in this app is not secure (it must start with https://).')
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Scanner-Token': token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'No connection to SIRIS. Check the internet on this phone.')
  }
  if (response.status === 204) return undefined as T
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, readError(data, `Something went wrong (${response.status})`))
  return data as T
}

// ---- Types (the API's camelCase JSON) ------------------------------------------------------------

export type ScannerSession = {
  id: string
  /** "admin": connected from the web app to register products (no till cart to scan into) */
  mode?: 'till' | 'admin'
  /** The till (or web app) allowed this phone. Until then it can do nothing. */
  approved?: boolean
  allowRegister?: boolean
  locationId: string
  locationName: string
  tillName: string
  scannerName: string
  active: boolean
  expiresAt: number
  pairedAt: number | null
}

/** What the phone may do besides scanning into the cart (only when the person at the till may do it). */
export type PhoneAction = 'register_product'

/** The till this phone scans for, and the secret token that proves it (kept in the phone's secure storage). */
export type Pairing = { businessId: string; businessName: string; session: ScannerSession; token: string; actions: PhoneAction[] }

export type Scan = { id: string; barcode: string; itemKey: string; productName: string; createdAt: number }

/** 401: the connection ended (the till disconnected or made a new code, or 12 hours passed): pair again. */
export const isDisconnected = (error: unknown) => error instanceof ApiError && error.status === 401

// ---- Calls --------------------------------------------------------------------------------------

/** What a till's QR code holds: "SIRIS-SCAN:<code>". */
export const isTillQr = (text: string) => /^SIRIS-SCAN:[A-Z0-9-]{4,20}$/i.test(text.trim())

/** Connects to the till that shows this code (from its QR code, or typed). Each code works once. */
export const pairWithTill = (code: string, scannerName: string) =>
  api<Pairing>('/pos/scanner/pair', 'POST', { code: code.trim(), scannerName })

const sessionPath = (pairing: Pairing) => `/pos/scanner/${pairing.businessId}/${pairing.session.id}`

/** Still connected? And what may the phone do now (the till's permissions can change). */
export const getSession = (pairing: Pairing) =>
  api<{ session: ScannerSession; actions: PhoneAction[] }>(sessionPath(pairing), 'GET', undefined, pairing.token)

export const disconnect = (pairing: Pairing) => api<void>(sessionPath(pairing), 'DELETE', undefined, pairing.token)

/** The phone's local date (YYYY-MM-DD), so prices that start or end on a date match the till. */
function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Puts the product with this barcode in the till's cart (it is not sold until the cashier charges). */
export const sendScan = (pairing: Pairing, barcode: string) =>
  api<Scan>(`${sessionPath(pairing)}/scans?date=${today()}`, 'POST', { barcode }, pairing.token)

// ---- Registering a product ---------------------------------------------------------------------------

/** Is this barcode already a product? (productName is "" when it is not.) */
export const lookupBarcode = (pairing: Pairing, barcode: string) =>
  api<{ barcode: string; productName: string }>(
    `${sessionPath(pairing)}/lookup?barcode=${encodeURIComponent(barcode)}`,
    'GET',
    undefined,
    pairing.token,
  )

/** The product form, the same as the web app's Add product (see business-be ProductFormIn), plus starting stock. */
export type ProductForm = {
  productName: string
  sku: string
  barcode: string
  unit: string
  categoryId: string | null
  brandId: string | null
  status: string
  visibility: string
  description: string
  costPrice: number | null
  orderRules: {
    minimumOrderQuantity: number
    maximumOrderQuantity: number | null
    orderMultiple: number
    minimumOrderValue: number | null
    leadTimeDays: number | null
    preorderAllowed: boolean
  }
  images: { imageUrl: string; mediaType: 'IMAGE' | 'VIDEO'; sortOrder: number; isPrimary: boolean }[]
  specifications: { name: string; value: string }[]
  variants: { key: string; variantName: string; sku: string; barcode: string; unit: string }[]
  prices: {
    priceType: string
    price: number
    currency: string
    minimumQuantity: number
    maximumQuantity: number | null
    customerType: string | null
    variantKey: string | null
  }[]
  stock: number
}

/** Registers the product, in the name of the person signed in on the till. */
export const registerProduct = (pairing: Pairing, product: ProductForm) =>
  api<{ productId: string; productName: string }>(`${sessionPath(pairing)}/products`, 'POST', product, pairing.token)

export type Choice = { value: string; label: string }

/** The business's categories and brands for the form, and its currency. */
export const getProductOptions = (pairing: Pairing) =>
  api<{ categories: Choice[]; brands: Choice[]; currency: string }>(
    `${sessionPath(pairing)}/product-options`,
    'GET',
    undefined,
    pairing.token,
  )

/** Uploads a product photo or video taken on the phone. Returns its link. */
export async function uploadPhoto(pairing: Pairing, file: { uri: string; name: string; type: string }) {
  if (!SAFE_API) throw new ApiError(0, 'The SIRIS address in this app is not secure (it must start with https://).')
  const body = new FormData()
  // React Native sends a file given as { uri, name, type }
  body.append('file', file as unknown as Blob)
  let response: Response
  try {
    response = await fetch(`${API_URL}${sessionPath(pairing)}/images`, {
      method: 'POST',
      headers: { 'X-Scanner-Token': pairing.token },
      body,
    })
  } catch {
    throw new ApiError(0, 'No connection to SIRIS. Check the internet on this phone.')
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, readError(data, `Could not upload the photo (${response.status})`))
  return data as { url: string; mediaType: 'IMAGE' | 'VIDEO' }
}

/** The web app's products page with "Add product" open and the barcode filled in (it asks to sign in first). */
export const webAddProductUrl = (pairing: Pairing, barcode: string) =>
  `${WEB_URL}/business/${pairing.businessId}/products?add=1&barcode=${encodeURIComponent(barcode)}`
