'use strict'

const path = require('path')
const fs = require('fs')

const _ = require('lodash')
const glob = require('glob')
const vfs = require('vinyl-fs')
const del = require('del')

const gulp = require('gulp')
const util = require('gulp-util')
const through = require('through2')
const merge = require('merge-stream')

const livereload = require('gulp-livereload')
const gFrontMatter = require('gulp-front-matter')
const marked = require('marked')
const markdown = require('gulp-marked')
const highlight = require('highlight.js')
const sass = require('gulp-sass')
const ghPages = require('gulp-gh-pages')
const autoprefixer = require('gulp-autoprefixer')
const webpack = require('webpack')
const minify = require('gulp-uglify')
const yaml = require('gulp-yaml')
const frontMatter = require('front-matter')

const swig = require('swig')
const swigExtras = require('swig-extras')

const site = require('./site.config')

swig.setDefaults({
  loader: swig.loaders.fs(`${__dirname}/assets/templates`),
  cache: false
})
swigExtras.useFilter(swig, 'truncate')

const mdHighlight = (code) => {
  return highlight.highlightAuto(code).value
}

const rePostName = /(\d{4})-(\d{1,2})-(\d{1,2})-?(.*)/

const parseFilename = () => {
  return through.obj(function (file, enc, done) {
    const dirname = path.dirname(file.path)
    const basename = path.basename(file.path)
    const match = rePostName.exec(basename)
    if (match) {
      let year = match[1]
      let month = match[2]
      let day = match[3]
      let basename = match[4]
      const name = path.parse(basename).name
      let d = file.page.date || new Date(`${year}-${month}-${day}`)
      file.page.date = d
      year = _.padStart(d.getFullYear(), 4, '0')
      month = _.padStart(d.getMonth() + 1, 2, '0')
      day = _.padStart(d.getDate(), 2, '0')
      const urlDir = `/${year}/${month}/${day}/`
      if (_.isUndefined(file.page.title)) file.page.title = _.capitalize(name.split('-').join(' '))
      file.page.url = `/posts${urlDir}${name}.html`
      file.path = `${dirname}${urlDir}${basename}`
    }
    this.push(file)
    done()
  })
}

const summarize = (marker) => {
  return through.obj(function (file, enc, done) {
    const summary = file.contents.toString().split(marker)[0]
    file.page.summary = summary
    this.push(file)
    done()
  })
}
const summarizeMD = (marker) => {
  return through.obj(function (file, enc, done) {
    const lines = file.contents.toString().split('\n')
    let i
    for (i in lines) if (i > 10 || /```/.test(lines[i])) break
    const summary = marked(lines.slice(0, i).join('\n') + '…')
    file.page.summary = summary
    this.push(file)
    done()
  })
}

const processSwig = () => {
  return through.obj(function (file, enc, done) {
    try {
      let data = {
        site: site,
        page: file.page
      }
      // Process blog swig
      let content = file.contents.toString()
      content = swig.render(content, {locals: data})
      file.contents = new Buffer(content, 'utf8')
    } catch (err) {
      util.log(util.colors.bold.red('Swigging error'), err.message)
    }
    this.push(file)
    done()
  })
}

const applyTemplate = (layout) => {
  return through.obj(function (file, enc, done) {
    layout = path.basename(file.page.layout || layout || 'page')
    file.page.layout = layout
    try {
      const tpl = swig.compileFile(path.join(__dirname, 'assets/templates/', `${layout}.html`))
      let data = {
        site: site,
        page: file.page,
        content: file.contents.toString()
      }
      file.contents = new Buffer(tpl(data), 'utf8')
    } catch (err) {
      util.log(util.colors.bold.red('Templating error'), err.message)
    }
    this.push(file)
    done()
  })
}

const collatePosts = () => {
  let posts = []
  let tags = []
  return through.obj(function (file, enc, done) {
    file.page.content = file.contents.toString()
    posts.push(file.page)
    if (file.page.tags) {
      file.page.tags.forEach((tag) => {
        if (tags.indexOf(tag) === -1) tags.push(tag)
      })
    }
    this.push(file)
    done()
  }, // Sort posts
  (done) => {
    posts.sort((a, b) => { return b.date - a.date })
    site.posts = posts
    site.tags = tags
    done()
  })
}

gulp.task('default', ['build'])

gulp.task('build', ['content', 'scripts', 'styles', 'fonts', 'misc'])

gulp.task('content', ['pages', 'posts', 'rss'])

const dateTitleMatch = /(\d{4}-\d{1,2}-\d{1,2})-?(.*)/

// Parse posts, store as posts.json
// post: {
//   date: Date,
//   title: Title,
//   url: Dist relative path,
//   summary: TBD String,
//   layout: Basename of template file,
//   content: Content,
//   tags: Array of tags,
//   _source: Source file type
// }
gulp.task('collate', (done) => {
  const postProms = []
  // Process all directory posts
  const dirs = glob.sync('content/posts/*/')
  for (const dir of dirs) {
    postProms.push(new Promise((resolve, reject) => {
      const data = {
        _path: dir
      }
      // Parse path
      {
        const basename = path.basename(dir)
        const match = dateTitleMatch.exec(basename)
        if (match[2].length) data.title = _.capitalize(path.parse(match[2]).name.split('-').join(' '))
        data.date = new Date(match[1])
      }
      fs.readdir(dir, (err, files) => {
        if (err) reject(err)
        // Parse frontmatter and content
        try {
          const index = fs.readFileSync(dir + 'index.html').toString()
          const metadata = frontMatter(index)
          _.extend(data, metadata.attributes)
          data._source = 'html'
          data.content = metadata.body
        } catch (err) {
          try {
            const index = fs.readFileSync(dir + 'index.md').toString()
            const metadata = frontMatter(index)
            _.extend(data, metadata.attributes)
            data._source = 'markdown'
            data.content = metadata.body
          } catch (err) {}
        }
        // Parse metadata file
        try {
          const metadata = fs.readFileSync(dir + 'metadata.yaml').toString()
          _.extend(data, frontMatter(metadata).attributes)
        } catch (err) {}
        if (_.isUndefined(data.title)) data.title = 'Untitled'
        resolve(data)
      })
    }))
  }

  // Process all html or md files
  const paths = glob.sync('content/posts/!(_)*.@(html|md)')
  for (const p of paths) {
    postProms.push(new Promise((resolve, reject) => {
      const data = {
        _path: p
      }
      // Parse path
      {
        const basename = path.basename(p)
        const match = dateTitleMatch.exec(basename)
        data.date = new Date(match[1])
        if (match[2].length) data.title = _.capitalize(_.lowerCase(path.parse(match[2]).name))
      }
      fs.readFile(p, (err, buffer) => {
        if (err) reject(err)
        // Parse frontmatter and content
        const file = buffer.toString()
        const metadata = frontMatter(file)
        _.extend(data, metadata.attributes)
        if (_.isUndefined(data.title)) data.title = 'Untitled'
        data.content = metadata.body
        resolve(data)
      })
    }))
  }

  return Promise.all([
    new Promise((resolve, reject) => {
      fs.readFile('./site.config.json', (err, data) => {
        if (err) reject(err)
        resolve(JSON.parse(data.toString()))
      })
    }),
    Promise.all(postProms)
  ])
    .then((resp) => {
      const site = resp[0]
      site.date = new Date()
      site.posts = resp[1]
      for (const post of site.posts) {
        post.date = new Date(post.date)
        post._title = _.kebabCase(post.title)
        const d = post.date
        const dest = `${d.getFullYear()}/${d.getMonth()}/${d.getDate()}/${post._title}`
        post.url = '/posts/' + dest
        if (fs.statSync(post._path).isDirectory()) {
          // Copy directory content excluding index.* and markdown.yaml
        }

        switch (post._source) {
          case 'markdown':
            break
          case 'html':
            break
        }
        console.log(post.title, post.date, '=>', post.url)
      }
    })
    .catch((err) => {
      console.log(err)
    })
})

gulp.task('pages', ['posts'], () => {
  const mdPages = gulp.src(['content/**/!(_)*.md', '!content/posts/*'])
    .pipe(gFrontMatter({property: 'page', remove: true}))
    .pipe(parseFilename())
    .pipe(processSwig())
    .pipe(summarizeMD('<!--more-->'))
    // TODO Wait for https://github.com/chjj/marked/pull/636
    .pipe(markdown({
      sanitize: false,
      highlight: mdHighlight
    }))

  const htmlPages = gulp.src(['content/**/!(_)*.html', '!content/posts/*'])
    .pipe(gFrontMatter({property: 'page', remove: true}))
    .pipe(parseFilename())
    .pipe(processSwig())
    .pipe(summarize('<!--more-->'))

  return merge(htmlPages, mdPages)
    .pipe(applyTemplate('page'))
    .pipe(gulp.dest('dist'))
})

gulp.task('posts', () => {
  const mdPosts = gulp.src('content/posts/!(_)*.md')
    .pipe(gFrontMatter({property: 'page', remove: true}))
    .pipe(parseFilename())
    .pipe(processSwig())
    .pipe(summarizeMD('<!--more-->'))
    // TODO Wait for https://github.com/chjj/marked/pull/636
    .pipe(markdown({
      sanitize: false,
      highlight: mdHighlight
    }))

  const htmlPosts = gulp.src('content/posts/!(_)*.html')
    .pipe(gFrontMatter({property: 'page', remove: true}))
    .pipe(parseFilename())
    .pipe(processSwig())
    .pipe(summarize('<!--more-->'))

  return merge(htmlPosts, mdPosts)
    .pipe(collatePosts())
    .pipe(applyTemplate('post'))
    .pipe(gulp.dest('dist/posts'))
})

gulp.task('rss', ['posts'], () => {
  return gulp.src([
    'assets/templates/posts.xml',
    'assets/templates/atom.xml'
  ])
    .pipe(through.obj(function (file, enc, done) {
      const data = {
        site: site,
        page: file.page
      }
      try {
        const tpl = swig.compileFile(file.path)
        file.contents = new Buffer(tpl(data), 'utf8')
      } catch (err) {
        util.log(util.colors.bold.red('Swigging error'), err.message)
      }
      this.push(file)
      done()
    }))
    .pipe(gulp.dest('dist'))
})

gulp.task('scripts', ['webpack'])
gulp.task('webpack', (done) => {
  const webpackConfig = require('./webpack.config')
  webpack(webpackConfig)
  .run((err) => {
    if (err) util.log('Webpack Error:', err)
    livereload()
    done()
  })
})
gulp.task('minify', ['webpack'], () => {
  return gulp.src('./dist/scripts/**/*.js')
    .pipe(minify())
    .pipe(gulp.dest('./dist/scripts'))
})

gulp.task('styles', () => {
  return gulp.src('assets/styles/**/*.scss')
    .pipe(sass({
      includePaths: [
        'node_modules/font-awesome/scss'
      ]
    }).on('error', sass.logError))
    .pipe(autoprefixer({
      browsers: ['last 2 versions']
    }))
    .pipe(gulp.dest('dist/styles'))
    .pipe(livereload())
})

gulp.task('fonts', () => {
  const fontAwesome = gulp.src('node_modules/font-awesome/fonts/**')
  return merge(gulp.src('assets/fonts/**'), fontAwesome)
    .pipe(gulp.dest('dist/fonts'))
    .pipe(livereload())
})

// TODO Maybe produce CNAME from site.url
gulp.task('misc', () => {
  return gulp.src('assets/misc/**')
    .pipe(gulp.dest('dist'))
    .pipe(livereload())
})

gulp.task('clean', () => {
  return del(['dist'])
})

gulp.task('watch', ['build'], () => {
  gulp.watch([
    'webpack.config.js',
    'assets/scripts/**'
  ], ['scripts'])

  gulp.watch([
    'assets/templates/posts.xml',
    'assets/templates/atom.xml'
  ], ['rss'])
  gulp.watch([
    // TODO Figure out loading site config
    // 'site.config.js',
    'assets/templates/**'
  ], ['content'])
  gulp.watch('content/posts/**', ['content'])
  gulp.watch([
    'content/**/*.+(md|html)',
    '!content/posts/**'
  ], ['pages'])
  gulp.watch('assets/styles/**', ['styles'])
  gulp.watch('assets/fonts/**', ['fonts'])
  gulp.watch('assets/misc/**', ['misc'])
})

gulp.task('serve', ['watch'], () => {
  const server = require('./server')
  let opts = {
    http: {
      host: '0.0.0.0',
      port: 8080
    }
  }
  _.merge(opts, {
    http: {
      ready: () => {
        util.log('HTTP listening at', util.colors.magenta(`//${opts.http.host}:${opts.http.port}`))
      }
    }
  })
  server(opts)
})

gulp.task('deploy', () => {
  return gulp.src('./dist/**/*')
    .pipe(ghPages())
})
