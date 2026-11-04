import {execFileSync} from "node:child_process";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
await mkdir("dist",{recursive:true});
if(!process.env.npm_execpath)throw new Error("Run npm run pack:deliverable.");
const [packed]=JSON.parse(execFileSync(process.execPath,[process.env.npm_execpath,"pack","--ignore-scripts","--pack-destination","dist","--json"],{encoding:"utf8"}));
const bytes=await readFile("dist/"+packed.filename);
await writeFile("dist/"+packed.filename+".json",JSON.stringify({name:packed.name,version:packed.version,sha256:createHash("sha256").update(bytes).digest("hex"),license:"Apache-2.0",files:packed.files.map(file=>file.path)},null,2)+"\n");
console.log(packed.filename);
