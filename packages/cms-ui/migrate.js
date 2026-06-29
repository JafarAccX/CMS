import fs from 'fs';
import path from 'path';

const baseDir = 'c:/Users/Lenovo/OneDrive/Desktop/CMS/packages/cms-ui/src';

function processDir(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDir(fullPath);
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      processFile(fullPath);
    }
  }
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Determine nesting level relative to baseDir to write correct paths
  const relativePath = path.relative(path.dirname(filePath), baseDir).replace(/\\/g, '/');
  const dotPath = relativePath === '' ? '.' : relativePath;

  // 1. Rename import paths to CMS equivalents
  content = content.replace(/import\s+api\s+from\s+["'](\.\.\/)+api\/client["']/g, `import { cmsApiClient as api } from "${dotPath}/api/cmsClient"`);
  content = content.replace(/import\s+\{\s*useAuthStore\s*\}\s+from\s+["'](\.\.\/)+store\/authStore["']/g, `import { useCmsAuthStore } from "${dotPath}/api/cmsClient"`);
  content = content.replace(/import\s+\{\s*useSocketStore\s*\}\s+from\s+["'](\.\.\/)+store\/socketStore["']/g, `import { useCmsSocketStore } from "${dotPath}/store/cmsSocketStore"`);
  content = content.replace(/import\s+\{\s*useMessageStore\s*\}\s+from\s+["'](\.\.\/)+store\/messageStore["']/g, `import { useCmsMessageStore } from "${dotPath}/store/cmsMessageStore"`);
  content = content.replace(/import\s+\{\s*useDmStore\s*\}\s+from\s+["'](\.\.\/)+store\/dmStore["']/g, `import { useCmsDmStore } from "${dotPath}/store/cmsDmStore"`);
  content = content.replace(/import\s+\{\s*useNotificationStore\s*\}\s+from\s+["'](\.\.\/)+store\/notificationStore["']/g, `import { useCmsNotificationStore } from "${dotPath}/store/cmsNotificationStore"`);
  content = content.replace(/import\s+\{\s*useUiStore\s*\}\s+from\s+["'](\.\.\/)+store\/uiStore["']/g, `import { useCmsUiStore } from "${dotPath}/store/cmsUiStore"`);
  content = content.replace(/import\s+\{\s*useBatchStore\s*\}\s+from\s+["'](\.\.\/)+store\/batchStore["']/g, `import { useCmsBatchStore } from "${dotPath}/store/cmsBatchStore"`);
  content = content.replace(/import\s+\{\s*useSocket\s*\}\s+from\s+["'](\.\.\/)+hooks\/useSocket["']/g, `import { useCmsSocket } from "${dotPath}/hooks/useCmsSocket"`);

  // Handle direct client imports if any
  content = content.replace(/from\s+["'](\.\.\/)+api\/client["']/g, `from "${dotPath}/api/cmsClient"`);
  content = content.replace(/from\s+["'](\.\.\/)+embed\/bridge["']/g, `from "${dotPath}/index"`);

  // 2. Rename store/hook usages in code
  content = content.replace(/\buseAuthStore\b/g, 'useCmsAuthStore');
  content = content.replace(/\buseSocketStore\b/g, 'useCmsSocketStore');
  content = content.replace(/\buseMessageStore\b/g, 'useCmsMessageStore');
  content = content.replace(/\buseDmStore\b/g, 'useCmsDmStore');
  content = content.replace(/\buseNotificationStore\b/g, 'useCmsNotificationStore');
  content = content.replace(/\buseUiStore\b/g, 'useCmsUiStore');
  content = content.replace(/\buseBatchStore\b/g, 'useCmsBatchStore');
  content = content.replace(/\buseSocket\b/g, 'useCmsSocket');

  // 3. Prefix Tailwind classes: only in pages and components
  // To avoid false positives, we look for className="..." and className={...}
  // Let's do a basic className replacement. For safety, we will prefix standard CSS classes,
  // but wait! Since we have prefix: 'cms-' in our tailwind.config.js, we must prefix all tailwind
  // utilities inside files.
  // Wait! Do we need to do this via regex or just write the script to do the text replacement first?
  // Let's do text replacement first to get all TypeScript compile issues solved.
  // The prefixing of CSS classes can be done by standard Tailwind build compiler!
  // Yes! The tailwind compiler reads the source files and generates the output CSS with prefixed classes.
  // Wait! No, Tailwind config's "prefix" option means the compiler EXPECTS the classes to be prefixed in the source files,
  // e.g. you write `cms-flex` instead of `flex`, and Tailwind then outputs `.cms-flex { display: flex }`.
  // If you don't prefix classes in your JSX, the browser won't find the styles!
  // So yes, we do need to prefix tailwind utility classes inside JSX files.
  // But wait, there is a large number of classes. Let's do the TS compilation and path fixes first,
  // verify it compiles, and then run class-prefixing! This splits the risk.

  fs.writeFileSync(filePath, content, 'utf8');
}

processDir(path.join(baseDir, 'components'));
processDir(path.join(baseDir, 'pages'));
console.log("Migration script ran successfully!");
