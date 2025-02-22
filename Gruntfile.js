'use strict';

function qunitVersion() {
  var prepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = function() {
    return '';
  };
  try {
    return require('qunit').version;
  }
  finally {
    Error.prepareStackTrace = prepareStackTrace;
  }
}

function isNodejsVersionSupported() {
  return (
    process.versions &&
    process.versions.node &&
    process.versions.node.split('.')[0] >= 8
  );
}

module.exports = function(grunt) {
  // Force use of Unix newlines
  grunt.util.linefeed = '\n';

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    qunit_ver: qunitVersion(),
    banner: '/*!\n' +
            ' * HTMLMinifier v<%= pkg.version %> (<%= pkg.homepage %>)\n' +
            ' * Copyright 2010-<%= grunt.template.today("yyyy") %> <%= pkg.author %>\n' +
            ' * Licensed under the <%= pkg.license %> license\n' +
            ' */\n',

    browserify: {
      src: {
        options: {
          banner: '<%= banner %>',
          preBundleCB: function() {
            var fs = require('fs');
            var file = fs.readFileSync('./node_modules/terser/dist/bundle.min.js');
            fs.writeFileSync('./dist/terser.js', file);
          },
          postBundleCB: function(err, src, next) {
            require('fs').unlinkSync('./dist/terser.js');
            next(err, src);
          },
          require: [
            './dist/terser.js:terser',
            './src/htmlminifier.js:html-minifier-terser'
          ]
        },
        src: 'src/htmlminifier.js',
        dest: 'dist/htmlminifier.js'
      }
    },

    eslint: {
      grunt: {
        src: 'Gruntfile.js'
      },
      src: {
        src: ['cli.js', 'src/**/*.js']
      },
      tests: {
        src: ['tests/*.js', 'test.js']
      },
      web: {
        src: ['assets/master.js', 'assets/worker.js']
      },
      other: {
        src: ['backtest.js', 'benchmark.js']
      }
    },

    qunit: {
      htmlminifier: ['./tests/minifier', 'tests/index.html']
    },

    replace: {
      './index.html': [
        /(<h1>.*?<span>).*?(<\/span><\/h1>)/,
        '$1(v<%= pkg.version %>)$2'
      ],
      './tests/index.html': [
        /("[^"]+\/qunit-)[0-9.]+?(\.(?:css|js)")/g,
        '$1<%= qunit_ver %>$2'
      ]
    },

    terser: {
      options: {
        compress: true,
        mangle: true
      },
      beautify: {
        comments: 'all'
      },
      minify: {
        files: {
          'dist/htmlminifier.min.js': '<%= browserify.src.dest %>'
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-terser');

  // dependencies of grunt-eslint use the spread operator
  // which is not supported by NodeJS 6 and older
  if (isNodejsVersionSupported()) {
    grunt.loadNpmTasks('grunt-eslint');
  }

  function report(type, details) {
    grunt.log.writeln(type + ' completed in ' + details.runtime + 'ms');
    details.failures.forEach(function(details) {
      grunt.log.error();
      grunt.log.error(details.name + (details.message ? ' [' + details.message + ']' : ''));
      grunt.log.error(details.source);
      grunt.log.error('Actual:');
      grunt.log.error(details.actual);
      grunt.log.error('Expected:');
      grunt.log.error(details.expected);
    });
    grunt.log[details.failed ? 'error' : 'ok'](details.passed + ' of ' + details.total + ' passed, ' + details.failed + ' failed');
    return details.failed;
  }

  grunt.registerMultiTask('qunit', function() {
    var done = this.async();
    var errors = [];

    function run(testType, binPath, testPath) {
      var testrunner;
      if (testType === 'web') {
        testrunner = 'test-chrome.js';
      }
      else {
        testrunner = 'test.js';
      }
      grunt.util.spawn({
        cmd: binPath,
        args: [testrunner, testPath]
      }, function(error, result) {
        if (error) {
          grunt.log.error(result.stderr);
          grunt.log.error(testType + ' test failed to load');
          errors.push(-1);
        }
        else {
          var output = result.stdout;
          var index = output.lastIndexOf('\n');
          if (index !== -1) {
            // There's something before the report JSON
            // Log it to the console -- it's probably some debug output:
            console.log(output.slice(0, index));
            output = output.slice(index);
          }
          errors.push(report(testType, JSON.parse(output)));
        }
        if (errors.length === 2) {
          done(!errors[0] && !errors[1]);
        }
      });
    }

    run('node', process.argv[0], this.data[0]);
    run('web', process.argv[0], this.data[1]);
  });

  grunt.registerMultiTask('replace', function() {
    var pattern = this.data[0];
    var path = this.target;
    var html = grunt.file.read(path);
    html = html.replace(pattern, this.data[1]);
    grunt.file.write(path, html);
  });

  grunt.registerTask('dist', [
    'replace',
    'browserify',
    'terser'
  ]);

  grunt.registerTask('test', function() {
    if (isNodejsVersionSupported()) {
      grunt.task.run([
        'eslint',
        'dist',
        'qunit'
      ]);
    }
    else {
      // the puppeteer runner uses async / await
      // which is not supported by NodeJS 6 and older
      grunt.task.run([
        'dist'
      ]);
    }
  });

  grunt.registerTask('default', 'test');
};
