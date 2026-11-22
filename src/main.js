'use strict';

const { createServer, createStore, defaultSeed } = require('./server');

const port = Number(process.env.PORT || 3000);
createServer(createStore(defaultSeed())).listen(port, () => {
  console.log(`audit-log server listening on :${port}`);
});
