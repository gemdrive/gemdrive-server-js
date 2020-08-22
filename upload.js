const fs = require('fs');
const path = require('path');
const { ByteCounterStream } = require('./byte_counter.js');
const { parseToken, parsePath, encodePath, buildJsonListing } = require('./utils.js');


async function handleUpload(req, res, fsRoot, reqPath, pauth, emit) {
  const token = parseToken(req);

  const perms = await pauth.getPerms(token);

  if (!perms.canWrite(reqPath)) {
    res.statusCode = 403;
    res.write("Unauthorized");
    res.end();
    return;
  }

  const fsPath = fsRoot + '/' + reqPath;
  const pathParts = parsePath(reqPath);

  // TODO: Might not need to traverse here. Maybe just check if the parent
  // path exists.
  let curDir = fsRoot;
  for (const pathPart of pathParts.slice(0, pathParts.length - 1)) {
    curDir += '/' + pathPart;

    try {
      await fs.promises.stat(curDir);
    }
    catch (e) {
      res.statusCode = 400;
      res.write(e.toString());
      res.end();
      return;
    }
  }

  const stream = fs.createWriteStream(fsPath);

  // emit updates every 10MB
  const updateByteCount = 10*1024*1024;
  let count = 0;
  const byteCounter = new ByteCounterStream(updateByteCount, (n) => {
    count += n;
    emit(reqPath, {
      type: 'update',
      remfs: {
        size: count,
      },
    });
  });

  emit(reqPath, {
    type: 'start',
    remfs: {
      size: 0,
    },
  });

  req
    .pipe(byteCounter)
    .pipe(stream);

  req.on('end', async () => {
    const remfsPath = path.dirname(fsPath);
    const filename = path.basename(fsPath);

    const remfs = await buildJsonListing(remfsPath);
    res.write(JSON.stringify(remfs.children[filename], null, 2));

    emit(reqPath, {
      type: 'complete',
      remfs: {
        size: remfs.children[filename].size,
      },
    });

    res.end();
  });
}

module.exports = {
  handleUpload,
};
