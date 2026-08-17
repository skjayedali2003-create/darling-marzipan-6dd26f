const { getStore } = require("@netlify/blobs");

async function sendEmail(data, passUrl) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !data.email) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [data.email],
      subject: `Your Verified Delegate Pass — ${data.delegateId}`,
      html: `
        <h2>Students Front — Delegate Pass Verified</h2>
        <p>Hello ${data.name || "Delegate"},</p>
        <p>Your payment has been verified successfully.</p>
        <p><b>Delegate ID:</b> ${data.delegateId}</p>
        <p><b>Event:</b> 27–28 November 2026<br><b>Venue:</b> Howrah</p>
        <p><a href="${passUrl}">Open your Digital Delegate Pass</a></p>
        <p>Please keep this link safe and show the QR/verification page at the event.</p>
      `
    })
  });
  return r.ok;
}

async function sendWhatsApp(data, passUrl) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID || !data.whatsapp) return false;
  const r = await fetch(
    `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: data.whatsapp.replace(/\D/g, ""),
        type: "text",
        text: {
          body:
`Students Front — Payment Verified ✅

Delegate ID: ${data.delegateId}
Name: ${data.name || ""}
Event: 27–28 November 2026
Venue: Howrah

Digital Delegate Pass:
${passUrl}

Please keep this link safe for entry verification.`
        }
      })
    }
  );
  return r.ok;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const auth = event.headers.authorization || "";
    const secret = process.env.ADMIN_SECRET || "";
    if (!secret || auth !== `Bearer ${secret}`) {
      return { statusCode: 401, body: "Unauthorized" };
    }

    const { delegateId, action } = JSON.parse(event.body || "{}");
    if (!delegateId || !["verify", "reject"].includes(action)) {
      return { statusCode: 400, body: "Invalid request" };
    }

    const store = getStore("delegate-registrations");
    const data = await store.get(delegateId, { type: "json" });
    if (!data) return { statusCode: 404, body: "Delegate not found" };

    data.status = action === "verify" ? "verified" : "rejected";
    data.verifiedAt = new Date().toISOString();

    const site = (process.env.PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const passUrl = `${site}/verify.html?id=${encodeURIComponent(delegateId)}`;
    data.passUrl = passUrl;

    const delivery = { email: false, whatsapp: false };

    if (action === "verify") {
      delivery.email = await sendEmail(data, passUrl);
      delivery.whatsapp = await sendWhatsApp(data, passUrl);
      data.passDelivered = delivery;
    }

    await store.setJSON(delegateId, data);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        status: data.status,
        delegateId,
        passUrl,
        delivery
      })
    };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: "Server error" };
  }
};
