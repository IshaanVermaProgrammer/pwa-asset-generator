import { writeFile,createWriteStream } from "fs";
import { manifestObject } from "./manifestObject";
import { get } from "https";  
const manifestPath="manifest.webmanifest";
function writeManifest(modOptions){
if (!modOptions.manifest){
      writeFile(`${__dirname}/${manifestPath}`,JSON.stringify(manifestObject),err=>{
      if (err) console.error(err)
      console.log('Successfully created web app manifest'); 
      });
      modOptions.manifest=manifestPath;
       }
}
function writeSW(){
get("https://sw-js.netlify.app/sw.js",res=> {
    const path = `${__dirname}/sw.js`; 
    const filePath = createWriteStream(path);
    res.pipe(filePath);
    filePath.on('finish',() => {
        filePath.close();
        console.log('Successfully created service worker'); 
    })
})
}
