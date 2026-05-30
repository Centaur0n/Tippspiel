import { createClient } from '@supabase/supabase-js'

// Für Webpack / Create-React-App nutzt man process.env:
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)