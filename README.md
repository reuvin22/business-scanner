# SIRIS Scanner

A phone app that turns a phone into a barcode scanner for the SIRIS selling app (`business-pos`).
Each product it scans shows up **instantly in the till's cart**. Nothing is sold until the cashier presses
**Charge** on the till.

## How it works

The phone does **not** sign in. A till connects it by showing its own QR code.

1. On the till (selling app), tap **Phone scanner** → **Connect a phone**. The till shows a QR code (and the same
   code as text). The QR code is drawn in the till's browser and belongs to **that till only**: every till (every
   browser) has its own id and its own sessions, so two tills, even at the same store with the same account, never
   get the same code or each other's scans. Codes are unique (the server refuses a code that exists), work **once**,
   and expire after **10 minutes**.
2. The phone scans the QR code (or the code is typed). It gets a secret token for that one till, kept in the phone's
   secure storage (Android Keystore / iOS Keychain). The token can only add products to that till's cart: it cannot
   sell, see prices, or read anything else.
3. Scan products. The API finds each barcode (or SKU) in the catalog and saves the scan; the till listens to its own
   session's scans live (Firestore) and adds each product to its cart, checking the stock like a tap would.
   Nothing is sold until the cashier presses **Charge**.
4. The connection ends when either side taps **Disconnect**, when the till makes a **New code**, or after 12 hours.
   The token stops working at once, and the phone is asked to scan the till's QR code again.

Pairing is limited to 10 tries a minute per network address, so codes cannot be guessed.

The same barcode counts again once it has left the camera's view (move the phone away and back to scan two).
Codes that will not scan can be typed.

## Options → Register product

Shown only when the person signed in on the till may manage products (e.g. the owner or an admin; checked again
every time the app comes back to the screen). Scan the new product's barcode (already-registered barcodes are refused),
then choose:

- **On this phone**: name, selling price, unit, cost, and starting stock at the till's store. The product is saved in
  the name of the person signed in on the till, and can be scanned and sold right away.
- **On the web app**: opens `EXPO_PUBLIC_WEB_URL/business/<id>/products?add=1&barcode=<code>`. The web app asks to sign
  in if needed, then opens Products → Add product with the barcode filled in.

## Run it

```bash
npm install
cp .env.example .env        # the API address and the web app address (no Firebase: the phone does not sign in)
npx expo start              # scan the QR code with the Expo Go app on the phone
```

Camera access is needed (the app asks). Checks: `npm run typecheck` and `npm run lint`.

## Install it on phones (without the app stores)

```bash
npm install -g eas-cli      # or use npx eas-cli
eas login
eas build -p android --profile preview   # an APK to install on Android phones
```

For the Play Store / App Store use the `production` profile and `eas submit`. Set `EXPO_PUBLIC_API_URL`
as an EAS environment variable (it is built into the app; never put secrets there).

## Code

- `src/app/` — the screens (Expo Router): `pair` (scan the till's QR code), `scan`.
- `src/lib/api.ts` — calls to the SIRIS API (`/pos/scanner/pair`, then `/pos/scanner/{businessId}/{sessionId}/...` with the `X-Scanner-Token` header).
- `src/lib/session.tsx` — which till the phone is paired with, and its token (in secure storage).
- Backend: `business-be/app/controllers/scanner_controller.py`. Till: `business-pos/src/hooks/usePhoneScanner.ts`.
