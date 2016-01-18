vec4 deres(vec4 blub, float detail) {
  ivec4 iblub = ivec4(blub*detail);
  return vec4(iblub)/detail;
}
vec3 deres(vec3 blub, float detail) {
  ivec3 iblub = ivec3(blub*detail);
  return vec3(iblub)/detail;
}
vec2 deres(vec2 blub, float detail) {
  ivec2 iblub = ivec2(blub*detail);
  return vec2(iblub)/detail;
}

#pragma glslify: export(deres)
