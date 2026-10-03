// Calls to the SIRIS API. The phone does not sign in: it pairs with ONE till by scanning that till's QR code, and
// then sends the secret token it got with every scan. The token only adds products to that till's cart.

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://business-be-p3bx.onrender.com/api/v1').replace(/\/$/, '')

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
  locationId: string
  locationName: string
  tillName: string
  scannerName: string
  active: boolean
  expiresAt: number
  pairedAt: number | null
}

/** The till this phone scans for, and the secret token that proves it (kept in the phone's secure storage). */
export type Pairing = { businessId: string; businessName: string; session: ScannerSession; token: string }

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

export const getSession = (pairing: Pairing) => api<ScannerSession>(sessionPath(pairing), 'GET', undefined, pairing.token)

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
