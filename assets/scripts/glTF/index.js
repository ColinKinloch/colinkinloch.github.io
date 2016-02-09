import {TextDecoder} from 'text-encoding'

import BufferView from './BufferView'
import Shader from './Shader'
import Program from './Program'
import Accessor from './Accessor'
import Technique from './Technique'
import Mesh from './Mesh'
import Node3D from './Node3D'

const detectMime = (response) => {
  switch (response.headers.get('Content-Type')) {
    case 'application/octet-stream':
    case 'model/glTF+binary':
      return response.arrayBuffer()
    default:
    case 'application/json':
    case 'application/javascript':
    case 'text/json':
    case 'text/plain':
      return response.json()
  }
}

const parseGLTF = (scene) => {
  return new Promise((resolve, reject) => {
    resolve({
      scene: scene,
      buffers: new Map()
    })
  })
}

const utf8 = new TextDecoder('utf-8')
const parseBinary = (glb) => {
  return new Promise((resolve, reject) => {
    const magic = utf8.decode(new DataView(glb, 0, 4))
    if (magic !== 'glTF') reject(new Error('Magic number not "glTF"'))
    const header = new Uint32Array(glb, 4, 4) // [version, length, sceneLength, sceneFormat]
    const scene = JSON.parse(utf8.decode(new Uint8Array(glb, 20, header[2])))
    const body = glb.slice(20 + header[2])
    resolve({
      version: header[0],
      scene: scene,
      buffers: new Map([['KHR_binary_glTF', body]])
    })
  })
}

const getBuffers = (glTF) => {
  return new new Promise((resolve, reject) => {
    resolve(glTF)
  })
}

const processGLTF = (glTF) => {
  return new Promise((resolve, reject) => {
    const r = glTF.root = {
      accessors: new Map(),
      bufferViews: new Map(),
      shaders: new Map(),
      programs: new Map(),
      techniques: new Map(),
      images: new Map(),
      meshes: new Map(),
      nodes: new Map(),
      buffers: glTF.buffers
    }
    const bVs = glTF.scene.bufferViews
    const accs = glTF.scene.accessors
    const meshes = glTF.scene.meshes
    const nodes = glTF.scene.nodes
    const shads = glTF.scene.shaders
    const progs = glTF.scene.programs
    const techs = glTF.scene.techniques
    const imgs = glTF.scene.images
    for (const i in bVs) {
      const rBV = bVs[i]
      const bV = new BufferView(i, rBV, glTF.buffers.get(rBV.buffer))
      r.bufferViews.set(i, bV)
    }
    for (const i in accs) {
      const rAcc = accs[i]
      const acc = new Accessor(i, rAcc, r.bufferViews.get(rAcc.bufferView))
      r.accessors.set(i, acc)
    }
    for (const i in shads) {
      const rShad = shads[i]
      const src = utf8.decode(r.bufferViews.get(rShad.extensions.KHR_binary_glTF.bufferView).dataView)
      const shad = new Shader(rShad.type, src)
      r.shaders.set(i, shad)
    }
    for (const i in progs) {
      const rProg = progs[i]
      const prog = new Program()
      for (const t of ['vertexShader', 'fragmentShader']) prog.shaders.add(r.shaders.get(rProg[t]))
      for (const a of rProg.attributes) prog.attributes.add(a)
      r.programs.set(i, prog)
    }
    for (const i in techs) {
      const rTech = techs[i]
      const tech = new Technique(r.programs.get(rTech.program))
      for (const a in rTech.attributes) tech.attributes.set(a, rTech.attributes[a])
      r.techniques.set(i, tech)
    }
    for (const i in imgs) {
      const rImg = imgs[i]
      // r.bufferView.get(rImg.extensions.KHR_binary_glTF.bufferView).dataView
      // console.log(rImg)
    }
    for (const i in meshes) {
      const rMesh = meshes[i]
      const mesh = new Mesh(i, rMesh)
      for (const rPrim of rMesh.primitives) {
        const attribs = new Map()
        for (const ai in rPrim.attributes) attribs.set(ai, r.accessors.get(rPrim.attributes[ai]))
        mesh.addPrimitive({
          attributes: attribs,
          indices: r.accessors.get(rPrim.indices),
          material: null,
          mode: rPrim.mode
        })
      }
      r.meshes.set(i, mesh)
    }
    for (const i in nodes) {
      const rNode = nodes[i]
      const node = new Node3D(rNode)
      // HACK Symbol.iterator of undefined if meshes is undefined
      if (rNode.meshes) for (const mi of rNode.meshes) node.meshes.add(r.meshes.get(mi))
      r.nodes.set(i, node)
    }
    for (const i in nodes) {
      const rNode = nodes[i]
      const node = r.nodes.get(i)
      for (const ci of rNode.children) {
        node.children.add(r.nodes.get(ci))
      }
    }
    resolve(glTF)
  })
}

export {
  parseBinary,
  processGLTF,
  detectMime,
  getBuffers
}
