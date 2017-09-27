// TODO: Replace placeholder shaders by original ones (requires fixing projection matrix)
import Promise from 'bluebird'
import fetchScript from '../../utils/io/fetch-script.js'
import PromiseCache from '../../utils/promise-cache.js'
import fragmentShader from './gblock/fragment-placeholder.glsl'
import vertexShader from './gblock/vertex-placeholder.glsl'

// configs

var LEGACY_GLFT_LOADER_URL = 'https://cdn.rawgit.com/mrdoob/three.js/r86/examples/js/loaders/GLTFLoader.js'
var GBLOCK_API_GET_OFFICIAL_GLTF_URL = 'https://us-central1-gblock-api.cloudfunctions.net/get-gltf-url/?url='

// internals

var promiseCache = new PromiseCache()

// aframe module

export default {

  schema: {type: 'asset'},

  init: function () {
    this.model = null
  },

  update: function () {
    var self = this
    var el = this.el
    var src = this.data

    if (!src) { return; }

    this.remove()

    // FIXME: Replace this with an official API URL once available
    // This API call is only needed to obtain the official glTF URL of a google block model.
    // The glTF itself is not being proxied and gets fetched from https://vr.google.com/downloads/* directly.
    // https://github.com/archilogic-com/aframe-gblock/issues/1
    // API server code: server/index.js
    // try promise cache (could be in loading state)
    var promiseFromCache = promiseCache.get(src)
    var getGltfUrlPromise = promiseFromCache ? promiseFromCache : getGltfUrl(src)
    if (!promiseFromCache) promiseCache.add(src, getGltfUrlPromise)

    getGltfUrlPromise.then(function (gltfUrl) {

      // load glTF model from original URL

      createModifiedGltfLoader().then(function(gltfLoader){

        gltfLoader.load( gltfUrl, function onLoaded (gltfModel) {

          self.model = gltfModel.scene || gltfModel.scenes[0]
          // FIXME: adapt projection matrix in original shaders and do not replace materials
          self.model.traverse(function (child) {
            if (child.material) child.material = new THREE.MeshPhongMaterial({ vertexColors: THREE.VertexColors })
          })
          self.model.animations = gltfModel.animations

          el.setObject3D('mesh', self.model)
          el.emit('model-loaded', {format: 'gltf', model: self.model})

        }, function onProgress() {
          // do nothing
        }, function onError(error) {

          console.error('ERROR loading gblock gltf "'+ src +'" : ' + error)
          el.emit('model-error', { message: error })

        })

      })

    }).catch(function(errorMessage){
      console.error(errorMessage)
      el.emit('model-error', { message: errorMessage })
    })

  },

  remove: function () {
    if (!this.model) { return; }
    this.el.removeObject3D('mesh')
  }

}

// private shared methods

function getGltfUrl (src) {

  return fetch(GBLOCK_API_GET_OFFICIAL_GLTF_URL + src).then(function (response) {

    // parse response
    return response.json().then(function (message) {
      if (response.ok) {
        // return glTF URL
        return message.gltfUrl
      } else {
        // handle error response
        var status = response.status
        var errorMessage = message.message
        console.error('ERROR loading gblock model "'+ src +'" : ' + status + ' "' + errorMessage + '"')
        return Promise.reject(errorMessage)
      }
    }).catch(function(error){
      // handle server error
      var errorMessage = '3dio.js: Error parsing gblock API server JSON response: ' + error
      console.error(errorMessage)
      return Promise.reject(errorMessage)
    })

  })

}

function createModifiedGltfLoader() {

  // legacy loader will overwrite THREE.GLTFLoader so we need to keep reference to it
  THREE.___OriginalGLTFLoader = THREE.GLTFLoader

  return fetchScript(LEGACY_GLFT_LOADER_URL).then(function(){

    // keep reference to fetched legacy loader
    var LegacyGLTFLoader = THREE.GLTFLoader

    // restore current GLTFLoader
    THREE.GLTFLoader = THREE.___OriginalGLTFLoader

    // create modified GLTF loader for google blocks
    function GBlockLoader () {

      LegacyGLTFLoader.call(this)

      var self = this

      this._parse = this.parse
      this.parse = function (data, path, onLoad, onError) {
        // convert uint8 to json
        var json = JSON.parse(convertUint8ArrayToString(data))
        // use base64 shaders
        Object.keys(json.shaders).forEach(function (key, i) {
          // Replacing original shaders with placeholders
          if (key.indexOf('fragment') > -1) json.shaders[key].uri = fragmentShader.base64
          else if (key.indexOf('vertex') > -1) json.shaders[key].uri = vertexShader.base64
        })
        // convert json to uint8
        var uint8array = new TextEncoder('utf-8').encode(JSON.stringify(json))
        // parse data
        self._parse.call(self, uint8array, path, onLoad, onError)
      }

    }
    GBlockLoader.prototype = LegacyGLTFLoader.prototype

    // expose loader
    return new GBlockLoader

  })

}

// from https://github.com/mrdoob/three.js/blob/master/examples/js/loaders/GLTFLoader.js
function convertUint8ArrayToString (array) {
  if (window.TextDecoder !== undefined) {
    return new TextDecoder().decode(array)
  }
  // Avoid the String.fromCharCode.apply(null, array) shortcut, which
  // throws a "maximum call stack size exceeded" error for large arrays.
  var s = '';
  for (var i = 0, il = array.length; i < il; i++) {
    s += String.fromCharCode(array[i])
  }
  return s;
}