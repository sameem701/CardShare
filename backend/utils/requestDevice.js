// Client must send the app-generated device id on every authenticated request.
// Prefer X-Device-Id header; body fallback only for /auth/refresh during migration.

const getDeviceId = (req, { allowBody = false } = {}) => {
  const header = req.headers['x-device-id'];
  if (header) return header;

  if (allowBody && req.body?.device_id) {
    return req.body.device_id;
  }

  return null;
};

module.exports = { getDeviceId };
