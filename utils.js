const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');

function parseToken(req) {

  const tokenName = 'access_token';

  const cookies = parseCookies(req.headers.cookie);

  if (cookies[tokenName]) {
    return cookies[tokenName];
  }

  const u = url.parse(req.url); 
  const params = querystring.parse(u.query);

  if (params[tokenName]) {
    return params[tokenName];
  }

  if (req.headers[tokenName]) {
    return req.headers[tokenName];
  }

  if (req.body){
    const body = JSON.parse(req.body);
    if (body.params && body.params[tokenName]) {
      return body.params[tokenName];
    }
  }

  return null;
}

// taken from https://stackoverflow.com/a/31645958/943814
function parseCookies(cookie) {
  let rx = /([^;=\s]*)=([^;]*)/g;
  let obj = { };
  for ( let m ; m = rx.exec(cookie) ; )
    obj[ m[1] ] = decodeURIComponent( m[2] );
  return obj;
}

function parsePath(pathStr) {
  if (pathStr === '/') {
    return [];
  }
  return pathStr.split('/').slice(1);
}
// TODO: keep an eye on the new version above and make sure we haven't
// broken anything
//function parsePath(path) {
//  if (path.endsWith('/')) {
//    path = path.slice(0, path.length - 1);
//  }
//
//  if (path === '' || path === '/') {
//    return [];
//  }
//
//  return path.split('/');
//}


function encodePath(parts) {
  return '/' + parts.join('/');
}

async function buildRemfsDir(fsPath) {

  let filenames;
  try {
    filenames = await fs.promises.readdir(fsPath);
  }
  catch (e) {
    return null;
  }

  const remfs = {
    type: 'dir',
    children: {},
  };

  const localRemfs = await readLocalRemfs(fsPath);
  Object.assign(remfs, localRemfs);

  let totalSize = 0;

  for (const filename of filenames) {
    const childFsPath = path.join(fsPath, filename);

    let stats;
    try {
      stats = await fs.promises.stat(childFsPath);
    }
    catch (e) {
      console.error("This one shouldn't happen");
      console.error(e);
      continue;
    }

    totalSize += stats.size;

    if (stats.isDirectory()) {
      remfs.children[filename] = {
        type: 'dir',
        size: stats.size,
      };
      //remfs.children[filename] = await buildRemfsDir(childFsPath);
    }
    else {
      remfs.children[filename] = {
        type: 'file',
        size: stats.size,
      };
    }
  }

  remfs.size = totalSize;

  return remfs;
}

async function readLocalRemfs(fsPath) {
  const localRemfsPath = path.join(fsPath, 'remfs.json');
  try {
    const localRemfsDataText = await fs.promises.readFile(localRemfsPath, {
      encoding: 'utf8',
    });
    const localRemfsData = JSON.parse(localRemfsDataText);
    return localRemfsData;
  }
  catch (e) {
    //console.log("no remfs in", fsPath);
  }
}

function getMime(ext) {
  switch (ext) {
    case '.js':
      return 'application/javascript';
    case '.json':
      return 'application/json';
    case '.html':
      return 'text/html';
    case '.css':
      return 'text/css';
    case '.jpeg':
    case '.jpg':
    case '.JPEG':
    case '.JPG':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
  }
}

module.exports = {
  parseToken,
  parsePath,
  encodePath,
  buildRemfsDir,
  getMime,
};
