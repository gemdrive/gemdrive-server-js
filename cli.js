#!/usr/bin/env node

const process = require('process');
const http = require('http');
const { createHandler } = require('./index.js');

const args = process.argv
  .slice(2)
  .map(arg => arg.split('='))
  .reduce((args, [value, key]) => {
      args[value] = key;
      return args;
  }, {});


const port = args['--port'] ? args['--port'] : 3838;
const dir = args['--dir'] ? args['--dir'] : './';
const rootPath = args['--root-path'] ? args['--root-path'] : '';
const securityMode = args['--security-mode'] ? args['--security-mode'] : '';
const ownerEmail = args['--email'] ? args['--email'] : '';

// Listen on all interfaces by default (0.0.0.0), but if securityMode is
// 'local' only bind to localhost unless overridden.
let host;
if (args['--host']) {
  host = args['--host'];
}
else {
  host = securityMode === 'local' ? '127.0.0.1' : '0.0.0.0';
}


(async () => {
  const remfsHandler = await createHandler({ rootPath, dir, securityMode, ownerEmail });
  const httpServer = http.createServer(remfsHandler);
  if (securityMode === 'local') {
    httpServer.listen(port, host);
  }
  else {
    httpServer.listen(port);
  }
})();
