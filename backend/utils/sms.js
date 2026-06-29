const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Sends a WhatsApp message via Twilio
// 'to' must be a full international number e.g. +923001234567
const sendWhatsApp = async (to, message) => {
  await client.messages.create({
    body: message,
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${to}`,
  });
};

module.exports = { sendWhatsApp };
