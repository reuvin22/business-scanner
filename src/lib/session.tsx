import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Platform } from 'react-native'
import type { Pairing } from './api'

const PAIRING_KEY = 'siris-scanner.pairing'
const NAME_KEY = 'siris-scanner.name'

// The pairing holds the till's secret token: on a phone it is kept in the secure storage (Android Keystore /
// iOS Keychain). The web (only used while developing) has no secure storage, so it uses the browser's.
const storage = {
  get: (key: string) => (Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key)),
  set: (key: string, value: string) => (Platform.OS === 'web' ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value)),
  remove: (key: string) => (Platform.OS === 'web' ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key)),
}

type AppSession = {
  /** The till this phone scans for; undefined while loading */
  pairing: Pairing | null | undefined
  setPairing: (pairing: Pairing | null) => Promise<void>
  /** What the till calls this phone, e.g. "Ana's phone" */
  phoneName: string
  setPhoneName: (name: string) => void
}

const SessionContext = createContext<AppSession | null>(null)

export function useAppSession(): AppSession {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useAppSession must be used inside SessionProvider')
  return session
}

/** Which till this phone is paired with (kept on the phone). There is no sign-in. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [pairing, setPairingState] = useState<Pairing | null | undefined>(undefined)
  const [phoneName, setPhoneNameState] = useState('')

  useEffect(() => {
    storage
      .get(PAIRING_KEY)
      .then((saved) => setPairingState(saved ? (JSON.parse(saved) as Pairing) : null))
      .catch(() => setPairingState(null))
    storage.get(NAME_KEY).then((saved) => setPhoneNameState(saved ?? ''), () => undefined)
  }, [])

  async function setPairing(next: Pairing | null) {
    setPairingState(next)
    try {
      if (next) await storage.set(PAIRING_KEY, JSON.stringify(next))
      else await storage.remove(PAIRING_KEY)
    } catch {
      // Not kept: the phone pairs again next time
    }
  }

  function setPhoneName(name: string) {
    setPhoneNameState(name)
    storage.set(NAME_KEY, name).catch(() => undefined)
  }

  return <SessionContext.Provider value={{ pairing, setPairing, phoneName, setPhoneName }}>{children}</SessionContext.Provider>
}
