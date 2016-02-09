'use strict'

import {get as _get, pick as _pick} from 'lodash'
import performance from 'usertiming'

import glm from 'gl-matrix'
import {processGLTF, parseBinary, detectMime} from './glTF'

import shaderMainVertex from './shaders/main.glslv'
import shaderMainFragment from './shaders/main.glslf'
import shaderPostVertex from './shaders/lib/post.glslv'
import shaderPostDithering from './shaders/dithering.glslf'

const navigationStart = _get(performance, 'timing.navigationStart') || +(new Date())

const shaderProgram = (gl, shaders) => {
  for (const shader of shaders) {
    const shad = gl.createShader(shader[0])
    const source = shader[1]
    gl.shaderSource(shad, source)
    gl.compileShader(shad)
    if (!gl.getShaderParameter(shad, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shad))
      const s = source.split('\n')
      let source = ''
      let i = 0
      for (let l of s) {
        i++
        source += `${i}:${l}\n`
      }
      console.error(source)
    }
    shaders.set(shader[0], shad)
  }
  const prog = gl.createProgram()
  for (const shader of shaders) gl.attachShader(prog, shader[1])
  gl.linkProgram(prog)
  return prog
}

const createFramebuffer = (gl) => {
  const frame = gl.createFramebuffer()
  const depth = gl.createRenderbuffer()
  const colour = gl.createTexture()
  gl.bindFramebuffer(gl.FRAMEBUFFER, frame)
  gl.bindTexture(gl.TEXTURE_2D, colour)
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colour, 0)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 32, 32, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth)
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 32, 32)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.bindRenderbuffer(gl.RENDERBUFFER, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.bindTexture(gl.TEXTURE_2D, null)
  return {
    frame: frame,
    depth: depth,
    colour: colour
  }
}

let bigTriangle, bayerTex
const drawToFramebuffer = (gl, program, source) => {
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, bigTriangle)
  const posLoc = gl.getAttribLocation(program, 'position')
  const frameUniform = gl.getUniformLocation(program, 'frame')
  gl.vertexAttribPointer(posLoc, 2, gl.UNSIGNED_BYTE, false, 0, 0)
  // gl.viewport(0, 0, size[0], size[0])
  gl.uniform1i(frameUniform, 0)
  gl.activeTexture(gl.TEXTURE0 + 0)
  gl.bindTexture(gl.TEXTURE_2D, source.colour)

  gl.enableVertexAttribArray(posLoc)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.disableVertexAttribArray(posLoc)

  gl.bindTexture(gl.TEXTURE_2D, null)
  gl.bindBuffer(gl.ARRAY_BUFFER, null)
}

{
  let render, step
  let scenes = new Map()
  let scene = {
    meshes: new Map(),
    nodes: new Map()
  }

  const updateModel = (model) => {
    // TODO clean up graphics memory, create renderer, state management etc.
    if (scenes.has(model)) return (scene = scenes.get(model))
    fetch(model)
      .then(detectMime)
      .then(parseBinary)
      .then(processGLTF)
      .then((g) => {
        console.log(g)
        scenes.set(model, g.root)
        scene = g.root
        for (const bV of scene.bufferViews) bV[1].buffer(gl)
        render()
      })
      .catch((err) => {
        console.error(err)
      })
  }

  const settingsEl = document.querySelector('div#settings')
  const main = document.querySelector('main.site-main')
  const canvas = document.createElement('canvas')
  const background = document.querySelector('#background')

  const showBackgroundButton = settingsEl.querySelector('#show-background')
  const playBackgroundButton = settingsEl.querySelector('#play-background')
  const darkBackgroundButton = settingsEl.querySelector('#dark-background')
  const modelBackgroundSelect = settingsEl.querySelector('#model-background')

  const graphicSettings = {
    _background: false,
    _play: false,
    _dark: false,
    _model: modelBackgroundSelect.value,
    set dark (value) {
      this._dark = value
      document.body.classList.toggle('dark', this._dark)
      darkBackgroundButton.classList.toggle('fa-moon-o', !this._dark)
      darkBackgroundButton.classList.toggle('fa-sun-o', this._dark)
      sessionStorage.setItem('graphicSettings', JSON.stringify(this))
    },
    get dark () { return this._dark },
    set background (value) {
      this._background = value
      main.classList.toggle('shrink', this._background)
      showBackgroundButton.classList.toggle('fa-picture-o', !this._background)
      showBackgroundButton.classList.toggle('fa-align-left', this._background)
      sessionStorage.setItem('graphicSettings', JSON.stringify(this))
    },
    get background () { return this._background },
    set play (value) {
      this._play = value
      playBackgroundButton.classList.toggle('fa-pause', this.play)
      playBackgroundButton.classList.toggle('fa-play', !this.play)
      sessionStorage.setItem('graphicSettings', JSON.stringify(this))
      step()
    },
    get play () { return this._play },
    set model (value) {
      this._model = value
      modelBackgroundSelect.value = this.model
      updateModel(`/${this._model}`)
      sessionStorage.setItem('graphicSettings', JSON.stringify(this))
    },
    get model () { return this._model },
    toJSON: function () {
      return _pick(this, ['play', 'model', 'dark'])
    }
  }

  { let c; while ((c = background.lastChild)) c.remove() }
  background.appendChild(canvas)
  const gl = window.gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false,
    depth: true,
    failIfMajorPerformanceCaveat: false
  })

  {
    const showButEv = () => {
      graphicSettings.background = !graphicSettings.background
    }
    const playButEv = () => {
      graphicSettings.play = !graphicSettings.play
    }
    const darkButEv = () => {
      graphicSettings.dark = !graphicSettings.dark
    }
    showBackgroundButton.addEventListener('click', showButEv)
    // showBackgroundButton.addEventListener('touchend', showButEv)
    playBackgroundButton.addEventListener('click', playButEv)
    // playBackgroundButton.addEventListener('touchend', playButEv)
    darkBackgroundButton.addEventListener('click', darkButEv)
    // darkBackgroundButton.addEventListener('touchend', darkButEv)
    modelBackgroundSelect.addEventListener('change', (ev) => {
      graphicSettings.model = ev.target.value
    })
  }

  let now = performance.now()
  let dt = 0

  const size = {
    left: {
      width: 0,
      height: 0
    },
    right: {
      width: 0,
      height: 0
    },
    width: 0,
    height: 0,
    ratio: devicePixelRatio,
    mult: 1
  }

  const mats = new Map([
    ['MODELVIEW', glm.mat4.create()],
    ['PROJECTION', glm.mat4.create()],
    ['MODELVIEWINVERSETRANSPOSE', glm.mat3.create()]
  ])

  const frames = [
    createFramebuffer(gl),
    createFramebuffer(gl)
  ]

  const resize = () => {
    size.width = canvas.clientWidth
    size.height = canvas.clientHeight
    size.ratio = devicePixelRatio
    size.mult = 1
    size.left.width = main.offsetLeft
    size.left.height = size.height
    size.right.width = size.width - (size.left.width + main.clientWidth)
    size.right.height = size.height
    canvas.width = size.width
    canvas.height = size.height
    gl.viewport(0, 0, size.width, size.height)
    for (const frame of frames) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, frame.depth)
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size.width, size.height)
      gl.bindRenderbuffer(gl.RENDERBUFFER, null)
      gl.bindTexture(gl.TEXTURE_2D, frame.colour)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size.width, size.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.bindTexture(gl.TEXTURE_2D, null)
    }
    render()
  }
  console.dir(canvas)

  addEventListener('resize', resize)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  gl.enable(gl.DEPTH_TEST)
  gl.depthFunc(gl.LEQUAL)

  gl.enable(gl.CULL_FACE)
  gl.frontFace(gl.CCW)
  gl.cullFace(gl.BACK)

  // TODO Fix alpha on iOS 8
  gl.clearColor(1, 1, 1, 0)
  gl.clearDepth(1)
  gl.viewport(0, 0, size.width, size.height)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

  const ditherPost = shaderProgram(gl, new Map([
    [gl.VERTEX_SHADER, shaderPostVertex],
    [gl.FRAGMENT_SHADER, shaderPostDithering]
  ]))
  const bayerLoc = gl.getUniformLocation(ditherPost, 'bayer')
  gl.useProgram(ditherPost)
  gl.uniform1i(bayerLoc, 2)
  gl.useProgram(null)

  bigTriangle = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, bigTriangle)
  gl.bufferData(gl.ARRAY_BUFFER, new Int8Array([
    0, 0,
    4, 0,
    0, 4
  ]), gl.STATIC_DRAW)

  bayerTex = gl.createTexture()
  {
    let bayer = new Uint8Array([
       1, 49, 13, 61,  4, 52, 16, 64,
      33, 17, 45, 29, 36, 20, 48, 32,
       9, 57,  5, 53, 12, 60,  8, 56,
      41, 25, 37, 21, 44, 28, 40, 24,
       3, 51, 15, 63,  2, 50, 14, 62,
      35, 19, 47, 31, 34, 18, 46, 30,
      11, 59,  7, 55, 10, 58,  6, 54,
      43, 27, 39, 23, 42, 26, 38, 22
    ])
    let bm = 255 / 65
    let width, height
    width = height = 8
    let channels = 1
    let pixels = new Uint8Array(width * height * channels)

    for (let i in bayer) {
      let p = i * channels
      let v = bayer[i] * bm
      pixels[p] = v
    }

    let format
    switch (channels) {
      case 1:
        format = gl.ALPHA
        break
      case 3:
        format = gl.RGB
        break
      case 4:
        format = gl.RGBA
    }

    gl.bindTexture(gl.TEXTURE_2D, bayerTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, format, gl.UNSIGNED_BYTE, pixels)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  const mainProg = shaderProgram(gl, new Map([
    [gl.FRAGMENT_SHADER, shaderMainFragment],
    [gl.VERTEX_SHADER, shaderMainVertex]])
  )
  gl.useProgram(mainProg)

  const unis = new Map([
    ['MODELVIEW', gl.getUniformLocation(mainProg, 'modelViewMatrix')],
    ['PROJECTION', gl.getUniformLocation(mainProg, 'projectionMatrix')],
    ['MODELVIEWINVERSETRANSPOSE', gl.getUniformLocation(mainProg, 'normalMatrix')]
  ])

  const attrs = new Map([
    ['POSITION', gl.getAttribLocation(mainProg, 'position')],
    ['NORMAL', gl.getAttribLocation(mainProg, 'normal')]
  ])

  const quat = glm.quat.create()
  const pos = glm.vec3.create()
  const camPos = glm.vec3.create()
  let sM = 0.005

  const drawScene = () => {
    glm.vec3.copy(camPos, [sM * -window.scrollX, sM * window.scrollY, -5])
    const camera = mats.get('PROJECTION')
    glm.mat4.perspective(camera, Math.PI * 0.15, size.width / size.height, 3, 100)
    glm.mat4.translate(camera, camera, camPos)
    for (const n of scene.nodes) {
      for (const mesh of n[1].meshes) {
        glm.mat4.fromRotationTranslation(mats.get('MODELVIEW'), quat, pos)
        const norm = mats.get('MODELVIEWINVERSETRANSPOSE')
        glm.mat3.normalFromMat4(norm, mats.get('MODELVIEW'))
        // console.log(mesh)
        for (const prim of mesh.primitives) {
          const ind = prim.indices
          gl.useProgram(mainProg)
          gl.uniformMatrix3fv(unis.get('MODELVIEWINVERSETRANSPOSE'), false, norm)
          gl.uniformMatrix4fv(unis.get('PROJECTION'), false, mats.get('PROJECTION'))
          gl.uniformMatrix4fv(unis.get('MODELVIEW'), false, mats.get('MODELVIEW'))
          gl.bindBuffer(ind.buffer.target, ind.buffer.gl)
          for (const loc of attrs) {
            const attr = prim.attributes.get(loc[0])
            // console.log('attr', attr)
            gl.bindBuffer(attr.buffer.target, attr.buffer.gl)
            gl.vertexAttribPointer(loc[1], attr.size, attr.componentType, false, attr.byteStride, attr.byteOffset)
          }
          // console.log(ind)
          for (const loc of attrs) gl.enableVertexAttribArray(loc[1])
          gl.drawElements(prim.mode, ind.count, ind.componentType, 0)
          for (const loc of attrs) gl.disableVertexAttribArray(loc[1])
        }
      }
    }
  }

  step = () => {
    if (graphicSettings.play) requestAnimationFrame(step)
    dt = now
    now = navigationStart + performance.now()
    dt = now - dt
    glm.quat.rotateX(quat, quat, Math.sin(now * 0.001) * 0.01)
    glm.quat.rotateY(quat, quat, Math.cos(now * 0.001) * 0.01)
    // glm.quat.rotateZ(quat, quat, Math.tan(now * 0.0001) * 0.0001)
    render()
  }

  render = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, frames[1].frame)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    drawScene()
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    gl.activeTexture(gl.TEXTURE0 + 2)
    gl.bindTexture(gl.TEXTURE_2D, bayerTex)
    drawToFramebuffer(gl, ditherPost, frames[1])
  }
  dispatchEvent(new Event('resize'))
  const gs = JSON.parse(sessionStorage.getItem('graphicSettings'))
  for (const i in gs) graphicSettings[i] = gs[i]
  step()
}
