export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return Response.json({ ok: false }, { status: 405, headers: { Allow: 'POST' } });
    }

    const scriptUrl = process.env.WAITLIST_SCRIPT_URL;
    const secret = process.env.WAITLIST_SECRET;
    if (!scriptUrl || !secret) {
      return Response.json({ ok: false }, { status: 503 });
    }

    const form = await request.formData().catch(() => null);
    const email = form?.get('email');
    const address = typeof email === 'string' ? email.trim() : '';
    if (
      form?.get('consent') !== 'yes' ||
      form.get('bot-field') ||
      address.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
    ) {
      return Response.json({ ok: false }, { status: 400 });
    }

    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address, consent: 'yes', secret }),
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok && (await response.json())?.ok === true) {
        return Response.json({ ok: true });
      }
    } catch {
      return Response.json({ ok: false }, { status: 502 });
    }
    return Response.json({ ok: false }, { status: 502 });
  },
};
