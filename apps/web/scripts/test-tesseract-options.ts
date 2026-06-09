import * as fs from 'fs';
import * as path from 'path';

// Mock WebSocket
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

loadEnv(path.join(__dirname, '../../.env'));
loadEnv(path.join(__dirname, '../.env.local'));

import { createClient } from '@supabase/supabase-js';
import { pdfToPng } from 'pdf-to-png-converter';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const targetId = 'b81c6d2b-d759-4dea-bcc3-b6a67901befa';
  const { data: ingestion } = await supabase
    .from('pdf_ingestions')
    .select('file_content')
    .eq('id', targetId)
    .single();

  if (!ingestion || !ingestion.file_content) {
    console.error('Ingestion content not found!');
    return;
  }

  const pdfBuffer = Buffer.from(ingestion.file_content, 'base64');
  
  const { pathToFileURL } = await import('url');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  console.log('Rendering first page to PNG...');
  const pngPages = await pdfToPng(pdfBuffer, {
    viewportScale: 2.0,
    pagesToProcess: [1],
  });

  const page = pngPages[0];
  const TesseractModule = await import('tesseract.js');
  const Tesseract = (TesseractModule as any).default || TesseractModule;

  // Let's try standard recognize
  console.log('\n--- 1. Standard OCR ---');
  const res1 = await Tesseract.recognize(page.content, 'eng');
  console.log(`Length: ${res1.data.text.length}`);
  console.log('Preview:', res1.data.text.substring(0, 300));

  // Let's try with different parameters
  console.log('\n--- 2. OCR with tessedit_pageseg_mode = AUTO (3) ---');
  const res2 = await Tesseract.recognize(page.content, 'eng', {
    // we can pass parameters to the worker
  });
  // In tesseract.js we can create a worker to set custom parameters
  const worker = await Tesseract.createWorker('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: '3', // PSM.AUTO (3)
  });
  const res3 = await worker.recognize(page.content);
  console.log(`Length (PSM 3): ${res3.data.text.length}`);
  console.log('Preview (PSM 3):', res3.data.text.substring(0, 300));
  await worker.terminate();
}

main().catch(console.error);
