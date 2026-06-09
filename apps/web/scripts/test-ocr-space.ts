import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const pdfPath = path.join(__dirname, '../../debug-timetable.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF not found at ${pdfPath}`);
    return;
  }

  const buffer = fs.readFileSync(pdfPath);
  console.log(`Reading PDF of size: ${buffer.length} bytes`);

  // Create Form Data and Blob
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('apikey', 'helloworld'); // Public free key
  formData.append('file', blob, 'timetable.pdf');
  formData.append('language', 'eng');
  formData.append('isTable', 'true'); // Specially optimize for table layout
  formData.append('OCREngine', '2'); // Use Engine 2 for alphanumeric/table layout

  console.log('Sending PDF to OCR.space API...');
  const response = await fetch('https://api.ocr.space/Parse/Image', {
    method: 'POST',
    body: formData
  });

  console.log('Response Status:', response.status);
  const result = await response.json();
  
  if (result.OCRExitCode !== 1) {
    console.error('OCR Error:', result.ErrorMessage || result.ErrorDetails);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\n--- OCR RESULTS ---');
  const pages = result.ParsedResults || [];
  console.log(`Successfully parsed ${pages.length} pages.`);

  pages.forEach((page: any, idx: number) => {
    console.log(`\n--- PAGE ${idx + 1} TEXT (First 300 chars) ---`);
    console.log(page.ParsedText ? page.ParsedText.substring(0, 300) : 'No text');
  });

  // Combine text
  const fullText = pages.map((p: any) => p.ParsedText || '').join('\n');
  console.log(`\nTotal text extracted: ${fullText.length} characters.`);
}

main().catch(console.error);
