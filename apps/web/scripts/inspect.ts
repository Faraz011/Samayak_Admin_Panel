import * as fs from 'fs';
import * as path from 'path';

// Mock WebSocket for Node.js < 22 environments where Supabase-js throws during init
if (typeof (global as any).WebSocket === 'undefined') {
  (global as any).WebSocket = class {};
}

import { createClient } from '@supabase/supabase-js';

function loadEnv(filePath: string) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  }
}

// Load env files
loadEnv(path.join(__dirname, '../../.env'));
loadEnv(path.join(__dirname, '../.env.local'));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Using Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  
  console.log('--- DEPARTMENTS ---');
  const { data: depts } = await supabase.from('departments').select('*');
  console.log(depts);

  console.log('\n--- SECTIONS ---');
  const { data: sections } = await supabase.from('sections').select('*');
  console.log(sections);

  console.log('\n--- ROOMS ---');
  const { data: rooms } = await supabase.from('rooms').select('*').limit(10);
  console.log(rooms);

  console.log('\n--- COURSES (first 10) ---');
  const { data: courses } = await supabase.from('courses').select('*').limit(10);
  console.log(courses);

  console.log('\n--- PROFILES (first 10) ---');
  const { data: profiles } = await supabase.from('profiles').select('*').limit(10);
  console.log(profiles);
}

main().catch(console.error);
