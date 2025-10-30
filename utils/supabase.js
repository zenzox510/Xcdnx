const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('Supabase credentials missing. Set SUPABASE_URL and SUPABASE_KEY in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch } });

module.exports = { supabase };
