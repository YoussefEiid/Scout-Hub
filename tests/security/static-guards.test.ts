import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

function walkDir(dir: string, filter: (file: string) => boolean): string[] {
  const results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        results.push(...walkDir(fullPath, filter));
      }
    } else if (filter(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Static Security & Secret Leakage Guards', () => {
  it('Service-role client and service-role key are NEVER imported in client components', () => {
    const clientFiles = walkDir(path.resolve('src/components'), (f) => f.endsWith('.tsx') || f.endsWith('.ts'));

    for (const file of clientFiles) {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(
        !content.includes('createAdminClient'),
        `Forbidden createAdminClient imported in client component: ${file}`
      );
      assert.ok(
        !content.includes('SUPABASE_SERVICE_ROLE_KEY'),
        `Forbidden SUPABASE_SERVICE_ROLE_KEY referenced in client component: ${file}`
      );
    }
  });

  it('x-scout-auth-mode header is completely eliminated from the codebase', () => {
    const srcFiles = walkDir(path.resolve('src'), (f) => f.endsWith('.tsx') || f.endsWith('.ts'));

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(
        !content.includes('x-scout-auth-mode'),
        `Forbidden legacy header x-scout-auth-mode found in: ${file}`
      );
    }
  });

  it('Browser Supabase client only uses NEXT_PUBLIC_SUPABASE_ANON_KEY', () => {
    const browserClientPath = path.resolve('src/lib/supabase/client.ts');
    const content = fs.readFileSync(browserClientPath, 'utf8');
    assert.ok(content.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
    assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY'));
  });

  it('Deprecated middleware.ts is deleted in favor of proxy.ts (Next.js 16)', () => {
    assert.strictEqual(
      fs.existsSync(path.resolve('src/middleware.ts')),
      false,
      'src/middleware.ts must not exist'
    );
    assert.strictEqual(
      fs.existsSync(path.resolve('src/proxy.ts')),
      true,
      'src/proxy.ts must exist and export proxy function'
    );
  });
});
