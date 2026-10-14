import {fileURLToPath} from 'node:url';
export default {root:fileURLToPath(new URL('..',import.meta.url)),test:{globals:true,include:['data/registration-checker-probe.test.mjs'],
  fileParallelism:false,maxWorkers:1,testTimeout:15000}};
