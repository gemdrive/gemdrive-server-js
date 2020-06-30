const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { parseToken, parsePath, encodePath, buildGemDriveDir } = require('./utils.js');


async function handleImage(req, res, fsRoot, reqPath, pauth, emit) {


  const parts = parsePath(reqPath);
  const size = parseInt(parts[2]);

  const srcPathStr = encodePath(parts.slice(3));
  const srcFsPath = path.join(fsRoot, srcPathStr);

  const token = parseToken(req);
  const perms = await pauth.getPerms(token);

  if (!perms.canRead(srcPathStr)) {
    res.statusCode = 403;
    res.write("Unauthorized");
    res.end();
    return;
  }

  console.log(reqPath);

  if (reqPath.endsWith('remfs.json')) {

    const fsPath = path.join(fsRoot, path.dirname(reqPath));

    const remfs = await buildGemDriveDir(fsPath);
    res.write(JSON.stringify(remfs, null, 2));
    res.end();
    return;
  }

  if (size !== 32 && size !== 64 && size !== 128 && size !== 256 && 
    size !== 512 && size !== 1024 && size !== 2048) {
    res.statusCode = 404;
    res.write("Not Found");
    res.end();
    return;
  }

  // this avoids recursively creating thumbnails
  if (srcPathStr.includes('.gemdrive/images')) {
    const stream = fs.createReadStream(srcFsPath);

    stream.pipe(res);

    stream.on('error', (e) => {
      console.error(e);
      res.statusCode = 404;
      res.write("Not Found");
      res.end();
    });
  }
  else {
    const thumbDir = path.join(fsRoot, encodePath(parts.slice(0, parts.length - 1)));
    const thumbFsPath = path.join(fsRoot, reqPath);

    const stream = fs.createReadStream(thumbFsPath)
    stream.pipe(res);

    stream.on('error', async (e) => {

      try {
        await fs.promises.stat(srcFsPath);
        await fs.promises.mkdir(thumbDir, { recursive: true });

        sharp(srcFsPath)
          .resize(size, size, {
            fit: 'inside',
          })
          .toBuffer()
          .then(async (data) => {
            res.write(data);
            await fs.promises.writeFile(thumbFsPath, data);
            res.end();
          });
      }
      catch (e) {
        console.error(e);
        res.statusCode = 404;
        res.write("Not Found");
        res.end();
        return;
      }
    });
  }
}


module.exports = {
  handleImage,
};
