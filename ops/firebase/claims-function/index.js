// stratos-claims — stamps a custom auth claim ("stratos": role) for active
// members of the Stratos Ops Firestore database, so Storage rules can gate
// photo uploads. POST with Authorization: Bearer <Firebase idToken>.
const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

admin.initializeApp();
const db = getFirestore('stratos');

functions.http('claims', async (req, res) => {
  res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Auth-Token');
  res.set('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    // Cloud Run validates (and rejects) foreign Authorization headers before
    // the app sees them, so the Firebase idToken travels in X-Auth-Token.
    const raw = req.get('x-auth-token') || ((/^Bearer (.+)$/.exec(req.headers.authorization || '') || [])[1]);
    if (!raw) return res.status(401).json({ error: 'missing token' });
    const decoded = await admin.auth().verifyIdToken(raw);
    const snap = await db.doc(`members/${decoded.uid}`).get();
    const member = snap.exists && snap.get('active') === true ? snap.data() : null;
    await admin.auth().setCustomUserClaims(decoded.uid, { stratos: member ? member.role : null });
    return res.json({ ok: true, stratos: member ? member.role : null });
  } catch (e) {
    console.error('claims', e);
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
});
