/**
 * State serialization & obfuscation (spec §40).
 *
 * Pipeline (exact, 5 steps - do not shortcut):
 *  1. JSON.stringify(state)
 *  2. TextEncoder -> Uint8Array
 *  3. Byte-level XOR against the master key (modulo key length)
 *  4. Byte array -> ASCII string buffer
 *  5. btoa() wrap
 */

const XOR_MASTER_KEY = 'bWFkZSBieSAxbXBhY3Rpbjk==='

const keyBytes = new TextEncoder().encode(XOR_MASTER_KEY)

function bytesToAsciiString(bytes: Uint8Array): string {
  let out = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return out
}

export function encodeState(state: unknown): string {
  const json = JSON.stringify(state)
  const payload = new TextEncoder().encode(json)
  for (let i = 0; i < payload.length; i++) {
    payload[i] ^= keyBytes[i % keyBytes.length]
  }
  return btoa(bytesToAsciiString(payload))
}

export function decodeState<T>(encoded: string): T | null {
  try {
    const ascii = atob(encoded)
    const bytes = new Uint8Array(ascii.length)
    for (let i = 0; i < ascii.length; i++) bytes[i] = ascii.charCodeAt(i)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] ^= keyBytes[i % keyBytes.length]
    }
    const json = new TextDecoder().decode(bytes)
    return JSON.parse(json) as T
  } catch {
    return null
  }
}
