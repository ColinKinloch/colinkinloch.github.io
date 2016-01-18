#version 100

attribute vec3 position;
attribute vec3 normal;

varying vec3 vNormal;
varying float zDepth;

uniform mat3 normalMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

void main(void) {
  vec4 pos = modelViewMatrix * vec4(position, 1.);
  zDepth = 1. - -(pos.z / 20.);
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * pos;//deres(pos, 60.0);
}
