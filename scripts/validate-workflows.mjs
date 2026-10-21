import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = new URL('../n8n/workflows/', import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
let failed = 0;

for (const file of files) {
  try {
    const workflow = JSON.parse(await readFile(join(directory.pathname, file), 'utf8'));
    const names = new Set(workflow.nodes.map((node) => node.name));
    if (!workflow.name) throw new Error('missing workflow name');
    if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) throw new Error('missing nodes');
    for (const node of workflow.nodes) {
      if (!node.id || !node.name || !node.type || !node.typeVersion) {
        throw new Error(`node ${node.name ?? '?'} is missing id/name/type/typeVersion`);
      }
      if (!Array.isArray(node.position) || node.position.length !== 2) {
        throw new Error(`node ${node.name} has an invalid position`);
      }
    }
    for (const [source, outputs] of Object.entries(workflow.connections ?? {})) {
      if (!names.has(source)) throw new Error(`connection source ${source} is not a node`);
      for (const group of outputs.main ?? []) {
        for (const connection of group) {
          if (!names.has(connection.node)) throw new Error(`connection target ${connection.node} is not a node`);
        }
      }
    }
    console.log(`OK   ${file} — ${workflow.nodes.length} nodes`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${file}: ${error.message}`);
  }
}

if (files.length !== 9) {
  console.error(`Expected 9 workflows, found ${files.length}`);
  failed += 1;
}
process.exit(failed > 0 ? 1 : 0);
