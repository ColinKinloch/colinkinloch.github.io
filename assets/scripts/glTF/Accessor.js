import {isUndefined as _isUndefined} from 'lodash'

module.exports = class Accessor {
  constructor (id, acc, buffer) {
    this.id = id
    this.bufferViewID = acc.bufferView
    this.byteOffset = acc.byteOffset
    this.byteStride = acc.byteStride
    // Assuming GL type
    this.componentType = acc.componentType
    this.count = acc.count
    if (!_isUndefined(acc.max)) this.max = acc.max.slice()
    if (!_isUndefined(acc.min)) this.min = acc.min.slice()
    this.type = acc.type

    switch (this.type) {
      case 'SCALAR':
        this.size = 1
        break
      case 'VEC2':
        this.size = 2
        break
      case 'VEC3':
        this.size = 3
        break
      case 'VEC4':
        this.size = 4
        break
      case 'MAT2':
        this.size = 4
        break
      case 'MAT3':
        this.size = 9
        break
      case 'MAT4':
        this.size = 16
        break
    }
    this.buffer = buffer
  }
}
