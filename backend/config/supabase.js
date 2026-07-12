const { createClient } = require('@supabase/supabase-js');

let client;

const isSupabaseConfigured = () => Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

const getSupabase = () => {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  return client;
};

const getScreenshotBucket = () => process.env.SCREENSHOT_BUCKET || 'screenshots';

const getChatImageBucket = () => process.env.CHAT_IMAGE_BUCKET || 'chat-images';

module.exports = {
  getSupabase,
  getScreenshotBucket,
  getChatImageBucket,
  isSupabaseConfigured,
};
