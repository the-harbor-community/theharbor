import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SEO_PAGES, buildSeoHead } from './src/js/seo-head.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

for (const filename of Object.keys(SEO_PAGES)) {
  const filePath = path.join(root, filename);
  if (!fs.existsSync(filePath)) continue;
  let html = fs.readFileSync(filePath, 'utf8');
  const p = SEO_PAGES[filename];
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${p.title}</title>`);
  html = html.replace(/\s*<meta name="description"[^>]*>/g, '');
  html = html.replace(/\s*<meta name="keywords"[^>]*>/g, '');
  html = html.replace(/\s*<meta name="robots"[^>]*>/g, '');
  html = html.replace(/\s*<meta name="author"[^>]*>/g, '');
  html = html.replace(/\s*<meta name="theme-color"[^>]*>/g, '');
  html = html.replace(/\s*<link rel="manifest"[^>]*>/g, '');
  html = html.replace(/\s*<link rel="canonical"[^>]*>/g, '');
  html = html.replace(/\s*<link rel="alternate" hreflang="[^"]*"[^>]*>/g, '');
  html = html.replace(/\s*<meta property="og:[^"]*"[^>]*>/g, '');
  html = html.replace(/\s*<meta name="twitter:[^"]*"[^>]*>/g, '');
  html = html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/g, '');
  const seoBlock = buildSeoHead(filename).trim();
  if (!html.includes('rel="canonical"')) {
    html = html.replace(
      /(<meta name="viewport"[^>]*>)/,
      `$1\n${seoBlock}`
    );
  }
  fs.writeFileSync(filePath, html);
  console.log('Updated', filename);
}
