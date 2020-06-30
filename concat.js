const fs = require('fs');
const path = require('path');
const { parseToken, parsePath, encodePath } = require('./utils.js');

async function handleConcat(req, res, params, fsRoot, reqPath, pauth) {
  console.log(reqPath, params);

  const tokenName = 'remfs-token';
  const token = parseToken(req, tokenName);
  const perms = await pauth.getPerms(token);

  const dstAbsPath = getAbsPath(params.dstFile, reqPath);

  const dstFsPath = fsRoot + dstAbsPath;

  const writeStream = fs.createWriteStream(dstFsPath);

  if (!perms.canRead(dstAbsPath)) {
    res.statusCode = 403;
    res.write(`No permission to write '${dstAbsPath}'`);
    res.end();
    return;
  }

  // check perms
  for (const filePath of params.srcFiles) {

    const absPath = getAbsPath(filePath, reqPath);

    if (!perms.canRead(absPath)) {
      res.statusCode = 403;
      res.write(`No permission to write '${absPath}'`);
      res.end();
      return;
    }

    const fsPath = fsRoot + absPath;

    try {
      await fs.promises.stat(fsPath);
    }
    catch (e) {
      res.statusCode = 404;
      res.write(`Not found: '${absPath}'`);
      res.end();
      return;
    }

    // pipe the src files one at a time
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(fsPath);
      readStream.on('error', (e) => {
        reject(e);
      });

      readStream.pipe(writeStream, { end: false });
      readStream.on('end', resolve);
    });
  }

  writeStream.end();

  res.end();
}

function getAbsPath(filePath, reqPath) {
  let absPath;
  if (filePath.startsWith('/')) {
    absPath = filePath;
  }
  else {
    absPath = '/' + reqPath + '/' + filePath;
  }
  return absPath;
}

module.exports = {
  handleConcat,
};
