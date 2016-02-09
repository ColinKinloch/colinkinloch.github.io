import glm from 'gl-matrix'

module.exports = class Node3D {
  constructor (node) {
    this.name = node.name
    this.children = new Set()
    this.meshes = new Set()
    if (node.matrix) {
      this.matrix = glm.mat4.clone(node.matrix)
    } else if (node.rotation && node.scale && node.translation) {
      this.matrix = glm.mat4.create()
      glm.mat4.fromRotationTranslation(this.matrix, node.rotation, node.translation)
      glm.mat4.scale(this.matrix, this.matrix, node.scale)
      /* TODO Do this?
      this.scale = glm.vec3.clone(node.scale)
      this.rotation = glm.quat.clone(node.rotation)
      this.translation = glm.vec3.clone(node.translation)
      */
    } else {
      this.matrix = glm.mat4.create()
    }
  }
  traverse (func) {
    func(this)
    for (const node of this.children) {
      node.traverse(func)
    }
  }
}
