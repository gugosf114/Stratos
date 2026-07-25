// Stratos Aviation Detailing — Chat Concierge Cloud Function
// HTTP trigger. Receives { message: string }, calls Claude Sonnet 4.6, returns { reply: string }.
// Anthropic API key is injected via Secret Manager as env var ANTHROPIC_API_KEY.

const functions = require('@google-cloud/functions-framework');

const SYSTEM_PROMPT = `You are the Stratos Aviation Detailing concierge.

About Stratos:
- Mobile, on-site aircraft detailing for private and corporate aviation across Los Angeles.
- Every service uses FAA-compliant premium products, applied by trained aviation specialists.
- The crew comes to the aircraft — owners never wait. Services happen at the hangar, FBO, or ramp position.
- Founded to set a new standard for aviation detailing in LA: reliability, professionalism, and precision in an underserved market.

Airports served:
- VNY — Van Nuys (Signature Aviation, Clay Lacy, Castle & Cooke)
- BUR — Hollywood Burbank (Atlantic Aviation)
- SMO — Santa Monica (Atlantic Aviation)
- LGB — Long Beach (Ross Aviation)
- LAX — Los Angeles International (Signature Flight Support)

Services (do not invent others):
- Exterior wash & ceramic coating — aviation-grade ceramic protection for lasting shine and paint preservation
- Interior deep cleaning
- Brightwork polishing
- Belly & landing-gear cleaning
- Regular preservation / maintenance programs for owners and operators

Contact:
- Phone: 424-288-8882
- Website: stratosjetdetail.com (Request a Quote form available)

Hard rules:
1. Tone: professional, concise, respectful. This is a premium aviation market — no casual filler, no exclamation points, no emojis.
2. NEVER quote specific prices. Direct pricing questions to the phone number or the website's Request a Quote form.
3. NEVER commit to specific dates, turnarounds, or availability. Scheduling goes to 424-288-8882.
4. NEVER invent services, products, certifications, or airports beyond what is listed above.
5. If a user asks about airports or FBOs not listed, say coverage is "primarily the greater Los Angeles area" and suggest calling to confirm specific locations.
6. Keep most replies to 2–3 sentences. Longer only if the user asks a detailed question.
7. When the conversation moves toward booking, closing, or firm commitments, say: "I'd recommend calling us at 424-288-8882 or submitting a quote request on the site so we can confirm timing and scope for your aircraft."
8. Stay strictly on topic — Stratos Aviation Detailing services, aircraft care, and logistics. Politely redirect off-topic conversation back to how you can help with their aircraft.`;

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_USER_MESSAGE_LENGTH = 500;
const MAX_TOKENS = 400;
const FALLBACK_REPLY = 'Sorry, I am having trouble connecting right now. Please call us at 424-288-8882.';
const CALL_REPORT_EMAIL = 'edgar@stratosjetdetail.com';
const FORM_SUBMIT_URL = `https://formsubmit.co/ajax/${CALL_REPORT_EMAIL}`;
const MAX_TRANSCRIPT_LENGTH = 30000;

function setCors(res, req) {
  // Permissive for launch; tighten to https://stratosjetdetail.com once verified.
  res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '86400');
  res.set('Vary', 'Origin');
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function formatCallReport(message) {
  const call = message.call || {};
  const artifact = message.artifact || call.artifact || {};
  const analysis = message.analysis || call.analysis || {};
  const recording = artifact.recording || {};
  const caller = firstValue(call.customer?.number, call.customer?.phoneNumber, 'Unknown');
  const called = firstValue(call.phoneNumber?.number, call.phoneNumber?.phoneNumber, 'Stratos');
  const startedAt = firstValue(message.startedAt, call.startedAt);
  const endedAt = firstValue(message.endedAt, call.endedAt);
  const durationSeconds =
    startedAt && endedAt
      ? Math.max(0, Math.round((new Date(endedAt) - new Date(startedAt)) / 1000))
      : firstValue(call.durationSeconds, 'Unknown');
  const transcript = String(
    firstValue(artifact.transcript, message.transcript, call.transcript, 'No transcript was produced.')
  ).slice(0, MAX_TRANSCRIPT_LENGTH);

  return {
    _subject: `Stratos call from ${caller}`,
    _template: 'table',
    _captcha: 'false',
    caller,
    called_number: called,
    ended_reason: firstValue(message.endedReason, call.endedReason, 'Unknown'),
    started_at: firstValue(startedAt, 'Unknown'),
    ended_at: firstValue(endedAt, 'Unknown'),
    duration_seconds: durationSeconds,
    summary: firstValue(analysis.summary, analysis.successEvaluation, 'No summary was produced.'),
    transcript,
    recording: firstValue(
      recording.url,
      artifact.recordingUrl,
      message.recordingUrl,
      call.recordingUrl,
      'No recording URL was produced.'
    ),
    call_id: firstValue(call.id, message.callId, 'Unknown'),
  };
}

async function handleVapiReport(req, res, message) {
  const expectedSecret = String(process.env.VAPI_WEBHOOK_SECRET || '').trim();
  const suppliedSecret = String(req.query?.token || '').trim();

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    console.warn('Rejected Vapi webhook with invalid token');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (message.type !== 'end-of-call-report') {
    res.status(200).json({ received: true });
    return;
  }

  const emailResponse = await fetch(FORM_SUBMIT_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: 'https://stratosjetdetail.com',
      Referer: 'https://stratosjetdetail.com/',
    },
    body: JSON.stringify(formatCallReport(message)),
  });

  const emailResult = await emailResponse.text();
  let emailAccepted = false;
  try {
    const parsedResult = JSON.parse(emailResult);
    emailAccepted = parsedResult.success === true || parsedResult.success === 'true';
  } catch {
    emailAccepted = false;
  }

  if (!emailResponse.ok || !emailAccepted) {
    console.error('Call report email failed:', emailResponse.status, emailResult);
    res.status(502).json({ error: 'Email delivery failed' });
    return;
  }

  console.log('Call report email accepted:', message.call?.id || 'unknown call');
  res.status(200).json({ received: true });
}

functions.http('stratosChat', async (req, res) => {
  setCors(res, req);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const vapiMessage = body.message && typeof body.message === 'object' ? body.message : null;

  if (vapiMessage?.type) {
    try {
      await handleVapiReport(req, res, vapiMessage);
    } catch (err) {
      console.error('Vapi webhook error:', err);
      res.status(500).json({ error: 'Call report processing failed' });
    }
    return;
  }

  const userMessage = String(body.message ?? '').trim();

  if (!userMessage) {
    res.status(400).json({ error: 'Empty message' });
    return;
  }

  if (userMessage.length > MAX_USER_MESSAGE_LENGTH) {
    res.status(200).json({
      reply: 'Your message is quite long. Could you shorten it, or call us directly at 424-288-8882?',
    });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY env var not set');
    res.status(200).json({ reply: FALLBACK_REPLY });
    return;
  }

  try {
    const anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      console.error('Anthropic API error:', anthropicResponse.status, errText);
      res.status(200).json({ reply: FALLBACK_REPLY });
      return;
    }

    const data = await anthropicResponse.json();
    const reply = data?.content?.[0]?.text?.trim();

    if (!reply) {
      res.status(200).json({ reply: FALLBACK_REPLY });
      return;
    }

    res.status(200).json({ reply });
  } catch (err) {
    console.error('Function error:', err);
    res.status(200).json({ reply: FALLBACK_REPLY });
  }
});
