'use strict';

const fs = require('fs')
const https = require('https')

module.exports = (opts) => {
  const koa = require('koa')
  const serve = require('koa-static')
  var httpServer, httpsServer
  httpServer = koa()
    .use(serve('dist'))
    // TODO 404
    .use(function *() {
      this.body = 'File not found'
      this.status = 404
    })

  httpServer.listen(opts.http.port, opts.http.host, opts.http.ready)

  if (opts.https) {
    httpsServer = https.createServer({
      key: fs.readFileSync(opts.tls.key),
      cert: fs.readFileSync(opts.tls.cert)
    }, httpServer.callback())
    httpsServer.listen(opts.https.port, opts.https.host, opts.https.ready)
  }
  return {
    http: httpServer,
    https: httpsServer
  }
}
