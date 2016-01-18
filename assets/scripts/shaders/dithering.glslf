#version 100
precision mediump float;

#pragma glslify: deres = require(./lib/deres.glsl)
//#pragma glslify: bayerer = require(../lib/bayerer.glsl)

uniform sampler2D frame;
uniform sampler2D depth;
uniform sampler2D bayer;

uniform ivec2 destSize;

varying vec2 screenCoord;
// out vec4 fragmentColour;

float bayerer(in float order, in vec2 coord) {
  vec2 c = vec2(mod(coord, order));
  return texture2D(bayer, c / 8.).a;
}


void main() {
  vec4 p = texture2D(frame, screenCoord);
  vec4 pixel = vec4(p.rgb + .7, p.a);
  vec4 dithered = pixel + pixel * bayerer(8., gl_FragCoord.xy);
  pixel = vec4(deres(dithered.rgb, .7), dithered.a);
  if(pixel.r < 0.5) discard;
  gl_FragColor = pixel;
}
