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

import { POST } from '../app/api/pdf-ingestions/process/route';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Find the target ingestion record
  console.log('Finding ingestion records...');
  const { data: ingestions, error: fetchError } = await supabase
    .from('pdf_ingestions')
    .select('id, file_path, status')
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('Error fetching ingestions:', fetchError);
    return;
  }

  console.log('Ingestions found in DB:');
  console.log(ingestions);

  if (ingestions.length === 0) {
    console.log('No ingestions found in database.');
    return;
  }
  const targetId = ingestions[0].id;
  console.log(`Using most recent ingestion: ${targetId} (${ingestions[0].file_path})`);

  // Reset ingestion to queued if it is done or failed so we can process it
  await supabase.from('pdf_ingestions').update({
    status: 'queued',
    error_log: []
  }).eq('id', targetId);

  // Construct request mock
  const reqUrl = 'http://localhost/api/pdf-ingestions/process';
  const request = new NextRequest(reqUrl, {
    method: 'POST',
    body: JSON.stringify({ ingestion_id: targetId }),
  });

  console.log(`\n🚀 Triggering POST handler for Ingestion ID: ${targetId}...`);
  const response = await POST(request);
  
  console.log(`Response Status: ${response.status}`);
  const result = await response.json();
  console.log('Response JSON result:', JSON.stringify(result, null, 2));

  // Fetch updated status
  const { data: updatedIng } = await supabase
    .from('pdf_ingestions')
    .select('*')
    .eq('id', targetId)
    .single();

  console.log('\n--- Final Ingestion State in DB ---');
  console.log({
    id: updatedIng?.id,
    status: updatedIng?.status,
    rows_total: updatedIng?.rows_total,
    rows_created: updatedIng?.rows_created,
    rows_matched: updatedIng?.rows_matched,
    rows_failed: updatedIng?.rows_failed,
    error_log: updatedIng?.error_log,
  });
}

main().catch(console.error);
