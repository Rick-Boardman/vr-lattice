// Preserve deployed /lattice/ and /halo/ module URLs in a standalone browser build.
import {cp,mkdir,readdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const out=path.join(root,"dist/browser");await mkdir(out,{recursive:true});
for(const item of ["src","docs","README.md","AGENTS.md","CONTRIBUTING.md","SECURITY.md","LICENSE","NOTICE","THIRD_PARTY.md","LICENSES","package.json"])await cp(path.join(root,item),path.join(out,item),{recursive:true});
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){
 const file=path.join(dir,item.name);if(item.isDirectory()){await walk(file);continue;}if(!file.endsWith(".js"))continue;
 const relative=path.relative(out,file).split(path.sep).join("/");
 const specifier=target=>{const result=path.posix.relative(path.posix.dirname("/lattice/"+relative),target);return result.startsWith(".")?result:"./"+result;};
 const source=await readFile(file,"utf8");
 const built=source.replace(/(["'])@rb\/halo\/src\/([^"']+)\1/g,(_,q,module)=>q+specifier("/halo/src/"+module)+q).replace(/(["'])@dagrejs\/dagre\1/g,(_,q)=>q+specifier("/lattice/node_modules/@dagrejs/dagre/dist/dagre.esm.js")+q);
 await writeFile(file,built);
}}
await walk(path.join(out,"src"));
const vendor="node_modules/@dagrejs/dagre/dist/dagre.esm.js";await mkdir(path.dirname(path.join(out,vendor)),{recursive:true});await cp(path.join(root,vendor),path.join(out,vendor));
console.log("Browser distribution: dist/browser (Halo remains application-provided)");
