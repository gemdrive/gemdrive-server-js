const fs = require('fs');
const path = require('path');


async function renderHtmlDir(req, res, rootPath, reqPath, fsPath) {
  let filenames;
  try {
    filenames = await fs.promises.readdir(fsPath);
  }
  catch (e) {
    res.statusCode = 500;
    res.write("Error reading directory");
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'text/html');

  let pathParts = reqPath.split('/');

  let listing;
  if (pathParts.length > 1) {
    pathParts.pop();
    const parentUrl = rootPath + pathParts.join('/');
    listing = `<a href=../>..[parent]</a> &#128193`;
  }
  else {
    listing = '';
  }

  for (const filename of filenames) {

    //const url = rootPath + reqPath + '/' + filename;
    const url = './' + filename;
    const childFsPath = path.join(fsPath, filename);

    let childStats;
    try {
      childStats = await fs.promises.stat(childFsPath);
    }
    catch (e) {
      console.error("This one shouldn't happen");
      console.error(e);
      continue;
    }

    let link;
    if (childStats.isDirectory()) {
      link = `<a href=${url}/>${filename}</a> &#128193`;
    }
    else {
      link = `<a target='_blank' href=${url}>${filename}</a>`;
    }

    listing += `
      <div>
        ${link}
      </div>
    `;
  }

  const html = `
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>GemDrive</title>
      </head>

      <body>
        <div style='margin: 0 auto; max-width: 640px; font-size: 24px;'>
          ${listing}
        </div>
      </body>
    </html>
  `;

  res.write(html);
  res.end();
}

module.exports = { renderHtmlDir };
