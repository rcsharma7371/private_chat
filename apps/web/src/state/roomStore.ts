import { create } from 'zustand';
import { RoomState } from '@talk/shared';
import {
  DerivedSessionKeys,
  deriveSessionKeys,
} from '../crypto/e2ee.js';
import {
  generateEphemeralECDH,
  getOrCreateDeviceKey,
  importPeerECDHPublicKey,
} from '../crypto/keys.js';
import { computeSAS, SASVerification } from '../crypto/sas.js';
import {
  wipeRoom,
  saveRoomSessionKeys,
  getRoomSessionKeys,
  clearRoomSessionKeys,
} from '../crypto/idb.js';

interface RoomStoreState {
  slug: string | null;
  roomId: string | null;
  slotIndex: number | null;
  roomState: RoomState | null;
  disappearAfter: number | null;
  displayName: string | null;

  // Local crypto state
  devicePubKey: string | null;
  ecdhKeyPair: CryptoKeyPair | null;
  ecdhPubKey: string | null;
  authKey: Uint8Array | null;

  // Peer crypto state
  peerSlotIndex: number | null;
  peerDevicePubKey: string | null;
  peerEcdhPubKey: string | null;
  peerDisplayName: string | null;

  // Derived session keys
  sessionKeys: DerivedSessionKeys | null;
  sas: SASVerification | null;

  // Actions
  initDevice: () => Promise<string>;
  initRoomSession: (slug: string, roomId: string, slotIndex: number, authKey: Uint8Array) => Promise<void>;
  setRoomInfo: (roomId: string, slotIndex: number) => void;
  setPeer: (peer: {
    slotIndex: number;
    devicePubKey: string;
    ecdhPubKey: string;
    displayName?: string | null;
  }) => Promise<void>;
  clearPeer: () => void;
  setDisappearAfter: (seconds: number | null) => void;
  persistActiveSession: (token?: string) => Promise<void>;
  restoreSessionFromStorage: (slug: string) => Promise<boolean>;
  clearSessionStorage: (slug: string) => Promise<void>;
  destroyLocalRoom: () => Promise<void>;
  reset: () => void;
}

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  slug: null,
  roomId: null,
  slotIndex: null,
  roomState: null,
  disappearAfter: null,
  displayName: null,

  devicePubKey: null,
  ecdhKeyPair: null,
  ecdhPubKey: null,
  authKey: null,

  peerSlotIndex: null,
  peerDevicePubKey: null,
  peerEcdhPubKey: null,
  peerDisplayName: null,

  sessionKeys: null,
  sas: null,

  initDevice: async () => {
    const { publicKeyJwk } = await getOrCreateDeviceKey();
    set({ devicePubKey: publicKeyJwk });
    return publicKeyJwk;
  },

  initRoomSession: async (slug, roomId, slotIndex, authKey) => {
    let { ecdhKeyPair, ecdhPubKey } = get();
    if (!ecdhKeyPair || !ecdhPubKey) {
      const ephemeral = await generateEphemeralECDH();
      ecdhKeyPair = ephemeral.keyPair;
      ecdhPubKey = ephemeral.publicKeyJwk;
    }
    set({
      slug,
      roomId,
      slotIndex,
      authKey,
      ecdhKeyPair,
      ecdhPubKey,
    });
  },

  setRoomInfo: (roomId: string, slotIndex: number) => {
    set({ roomId, slotIndex });
  },

  setPeer: async (peer) => {
    const { ecdhKeyPair, devicePubKey } = get();
    if (!ecdhKeyPair) {
      console.warn('[RoomStore] setPeer called but ecdhKeyPair is missing');
      return;
    }

    try {
      const peerEcdhKey = await importPeerECDHPublicKey(peer.ecdhPubKey);
      const sessionKeys = await deriveSessionKeys(ecdhKeyPair.privateKey, peerEcdhKey);

      // Compute deterministic SAS
      let sas: SASVerification | null = null;
      if (devicePubKey) {
        sas = await computeSAS(sessionKeys.sasSeed, devicePubKey, peer.devicePubKey);
      }

      set({
        peerSlotIndex: peer.slotIndex,
        peerDevicePubKey: peer.devicePubKey,
        peerEcdhPubKey: peer.ecdhPubKey,
        peerDisplayName: peer.displayName ?? null,
        sessionKeys,
        sas,
      });
      console.log(`[RoomStore] Derived sessionKeys and SAS successfully with peer (slot ${peer.slotIndex})`);
    } catch (err) {
      console.error('[RoomStore] Error establishing session with peer:', err);
    }
  },

  clearPeer: () => {
    set({
      peerSlotIndex: null,
      peerDevicePubKey: null,
      peerEcdhPubKey: null,
      peerDisplayName: null,
      sessionKeys: null,
      sas: null,
    });
  },

  setDisappearAfter: (seconds) => {
    set({ disappearAfter: seconds });
  },

  persistActiveSession: async (token?: string) => {
    const { slug, roomId, slotIndex, displayName, authKey, ecdhKeyPair, ecdhPubKey } = get();
    if (!slug || !roomId || slotIndex === null || !ecdhKeyPair || !ecdhPubKey) return;

    try {
      // 1. Save CryptoKeyPair in IndexedDB
      await saveRoomSessionKeys(slug, {
        roomId,
        ecdhKeyPair,
        ecdhPubKeyJwk: ecdhPubKey,
      });

      // 2. Save metadata & token in localStorage
      const authKeyHex = authKey
        ? Array.from(authKey).map((b) => b.toString(16).padStart(2, '0')).join('')
        : null;

      const metadata = {
        slug: slug.toLowerCase(),
        roomId,
        slotIndex,
        displayName: displayName || null,
        token: token || null,
        authKeyHex,
        ecdhPubKey,
        savedAt: Date.now(),
      };
      localStorage.setItem(`talk_session_${slug.toLowerCase()}`, JSON.stringify(metadata));
      console.log(`[RoomStore] Successfully persisted room credentials for /r/${slug}`);
    } catch (err) {
      console.warn('[RoomStore] Failed to persist room session:', err);
    }
  },

  restoreSessionFromStorage: async (slug: string) => {
    try {
      const raw = localStorage.getItem(`talk_session_${slug.toLowerCase()}`);
      if (!raw) return false;

      const meta = JSON.parse(raw);
      if (!meta || meta.slug !== slug.toLowerCase() || !meta.roomId || meta.slotIndex === null) {
        return false;
      }

      // Check if session has expired (24 hours TTL for local refresh cache)
      if (meta.savedAt && Date.now() - meta.savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(`talk_session_${slug.toLowerCase()}`);
        return false;
      }

      // Load CryptoKeyPair from IndexedDB
      const keysRecord = await getRoomSessionKeys(slug);
      if (!keysRecord || !keysRecord.ecdhKeyPair) {
        console.warn('[RoomStore] Session metadata found but ECDH keys missing in IDB');
        return false;
      }

      // Ensure primary device key is ready
      await get().initDevice();

      let authKey: Uint8Array | null = null;
      if (meta.authKeyHex) {
        const matches = meta.authKeyHex.match(/.{1,2}/g);
        if (matches) {
          authKey = new Uint8Array(matches.map((byte: string) => parseInt(byte, 16)));
        }
      }

      set({
        slug: meta.slug,
        roomId: meta.roomId,
        slotIndex: meta.slotIndex,
        displayName: meta.displayName ?? null,
        authKey,
        ecdhKeyPair: keysRecord.ecdhKeyPair,
        ecdhPubKey: keysRecord.ecdhPubKeyJwk || meta.ecdhPubKey,
      });

      console.log(`[RoomStore] Restored session for /r/${slug} (slot ${meta.slotIndex})`);
      return true;
    } catch (err) {
      console.warn('[RoomStore] Failed to restore session from storage:', err);
      return false;
    }
  },

  clearSessionStorage: async (slug: string) => {
    try {
      localStorage.removeItem(`talk_session_${slug.toLowerCase()}`);
      await clearRoomSessionKeys(slug);
      console.log(`[RoomStore] Cleared storage credentials for /r/${slug}`);
    } catch (err) {
      console.warn('[RoomStore] Failed to clear session storage:', err);
    }
  },

  destroyLocalRoom: async () => {
    const { roomId, slug } = get();
    if (slug) {
      await get().clearSessionStorage(slug);
    }
    if (roomId) {
      await wipeRoom(roomId);
    }
    get().reset();
  },

  reset: () => {
    set({
      slug: null,
      roomId: null,
      slotIndex: null,
      roomState: null,
      disappearAfter: null,
      displayName: null,
      authKey: null,
      ecdhKeyPair: null,
      ecdhPubKey: null,
      peerSlotIndex: null,
      peerDevicePubKey: null,
      peerEcdhPubKey: null,
      peerDisplayName: null,
      sessionKeys: null,
      sas: null,
    });
  },
}));
