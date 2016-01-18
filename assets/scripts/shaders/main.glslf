#version 100
precision mediump float;

varying vec3 vNormal;
varying float zDepth;

void main(void) {
  gl_FragColor = vec4(zDepth * vec3((vNormal.x + vNormal.y + vNormal.z / 3.)), 1.); //vec4(vNormal, 1);// vec4(vNormal, 1) * 0.5 + 0.6; //vec4(0.6, 1, vNormal.x * 0.5, 1);
}
