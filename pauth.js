const https = require('https');
const fs = require('fs');
const nodemailer = require("nodemailer");

class PauthBuilder {
  async build() {

    let permsText;
    try {
      permsText = await fs.promises.readFile('pauth_perms.json')
    }
    catch (e) {
      await fs.promises.writeFile('pauth_perms.json', '{"/":{"readers":{"public":true}}}');
    }
    const allPerms = JSON.parse(permsText);

    let tokensText;
    try {
      tokensText = await fs.promises.readFile('pauth_tokens.json');
    }
    catch (e) {
      await fs.promises.writeFile('pauth_tokens.json', '{}');
    }
    const tokens = JSON.parse(tokensText);

    let config;
    try {
      const configText = await fs.promises.readFile('pauth_config.json');
      config = JSON.parse(configText);
    }
    catch (e) {
      config = {};
    }

    return new Pauth(config, allPerms, tokens);
  }
}

class Pauth {

  constructor(config, allPerms, tokens) {
    this._config = config;
    this._allPerms = allPerms;
    this._tokens = tokens;

    this._pendingVerifications = {};

    this._emailer = nodemailer.createTransport({
      host: config.smtp.server,
      port: config.smtp.port,
      secure: false, // true for 465, false for other ports
      auth: {
        user: config.smtp.username,
        pass: config.smtp.password,
      }
    });
  }

  async authenticate(email) {

    const key = createToken();

    const verifyUrl = `${this._config.host}?method=verify&key=${key}`;

    let info = await this._emailer.sendMail({
      from: `"pauth authenticator" <${this._config.smtp.sender}>`,
      to: email,
      subject: "Authentication request",
      text: `This is an email verification request from ${this._config.host}. Please click the following link to complete the verification:\n\n ${verifyUrl}`,
      //html: "<b>html Hi there</b>"
    });

    const promise = new Promise((resolve, reject) => {
      const signalDone = () => {
        const token = createToken();
        this._tokens[token] = {
          type: 'identity',
          email
        };
        this._persistTokens();
        resolve(token);
      };

      this._pendingVerifications[key] = signalDone;

      setTimeout(() => {
        delete this._pendingVerifications[key];
        reject();
      }, 60000);
    });

    return promise;
  }

  async authorize(token, request) {

    if (!token) {
      const key = createToken();

      const verifyUrl = `${this._config.host}?method=verify&key=${key}`;

      let info = await this._emailer.sendMail({
        from: `"pauth authorizer" <${this._config.smtp.sender}>`,
        to: request.email,
        subject: "Authorization request",
        text: `This is an email verification request from ${this._config.host}. Please click the following link to complete the verification:\n\n ${verifyUrl}`,
        //html: "<b>html Hi there</b>"
      });

      const promise = new Promise((resolve, reject) => {
        const signalDone = () => {
          const token = createToken();

          this._tokens[token] = {
            email: request.email,
            perms: request.perms,
          };
          this._persistTokens();

          resolve(token);
        };

        this._pendingVerifications[key] = signalDone;

        setTimeout(() => {
          delete this._pendingVerifications[key];
          reject();
        }, 60000);
      });

      token = await promise;
    }

    const perms = request.perms;

    for (const path in perms) {

      if (perms[path].read === true) {
        if (!this.canRead(token, path)) {
          return null;
        }
      }

      if (perms[path].write === true) {
        if (!this.canWrite(token, path)) {
          return null;
        }
      }

      if (perms[path].manage === true) {
        if (!this.canManage(token, path)) {
          return null;
        }
      }
    }

    return token;
  }

  verify(key) {

    if (this._pendingVerifications[key] === undefined) {
      return false;
    }

    this._pendingVerifications[key]();
    delete this._pendingVerifications[key];
    return true;
  }

  async addReader(token, path, ident) {
    this._assertManager(token, path);
    this._ensureReaders(path);
    this._allPerms[path].readers[ident] = true;
    await this._persistPerms();
  }

  async removeReader(token, path, ident) {
    this._assertManager(token, path);
    this._ensureReaders(path);
    this._allPerms[path].readers[ident] = false;
    await this._persistPerms();
  }

  async addWriter(token, path, ident) {
    this._assertManager(token, path);
    this._ensureWriters(path);
    this._allPerms[path].writers[ident] = true;
    await this._persistPerms();
  }

  async addManager(token, path, ident) {
    this._assertOwner(token, path);
    this._ensureManagers(path);
    this._allPerms[path].managers[ident] = true;
    await this._persistPerms();
  }

  async addOwner(token, path, ident) {
    this._assertOwner(token, path);
    this._ensureOwners(path);
    this._allPerms[path].owners[ident] = true;
    await this._persistPerms();
  }

  async getPerms(token) {
    return new Perms(this, token);
  }

  canRead(token, path) {
    const ident = this._getIdent(token);
    const parts = parsePath(path);
    const perms = this._getPerms(parts);

    if (perms.readers.public === true) {
      return true;
    }
    
    const identCanRead = perms.readers[ident] === true ||
      perms.writers[ident] === true ||
      perms.managers[ident] === true ||
      perms.owners[ident] === true;

    const tokenPerms = this._getTokenPerms(token, parts);
    if (tokenPerms === null) {
      return false;
    }

    const tokenCanRead = tokenPerms.read === true ||
      tokenPerms.write === true ||
      tokenPerms.manage === true ||
      tokenPerms.own === true;

    return identCanRead && tokenCanRead;
  }

  canWrite(token, path) {
    const ident = this._getIdent(token);
    const parts = parsePath(path);
    const perms = this._getPerms(parts);

    if (perms.writers.public === true) {
      return true;
    }

    const identCanWrite = perms.writers[ident] === true ||
      perms.managers[ident] === true ||
      perms.owners[ident] === true;

    const tokenPerms = this._getTokenPerms(token, parts);
    if (tokenPerms === null) {
      return false;
    }

    const tokenCanWrite = tokenPerms.write === true ||
      tokenPerms.manage === true ||
      tokenPerms.own === true;

    return identCanWrite && tokenCanWrite;
  }

  canManage(token, path) {
    const ident = this._getIdent(token);
    const parts = parsePath(path);
    const perms = this._getPerms(parts);

    const identCanManage = perms.managers[ident] === true ||
      perms.owners[ident] === true;

    const tokenPerms = this._getTokenPerms(token, parts);
    if (tokenPerms === null) {
      return false;
    }

    const tokenCanManage = tokenPerms.manage === true ||
      tokenPerms.own === true;

    return identCanManage && tokenCanManage;
  }

  canOwn(token, path) {
    const ident = this._getIdent(token);
    const parts = parsePath(path);
    const perms = this._getPerms(parts);

    const identCanOwn = perms.owners[ident] === true;

    const tokenPerms = this._getTokenPerms(token, parts);
    if (tokenPerms === null) {
      return false;
    }

    const tokenCanOwn = tokenPerms.own === true;

    return identCanOwn && tokenCanOwn;
  }

  _assertManager(token, path) {
    if (!this.canManage(token, path)) {
      throw new Error(`User does not have Manager permissions for path '${path}'`);
    }
  }

  _assertOwner(token, path) {
    if (!this.canOwn(token, path)) {
      throw new Error(`User does not have Owner permissions for path '${path}'`);
    }
  }

  _ensurePath(path) {
    if (!this._allPerms[path]) {
      this._allPerms[path] = {};
    }
  }

  _ensureReaders(path) {
    this._ensurePath(path);

    if (!this._allPerms[path].readers) {
      this._allPerms[path].readers = {};
    }
  }

  _ensureWriters(path) {
    this._ensurePath(path);

    if (!this._allPerms[path].writers) {
      this._allPerms[path].writers = {};
    }
  }

  _ensureManagers(path) {
    this._ensurePath(path);

    if (!this._allPerms[path].managers) {
      this._allPerms[path].managers = {};
    }
  }

  _ensureOwners(path) {
    this._ensurePath(path);

    if (!this._allPerms[path].owners) {
      this._allPerms[path].owners = {};
    }
  }

  _getPerms(pathParts) {
    const perms = {
      readers: {},
      writers: {},
      managers: {},
      owners: {},
    };

    Object.assign(perms.readers, this._allPerms['/'].readers);
    Object.assign(perms.writers, this._allPerms['/'].writers);
    Object.assign(perms.managers, this._allPerms['/'].managers);
    Object.assign(perms.owners, this._allPerms['/'].owners);

    let curPath = '';
    for (const part of pathParts) {
      curPath += '/' + part;
      if (this._allPerms[curPath]) {
        Object.assign(perms.readers, this._allPerms[curPath].readers);
        Object.assign(perms.writers, this._allPerms[curPath].writers);
        Object.assign(perms.managers, this._allPerms[curPath].managers);
        Object.assign(perms.owners, this._allPerms[curPath].owners);
      }
    }

    return perms;
  }

  _getTokenPerms(token, pathParts) {
    if (!this._tokens[token]) {
      return null;
    }

    const perms = this._tokens[token].perms;

    const tokenPerms = {
      read: false,
      write: false,
      manage: false,
      own: false,
    };

    if (perms['/'] !== undefined) {
      tokenPerms.read = perms['/'].read;
      tokenPerms.write = perms['/'].write;
      tokenPerms.manage = perms['/'].manage;
      tokenPerms.own = perms['/'].own;
    }

    let curPath = '';
    for (const part of pathParts) {
      curPath += '/' + part;
      if (perms[curPath]) {
        if (perms[curPath].read === true) {
          tokenPerms.read = true;
        }
        if (perms[curPath].write === true) {
          tokenPerms.write = true;
        }
        if (perms[curPath].manage === true) {
          tokenPerms.manage = true;
        }
        if (perms[curPath].own === true) {
          tokenPerms.own = true;
        }
      }
    }

    return tokenPerms;
  }

  async _persistPerms() {
    const permsJson = JSON.stringify(this._allPerms, null, 4);
    await fs.promises.writeFile('pauth_perms.json', permsJson);
  }

  async _persistTokens() {
    const tokensJson = JSON.stringify(this._tokens, null, 4);
    await fs.promises.writeFile('pauth_tokens.json', tokensJson);
  }

  _getIdent(token) {
    if (this._tokens[token]) {
      return this._tokens[token].email;
    }
    else {
      return 'public';
    }
  }
}

class Perms {
  constructor(pauth, token) {
    this._pauth = pauth;
    this._token = token;
  }

  canRead(path) {
    return this._pauth.canRead(this._token, path);
  }

  canWrite(path) {
    return this._pauth.canWrite(this._token, path);
  }
}

function arrayHas(a, item) {
  return -1 !== a.indexOf(item);
}

function parsePath(path) {
  if (path.endsWith('/')) {
    path = path.slice(0, path.length - 1);
  }

  if (path === '' || path === '/') {
    return [];
  }

  return path.slice(1).split('/');
}

function createToken() {
  const possible = "0123456789abcdefghijkmnpqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function genCluster() {
    let cluster = "";
    for (let i = 0; i < 32; i++) {
      const randIndex = Math.floor(Math.random() * possible.length);
      cluster += possible[randIndex];
    }
    return cluster;
  }

  let id = "";
  id += genCluster();
  //id += '-';
  //id += genCluster();
  //id += '-';
  //id += genCluster();
  return id;
}

module.exports = {
  PauthBuilder,
};
