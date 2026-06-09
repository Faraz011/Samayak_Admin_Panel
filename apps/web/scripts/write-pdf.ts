import * as fs from 'fs';
import * as path from 'path';

// Mock WebSocket for Node.js < 22 environments
if (typeof (global as any).WebSocket === 'undefined') {
  (global as any).WebSocket = class {};
}

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

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const targetId = 'b81c6d2b-d759-4dea-bcc3-b6a67901befa';
  const { data: ingestion } = await supabase
    .from('pdf_ingestions')
    .select('file_content, file_path')
    .eq('id', targetId)
    .single();

  if (!ingestion || !ingestion.file_content) {
    console.log('Ingestion or file content not found!');
    return;
  }

  const buffer = Buffer.from(ingestion.file_content, 'base64');
  const outPath = path.join(__dirname, '../../debug-timetable.pdf');
  fs.writeFileSync(outPath, buffer);
  console.log(`Saved PDF to: ${outPath}`);
  console.log(`File size: ${buffer.length} bytes`);
}

main().catch(console.error);
