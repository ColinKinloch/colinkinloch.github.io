#version 100
precision mediump float;

uniform sampler2D frame;

varying vec2 screenCoord;

void main() {
  gl_FragColor = texture2D(frame, screenCoord);
}
