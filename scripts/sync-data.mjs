import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
// Explicit local source only: no implicit network fetch or deploy.
const root=path.resolve(process.argv[2]||'../cf23-data/public');
const read=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
const manifest=await read('manifest.json');
const version=await read('last-updated.json');
const catalog=await read(manifest.catalog),fandoms=await read(manifest.fandomRegistry),map=await read(manifest.map.path);
if(!String(catalog.schemaVersion).startsWith('1.')||!String(fandoms.schemaVersion).startsWith('1.')||map.layout.schemaVersion!==2||map.version!==manifest.map.version)throw Error('Source schemas or versions do not match');
await mkdir('public/data',{recursive:true});
for(const [file,value] of Object.entries({'catalog-initial':catalog,'fandoms-initial':fandoms,'last-updated-initial':version,'map':map.layout,'booth-proximity':map.proximity,'map-version':{version:map.version}}))await writeFile(`public/data/${file}.json`,JSON.stringify(value));
console.log(`Bundled catalog ${version.creator_data_version}, map ${map.version}. Run tests and rebuild to publish these fallbacks.`);
