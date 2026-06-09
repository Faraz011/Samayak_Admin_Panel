import * as fs from 'fs';
import * as path from 'path';

// @ts-ignore
import pdfParse from 'pdf-parse';

async function main() {
  const pdfPath = path.join(__dirname, '../../debug-timetable.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF not found at ${pdfPath}`);
    return;
  }

  const buffer = fs.readFileSync(pdfPath);
  console.log(`Reading PDF of size: ${buffer.length} bytes`);
  
  try {
    const result = await pdfParse(buffer);
    console.log('\n--- METADATA ---');
    console.log('Pages:', result.numpages);
    console.log('Info:', result.info);
    console.log('Version:', result.version);
    
    console.log('\n--- EXTRACTED TEXT (First 500 chars) ---');
    if (result.text) {
      console.log(`Text length: ${result.text.length}`);
      console.log(result.text.substring(0, 500));
    } else {
      console.log('No text returned.');
    }
  } catch (err: any) {
    console.error('pdf-parse threw an error:', err);
  }
}

main().catch(console.error);
