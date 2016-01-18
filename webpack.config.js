module.exports = {
  context: `${__dirname}/assets/scripts`,
  entry: {
    main: ['babel-polyfill', 'whatwg-fetch', './client']
  },
  output: {
    path: `${__dirname}/dist/scripts`,
    filename: '[name].js'
  },
  module: {
    loaders: [
      { test: /\.js$/, exclude: /node_modules/, loader: 'babel' },
      { test: /\.(frag|vect|glsl[vf]?)$/, exclude: /node_modules/, loader: 'raw' },
      { test: /\.(frag|vect|glsl[vf]?)$/, exclude: /node_modules/, loader: 'glslify' }
    ]
  }
}
