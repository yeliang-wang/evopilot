import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyNativeAcceptance } from '../dist/expert/core/native-acceptance.js';

const keys = ['catalog', 'variants', 'instance-plan', 'instance-plan-digest', 'report', 'candidate-digest', 'phase'];
try {
  const args = process.argv.slice(2), values = {};
  if (args.length !== keys.length * 2) throw new Error('Require --catalog --variants --instance-plan --instance-plan-digest --report --candidate-digest --phase');
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (args[i] !== '--' + key || !keys.includes(key) || Object.hasOwn(values, key)) throw new Error('Unknown/repeated option');
    values[key] = args[i + 1];
  }
  const result = verifyNativeAcceptance({ targetPath: fileURLToPath(new URL('../governance/standards-v03.json', import.meta.url)), catalogPath: path.resolve(values.catalog), variantsPath: path.resolve(values.variants), instancePlanPath: path.resolve(values['instance-plan']), instancePlanDigest: values['instance-plan-digest'], reportPath: path.resolve(values.report), candidateDigest: values['candidate-digest'], phase: values.phase });
  console.log(JSON.stringify(result));
  if (result.completeness !== 'COMPLETE') process.exitCode = 1;
} catch (error) { console.error('Native evidence verification failed: ' + error.message); process.exitCode = 1; }
