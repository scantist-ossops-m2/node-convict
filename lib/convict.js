// TODO:
//  * nesting
//  * environment
//  * all sorts of error handling

const
orderly = require('orderly'),
JSV = require("jsv").JSV.createEnvironment();

function buildSchema(name, o, props, fullName, env) {
  if (typeof o === 'string' || (o && o.format && typeof o.format === 'string')) {
    var fmt = (typeof o === 'string') ? o : o.format;
    try {
      var schema = orderly.parse(fmt);
      if (!schema.optional) schema.required = true;
      props[name] = schema;
    } catch(e) {
      throw "'" + fullName + "' has an invalid format: " + e.toString();
    } 
    
    if (o.env) {
      if (env[o.env]) {
        throw "'" + fullName + "' reuses an env variable: " + o.env
      }
      env[o.env] = fullName;
    }
  } else {
    props[name] = {
      properties: {},
      additionalProperties: false
    };
    Object.keys(o).forEach(function(k) {
      buildSchema(k, o[k], props[name].properties, fullName + "." + k, env);    
    });
  }
}

function importEnvironment(o) {
  Object.keys(o._env).forEach(function(envStr) {
    var k = o._env[envStr];
    if (process.env[envStr]) {
      o.set(k, process.env[envStr]);
    }
  });
}

function addDefaultValues(schema, c) {
  Object.keys(schema.properties).forEach(function(name) {
    p = schema.properties[name];
    if (p.properties) {
      var kids = c[name] || {};
      addDefaultValues(p, kids);
      if (Object.keys(kids).length) c[name] = kids;
    } else {
      if (!c[name] && typeof p.default !== 'undefined') c[name] = p.default
    }
  });
}

module.exports = function(def) {
  var rv = {
    toString: function() {
      return JSON.stringify(this._instance, null, 2)      
    },
    get: function(path) {
      var o = JSON.parse(JSON.stringify(this._instance));
      if (path) {
        var ar = path.split('.');
        while (ar.length) {
          var k = ar.shift();
          if (typeof o[k] !== undefined)  o = o[k];
          else {
            o = undefined;
            break;
          }
        }
      }
      return o;
    },
    set: function(k, v) {
      // magic string->integer casting
      if (typeof v === 'string' && this._getType(k) === 'integer') {
        v = parseInt(v);
      }

      var ar = k.split('.');
      var o = rv._instance;
      while (ar.length > 1) {
        var k = ar.shift();
        if (!o[k]) o[k] = {};
        o = o[k];
      }
      o[ar.shift()] = v;
      this.validate();
    },
    read: function(conf) {
      // XXX: write me
      throw "not implemented";
    },
    readFile: function(path, cb) {
      // XXX: write me
      throw "not implemented";
    },
    validate: function() {
      var report = JSV.validate(this._instance, this._schema);
      if (report.errors.length) {
        var errBuf = "";
        for (var i = 0; i < report.errors.length; i++) {
          if (errBuf.length) errBuf += "\n";
          var e = report.errors[i];
          // get the property name in dot notation
          if (e.uri) {
            errBuf += e.uri.split('/').slice(1).join('.') + ": ";
          }
          if (e.message) errBuf += e.message + ": ";
          if (e.details) {
            errBuf += ((typeof e.details === 'string') ?
                       e.details : JSON.stringify(e.details));
          }            
        }
        throw errBuf;
      }
    },
    _getType: function(path) {
      var ar = path.split('.');
      var o = rv._schema;
      while (ar.length > 0) {
        var k = ar.shift();
        if (o && o.properties && o.properties[k]) {
          o = o.properties[k];
        } else {
          o = null;
          break;
        }
      }
      return (o && o.type) ? o.type : null; 
    }
  };
  // XXX validate definition

  // build up current config from definition
  rv._schema = {
    properties: {},
    additionalProperties: false
  };

  rv._env = { };

  Object.keys(def).forEach(function(k) {
    buildSchema(k, def[k], rv._schema.properties, k, rv._env);    
  });

  var report = JSV.validate({}, rv._schema);

  rv._instance = report.instance.getValue();
  addDefaultValues(rv._schema, rv._instance)

  rv.validate();

  importEnvironment(rv);

  return rv;
};