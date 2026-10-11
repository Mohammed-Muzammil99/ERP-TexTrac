import fs from 'fs';
import path from 'path';

function searchFile(dir: string, filePattern: string) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const fullPath = path.join(dir, f);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        const skipped = ['node_modules', '.git', 'dist', 'proc', 'sys', 'dev', 'lib', 'lib64', 'etc', 'usr', 'bin', 'sbin', 'var', 'boot', 'tmp'];
        if (!skipped.includes(f)) {
          searchFile(fullPath, filePattern);
        }
      } else if (f.includes(filePattern)) {
        console.log(`Found: ${fullPath}, size: ${stat.size} bytes, modified: ${stat.mtime}`);
      }
    }
  } catch (err: any) {
    // ignore
  }
}

console.log("Searching absolute system for 'production_erp.db'...");
searchFile('/', 'production_erp.db');
