const {rollup} = require('rollup');
const config = require('../rollup.config.js');
(async () => {
  const bundle = await rollup(config);
  try { await bundle.write(config.output); }
  finally { await bundle.close(); }
  console.log('Built main.js');
})().catch(error => { console.error(error); process.exitCode = 1; });
