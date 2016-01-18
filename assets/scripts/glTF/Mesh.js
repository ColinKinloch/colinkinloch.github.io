module.exports = class Mesh {
  constructor (id, mesh) {
    this.id = id
    this.name = mesh.name
    this.primitives = []
    // this. = mesh
  }
  addPrimitive (...primitives) {
    this.primitives.push(...primitives)
  }
}
