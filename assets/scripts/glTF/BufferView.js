import {isUndefined as _isUndefined} from 'lodash'

module.exports = class BufferView {
  constructor (id, bV, data) {
    this.id = id
    this.bufferID = bV.buffer
    this.target = bV.target
    this.dataView = new DataView(data, bV.byteOffset, bV.byteLength)

    this.gl = null
  }

  // TODO Don't deal with gl here
  buffer (gl, usage = gl.STATIC_DRAW) {
    if (_isUndefined(this.target)) return
    if (this.gl === null) {
      this.gl = gl.createBuffer()
    }
    gl.bindBuffer(this.target, this.gl)
    gl.bufferData(this.target, this.dataView, usage)
    gl.bindBuffer(this.target, null)
  }
}
