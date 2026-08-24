// Stratos Ops — Firebase wiring.
// Project: bakers-agent (shared). Stratos data lives in its OWN Firestore database ("stratos")
// and its OWN bucket (stratos-ops-photos) with their own rules — see /ops/firebase/*.rules.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import * as A from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import * as F from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import * as S from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyA4-vdbPNggEnA-XuLro00W6CR5UpzpHw0',
  authDomain: 'bakers-agent.firebaseapp.com',
  projectId: 'bakers-agent',
  storageBucket: 'stratos-ops-photos',
  messagingSenderId: '787543109204',
  appId: '1:787543109204:web:dfbbf7629ce719ac2f07c1'
};

export const app = initializeApp(firebaseConfig);
export const auth = A.getAuth(app);

let _db;
try {
  _db = F.initializeFirestore(app, {
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() })
  }, 'stratos');
} catch (e) {
  // Persistence unavailable (private mode, old browser) — fall back to memory cache.
  console.warn('Firestore persistent cache unavailable:', e && e.message);
  _db = F.getFirestore(app, 'stratos');
}
export const db = _db;
export const storage = S.getStorage(app, 'gs://stratos-ops-photos');

export { A, F, S };
