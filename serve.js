'use strict';
const _ = require('lodash')

const server = require('./server')

const site = require('./site.config')

let opts = {
  http: {
    host: '0.0.0.0',
    port: 8080
  }/*,
  https: {
    host: '0.0.0.0',
    port: 8181
  },
  tls: {
    key: `/etc/letsencrypt/live/${site.url}/privkey.pem`,
    cert: `/etc/letsencrypt/live/${site.url}/fullchain.pem`
  }*/
}

_.merge(opts, {
  http: {
    ready: () => {
      console.log(`HTTP listening at //${opts.http.host}:${opts.http.port}`)
    }
  }/*,
  https: {
    ready: () => {
      console.log(`HTTPS listening at //${opts.https.host}:${opts.https.port}`)
    }
  }*/
})

server(opts)
