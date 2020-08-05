const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { parseToken, parsePath, encodePath, buildGemDriveDir } = require('./utils.js');


async function handleImage(req, res, fsRoot, reqPath, pauth, emit) {

  const token = parseToken(req);
  const perms = await pauth.getPerms(token);

  const index = reqPath.indexOf('.gemdrive-img-');

  const srcPathStr = reqPath.slice(0, index);

  if (!perms.canRead(srcPathStr)) {
    res.statusCode = 403;
    res.write("Unauthorized");
    res.end();
    return;
  }

  const numStr = reqPath.slice(index + '.gemdrive-img-'.length, -4);
  const size = parseInt(numStr); 

  if (size !== 32 && size !== 64 && size !== 128 && size !== 256 && 
    size !== 512 && size !== 1024 && size !== 2048) {
    res.statusCode = 404;
    res.write("Not Found");
    res.end();
    return;
  }

  const srcFsPath = path.join(fsRoot, srcPathStr);

  const thumbDir = path.join('gemdrive/images/', path.dirname(reqPath));
  const thumbFsPath = path.join('gemdrive/images/', reqPath);

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


module.exports = {
  handleImage,
};
