"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/papaparse/papaparse.js
var require_papaparse = __commonJS({
  "node_modules/papaparse/papaparse.js"(exports2, module2) {
    (function(root, factory) {
      if (typeof define === "function" && define.amd) {
        define([], factory);
      } else if (typeof module2 === "object" && typeof exports2 !== "undefined") {
        module2.exports = factory();
      } else {
        root.Papa = factory();
      }
    })(exports2, function moduleFactory() {
      "use strict";
      var global = (function() {
        if (typeof self !== "undefined") {
          return self;
        }
        if (typeof window !== "undefined") {
          return window;
        }
        if (typeof global !== "undefined") {
          return global;
        }
        return {};
      })();
      function getWorkerBlob() {
        var URL2 = global.URL || global.webkitURL || null;
        var code = moduleFactory.toString();
        return Papa3.BLOB_URL || (Papa3.BLOB_URL = URL2.createObjectURL(new Blob(["var global = (function() { if (typeof self !== 'undefined') { return self; } if (typeof window !== 'undefined') { return window; } if (typeof global !== 'undefined') { return global; } return {}; })(); global.IS_PAPA_WORKER=true; ", "(", code, ")();"], { type: "text/javascript" })));
      }
      var IS_WORKER = !global.document && !!global.postMessage, IS_PAPA_WORKER = global.IS_PAPA_WORKER || false;
      var workers = {}, workerIdCounter = 0;
      var Papa3 = {};
      Papa3.parse = CsvToJson;
      Papa3.unparse = JsonToCsv;
      Papa3.RECORD_SEP = String.fromCharCode(30);
      Papa3.UNIT_SEP = String.fromCharCode(31);
      Papa3.BYTE_ORDER_MARK = "\uFEFF";
      Papa3.BAD_DELIMITERS = ["\r", "\n", '"', Papa3.BYTE_ORDER_MARK];
      Papa3.WORKERS_SUPPORTED = !IS_WORKER && !!global.Worker;
      Papa3.NODE_STREAM_INPUT = 1;
      Papa3.LocalChunkSize = 1024 * 1024 * 10;
      Papa3.RemoteChunkSize = 1024 * 1024 * 5;
      Papa3.DefaultDelimiter = ",";
      Papa3.Parser = Parser;
      Papa3.ParserHandle = ParserHandle;
      Papa3.NetworkStreamer = NetworkStreamer;
      Papa3.FileStreamer = FileStreamer;
      Papa3.StringStreamer = StringStreamer;
      Papa3.ReadableStreamStreamer = ReadableStreamStreamer;
      if (typeof PAPA_BROWSER_CONTEXT === "undefined") {
        Papa3.DuplexStreamStreamer = DuplexStreamStreamer;
      }
      if (global.jQuery) {
        var $ = global.jQuery;
        $.fn.parse = function(options) {
          var config = options.config || {};
          var queue = [];
          this.each(function(idx) {
            var supported = $(this).prop("tagName").toUpperCase() === "INPUT" && $(this).attr("type").toLowerCase() === "file" && global.FileReader;
            if (!supported || !this.files || this.files.length === 0)
              return true;
            for (var i = 0; i < this.files.length; i++) {
              queue.push({
                file: this.files[i],
                inputElem: this,
                instanceConfig: $.extend({}, config)
              });
            }
          });
          parseNextFile();
          return this;
          function parseNextFile() {
            if (queue.length === 0) {
              if (isFunction(options.complete))
                options.complete();
              return;
            }
            var f = queue[0];
            if (isFunction(options.before)) {
              var returned = options.before(f.file, f.inputElem);
              if (typeof returned === "object") {
                if (returned.action === "abort") {
                  error("AbortError", f.file, f.inputElem, returned.reason);
                  return;
                } else if (returned.action === "skip") {
                  fileComplete();
                  return;
                } else if (typeof returned.config === "object")
                  f.instanceConfig = $.extend(f.instanceConfig, returned.config);
              } else if (returned === "skip") {
                fileComplete();
                return;
              }
            }
            var userCompleteFunc = f.instanceConfig.complete;
            f.instanceConfig.complete = function(results) {
              if (isFunction(userCompleteFunc))
                userCompleteFunc(results, f.file, f.inputElem);
              fileComplete();
            };
            Papa3.parse(f.file, f.instanceConfig);
          }
          function error(name, file, elem, reason) {
            if (isFunction(options.error))
              options.error({ name }, file, elem, reason);
          }
          function fileComplete() {
            queue.splice(0, 1);
            parseNextFile();
          }
        };
      }
      if (IS_PAPA_WORKER) {
        global.onmessage = workerThreadReceivedMessage;
      }
      function CsvToJson(_input, _config) {
        _config = _config || {};
        var dynamicTyping = _config.dynamicTyping || false;
        if (isFunction(dynamicTyping)) {
          _config.dynamicTypingFunction = dynamicTyping;
          dynamicTyping = {};
        }
        _config.dynamicTyping = dynamicTyping;
        _config.transform = isFunction(_config.transform) ? _config.transform : false;
        if (_config.worker && Papa3.WORKERS_SUPPORTED) {
          var w = newWorker();
          w.userStep = _config.step;
          w.userChunk = _config.chunk;
          w.userComplete = _config.complete;
          w.userError = _config.error;
          _config.step = isFunction(_config.step);
          _config.chunk = isFunction(_config.chunk);
          _config.complete = isFunction(_config.complete);
          _config.error = isFunction(_config.error);
          delete _config.worker;
          w.postMessage({
            input: _input,
            config: _config,
            workerId: w.id
          });
          return;
        }
        var streamer = null;
        if (_input === Papa3.NODE_STREAM_INPUT && typeof PAPA_BROWSER_CONTEXT === "undefined") {
          streamer = new DuplexStreamStreamer(_config);
          return streamer.getStream();
        } else if (typeof _input === "string") {
          _input = stripBom(_input);
          if (_config.download)
            streamer = new NetworkStreamer(_config);
          else
            streamer = new StringStreamer(_config);
        } else if (_input.readable === true && isFunction(_input.read) && isFunction(_input.on)) {
          streamer = new ReadableStreamStreamer(_config);
        } else if (global.File && _input instanceof File || _input instanceof Object)
          streamer = new FileStreamer(_config);
        return streamer.stream(_input);
        function stripBom(string) {
          if (string.charCodeAt(0) === 65279) {
            return string.slice(1);
          }
          return string;
        }
      }
      function JsonToCsv(_input, _config) {
        var _quotes = false;
        var _writeHeader = true;
        var _delimiter = ",";
        var _newline = "\r\n";
        var _quoteChar = '"';
        var _escapedQuote = _quoteChar + _quoteChar;
        var _skipEmptyLines = false;
        var _columns = null;
        var _escapeFormulae = false;
        unpackConfig();
        var quoteCharRegex = new RegExp(escapeRegExp(_quoteChar), "g");
        if (typeof _input === "string")
          _input = JSON.parse(_input);
        if (Array.isArray(_input)) {
          if (!_input.length || Array.isArray(_input[0]))
            return serialize(null, _input, _skipEmptyLines);
          else if (typeof _input[0] === "object")
            return serialize(_columns || Object.keys(_input[0]), _input, _skipEmptyLines);
        } else if (typeof _input === "object") {
          if (typeof _input.data === "string")
            _input.data = JSON.parse(_input.data);
          if (Array.isArray(_input.data)) {
            if (!_input.fields)
              _input.fields = _input.meta && _input.meta.fields || _columns;
            if (!_input.fields)
              _input.fields = Array.isArray(_input.data[0]) ? _input.fields : typeof _input.data[0] === "object" ? Object.keys(_input.data[0]) : [];
            if (!Array.isArray(_input.data[0]) && typeof _input.data[0] !== "object")
              _input.data = [_input.data];
          }
          return serialize(_input.fields || [], _input.data || [], _skipEmptyLines);
        }
        throw new Error("Unable to serialize unrecognized input");
        function unpackConfig() {
          if (typeof _config !== "object")
            return;
          if (typeof _config.delimiter === "string" && !Papa3.BAD_DELIMITERS.filter(function(value) {
            return _config.delimiter.indexOf(value) !== -1;
          }).length) {
            _delimiter = _config.delimiter;
          }
          if (typeof _config.quotes === "boolean" || typeof _config.quotes === "function" || Array.isArray(_config.quotes))
            _quotes = _config.quotes;
          if (typeof _config.skipEmptyLines === "boolean" || typeof _config.skipEmptyLines === "string")
            _skipEmptyLines = _config.skipEmptyLines;
          if (typeof _config.newline === "string")
            _newline = _config.newline;
          if (typeof _config.quoteChar === "string")
            _quoteChar = _config.quoteChar;
          if (typeof _config.header === "boolean")
            _writeHeader = _config.header;
          if (Array.isArray(_config.columns)) {
            if (_config.columns.length === 0) throw new Error("Option columns is empty");
            _columns = _config.columns;
          }
          if (_config.escapeChar !== void 0) {
            _escapedQuote = _config.escapeChar + _quoteChar;
          }
          if (_config.escapeFormulae instanceof RegExp) {
            _escapeFormulae = _config.escapeFormulae;
          } else if (typeof _config.escapeFormulae === "boolean" && _config.escapeFormulae) {
            _escapeFormulae = /^[=+\-@\t\r].*$/;
          }
        }
        function serialize(fields, data, skipEmptyLines) {
          var csv = "";
          if (typeof fields === "string")
            fields = JSON.parse(fields);
          if (typeof data === "string")
            data = JSON.parse(data);
          var hasHeader = Array.isArray(fields) && fields.length > 0;
          var dataKeyedByField = !Array.isArray(data[0]);
          if (hasHeader && _writeHeader) {
            for (var i = 0; i < fields.length; i++) {
              if (i > 0)
                csv += _delimiter;
              csv += safe(fields[i], i);
            }
            if (data.length > 0)
              csv += _newline;
          }
          for (var row = 0; row < data.length; row++) {
            var maxCol = hasHeader ? fields.length : data[row].length;
            var emptyLine = false;
            var nullLine = hasHeader ? Object.keys(data[row]).length === 0 : data[row].length === 0;
            if (skipEmptyLines && !hasHeader) {
              emptyLine = skipEmptyLines === "greedy" ? data[row].join("").trim() === "" : data[row].length === 1 && data[row][0].length === 0;
            }
            if (skipEmptyLines === "greedy" && hasHeader) {
              var line = [];
              for (var c = 0; c < maxCol; c++) {
                var cx = dataKeyedByField ? fields[c] : c;
                line.push(data[row][cx]);
              }
              emptyLine = line.join("").trim() === "";
            }
            if (!emptyLine) {
              for (var col = 0; col < maxCol; col++) {
                if (col > 0 && !nullLine)
                  csv += _delimiter;
                var colIdx = hasHeader && dataKeyedByField ? fields[col] : col;
                csv += safe(data[row][colIdx], col);
              }
              if (row < data.length - 1 && (!skipEmptyLines || maxCol > 0 && !nullLine)) {
                csv += _newline;
              }
            }
          }
          return csv;
        }
        function safe(str, col) {
          if (typeof str === "undefined" || str === null)
            return "";
          if (str.constructor === Date)
            return JSON.stringify(str).slice(1, 25);
          var needsQuotes = false;
          if (_escapeFormulae && typeof str === "string" && _escapeFormulae.test(str)) {
            str = "'" + str;
            needsQuotes = true;
          }
          var escapedQuoteStr = str.toString().replace(quoteCharRegex, _escapedQuote);
          needsQuotes = needsQuotes || _quotes === true || typeof _quotes === "function" && _quotes(str, col) || Array.isArray(_quotes) && _quotes[col] || hasAny(escapedQuoteStr, Papa3.BAD_DELIMITERS) || escapedQuoteStr.indexOf(_delimiter) > -1 || escapedQuoteStr.charAt(0) === " " || escapedQuoteStr.charAt(escapedQuoteStr.length - 1) === " ";
          return needsQuotes ? _quoteChar + escapedQuoteStr + _quoteChar : escapedQuoteStr;
        }
        function hasAny(str, substrings) {
          for (var i = 0; i < substrings.length; i++)
            if (str.indexOf(substrings[i]) > -1)
              return true;
          return false;
        }
      }
      function ChunkStreamer(config) {
        this._handle = null;
        this._finished = false;
        this._completed = false;
        this._halted = false;
        this._input = null;
        this._baseIndex = 0;
        this._partialLine = "";
        this._rowCount = 0;
        this._start = 0;
        this._nextChunk = null;
        this.isFirstChunk = true;
        this._completeResults = {
          data: [],
          errors: [],
          meta: {}
        };
        replaceConfig.call(this, config);
        this.parseChunk = function(chunk, isFakeChunk) {
          const skipFirstNLines = parseInt(this._config.skipFirstNLines) || 0;
          if (this.isFirstChunk && skipFirstNLines > 0) {
            let _newline = this._config.newline;
            if (!_newline) {
              const quoteChar = this._config.quoteChar || '"';
              _newline = this._handle.guessLineEndings(chunk, quoteChar);
            }
            const splitChunk = chunk.split(_newline);
            chunk = [...splitChunk.slice(skipFirstNLines)].join(_newline);
          }
          if (this.isFirstChunk && isFunction(this._config.beforeFirstChunk)) {
            var modifiedChunk = this._config.beforeFirstChunk(chunk);
            if (modifiedChunk !== void 0)
              chunk = modifiedChunk;
          }
          this.isFirstChunk = false;
          this._halted = false;
          var aggregate = this._partialLine + chunk;
          this._partialLine = "";
          var results = this._handle.parse(aggregate, this._baseIndex, !this._finished);
          if (this._handle.paused() || this._handle.aborted()) {
            this._halted = true;
            return;
          }
          var lastIndex = results.meta.cursor;
          if (!this._finished) {
            this._partialLine = aggregate.substring(lastIndex - this._baseIndex);
            this._baseIndex = lastIndex;
          }
          if (results && results.data)
            this._rowCount += results.data.length;
          var finishedIncludingPreview = this._finished || this._config.preview && this._rowCount >= this._config.preview;
          if (IS_PAPA_WORKER) {
            global.postMessage({
              results,
              workerId: Papa3.WORKER_ID,
              finished: finishedIncludingPreview
            });
          } else if (isFunction(this._config.chunk) && !isFakeChunk) {
            this._config.chunk(results, this._handle);
            if (this._handle.paused() || this._handle.aborted()) {
              this._halted = true;
              return;
            }
            results = void 0;
            this._completeResults = void 0;
          }
          if (!this._config.step && !this._config.chunk) {
            this._completeResults.data = this._completeResults.data.concat(results.data);
            this._completeResults.errors = this._completeResults.errors.concat(results.errors);
            this._completeResults.meta = results.meta;
          }
          if (!this._completed && finishedIncludingPreview && isFunction(this._config.complete) && (!results || !results.meta.aborted)) {
            this._config.complete(this._completeResults, this._input);
            this._completed = true;
          }
          if (!finishedIncludingPreview && (!results || !results.meta.paused))
            this._nextChunk();
          return results;
        };
        this._sendError = function(error) {
          if (isFunction(this._config.error))
            this._config.error(error);
          else if (IS_PAPA_WORKER && this._config.error) {
            global.postMessage({
              workerId: Papa3.WORKER_ID,
              error,
              finished: false
            });
          }
        };
        function replaceConfig(config2) {
          var configCopy = copy(config2);
          configCopy.chunkSize = parseInt(configCopy.chunkSize);
          if (!config2.step && !config2.chunk)
            configCopy.chunkSize = null;
          this._handle = new ParserHandle(configCopy);
          this._handle.streamer = this;
          this._config = configCopy;
        }
      }
      function NetworkStreamer(config) {
        config = config || {};
        if (!config.chunkSize)
          config.chunkSize = Papa3.RemoteChunkSize;
        ChunkStreamer.call(this, config);
        var xhr;
        if (IS_WORKER) {
          this._nextChunk = function() {
            this._readChunk();
            this._chunkLoaded();
          };
        } else {
          this._nextChunk = function() {
            this._readChunk();
          };
        }
        this.stream = function(url) {
          this._input = url;
          this._nextChunk();
        };
        this._readChunk = function() {
          if (this._finished) {
            this._chunkLoaded();
            return;
          }
          xhr = new XMLHttpRequest();
          if (this._config.withCredentials) {
            xhr.withCredentials = this._config.withCredentials;
          }
          if (!IS_WORKER) {
            xhr.onload = bindFunction(this._chunkLoaded, this);
            xhr.onerror = bindFunction(this._chunkError, this);
          }
          xhr.open(this._config.downloadRequestBody ? "POST" : "GET", this._input, !IS_WORKER);
          if (this._config.downloadRequestHeaders) {
            var headers = this._config.downloadRequestHeaders;
            for (var headerName in headers) {
              xhr.setRequestHeader(headerName, headers[headerName]);
            }
          }
          if (this._config.chunkSize) {
            var end = this._start + this._config.chunkSize - 1;
            xhr.setRequestHeader("Range", "bytes=" + this._start + "-" + end);
          }
          try {
            xhr.send(this._config.downloadRequestBody);
          } catch (err) {
            this._chunkError(err.message);
          }
          if (IS_WORKER && xhr.status === 0)
            this._chunkError();
        };
        this._chunkLoaded = function() {
          if (xhr.readyState !== 4)
            return;
          if (xhr.status < 200 || xhr.status >= 400) {
            this._chunkError();
            return;
          }
          this._start += this._config.chunkSize ? this._config.chunkSize : xhr.responseText.length;
          this._finished = !this._config.chunkSize || this._start >= getFileSize(xhr);
          this.parseChunk(xhr.responseText);
        };
        this._chunkError = function(errorMessage) {
          var errorText = xhr.statusText || errorMessage;
          this._sendError(new Error(errorText));
        };
        function getFileSize(xhr2) {
          var contentRange = xhr2.getResponseHeader("Content-Range");
          if (contentRange === null) {
            return -1;
          }
          return parseInt(contentRange.substring(contentRange.lastIndexOf("/") + 1));
        }
      }
      NetworkStreamer.prototype = Object.create(ChunkStreamer.prototype);
      NetworkStreamer.prototype.constructor = NetworkStreamer;
      function FileStreamer(config) {
        config = config || {};
        if (!config.chunkSize)
          config.chunkSize = Papa3.LocalChunkSize;
        ChunkStreamer.call(this, config);
        var reader, slice;
        var usingAsyncReader = typeof FileReader !== "undefined";
        this.stream = function(file) {
          this._input = file;
          slice = file.slice || file.webkitSlice || file.mozSlice;
          if (usingAsyncReader) {
            reader = new FileReader();
            reader.onload = bindFunction(this._chunkLoaded, this);
            reader.onerror = bindFunction(this._chunkError, this);
          } else
            reader = new FileReaderSync();
          this._nextChunk();
        };
        this._nextChunk = function() {
          if (!this._finished && (!this._config.preview || this._rowCount < this._config.preview))
            this._readChunk();
        };
        this._readChunk = function() {
          var input = this._input;
          if (this._config.chunkSize) {
            var end = Math.min(this._start + this._config.chunkSize, this._input.size);
            input = slice.call(input, this._start, end);
          }
          var txt = reader.readAsText(input, this._config.encoding);
          if (!usingAsyncReader)
            this._chunkLoaded({ target: { result: txt } });
        };
        this._chunkLoaded = function(event) {
          this._start += this._config.chunkSize;
          this._finished = !this._config.chunkSize || this._start >= this._input.size;
          this.parseChunk(event.target.result);
        };
        this._chunkError = function() {
          this._sendError(reader.error);
        };
      }
      FileStreamer.prototype = Object.create(ChunkStreamer.prototype);
      FileStreamer.prototype.constructor = FileStreamer;
      function StringStreamer(config) {
        config = config || {};
        ChunkStreamer.call(this, config);
        var remaining;
        this.stream = function(s) {
          remaining = s;
          return this._nextChunk();
        };
        this._nextChunk = function() {
          if (this._finished) return;
          var size = this._config.chunkSize;
          var chunk;
          if (size) {
            chunk = remaining.substring(0, size);
            remaining = remaining.substring(size);
          } else {
            chunk = remaining;
            remaining = "";
          }
          this._finished = !remaining;
          return this.parseChunk(chunk);
        };
      }
      StringStreamer.prototype = Object.create(StringStreamer.prototype);
      StringStreamer.prototype.constructor = StringStreamer;
      function ReadableStreamStreamer(config) {
        config = config || {};
        ChunkStreamer.call(this, config);
        var queue = [];
        var parseOnData = true;
        var streamHasEnded = false;
        this.pause = function() {
          ChunkStreamer.prototype.pause.apply(this, arguments);
          this._input.pause();
        };
        this.resume = function() {
          ChunkStreamer.prototype.resume.apply(this, arguments);
          this._input.resume();
        };
        this.stream = function(stream) {
          this._input = stream;
          this._input.on("data", this._streamData);
          this._input.on("end", this._streamEnd);
          this._input.on("error", this._streamError);
        };
        this._checkIsFinished = function() {
          if (streamHasEnded && queue.length === 1) {
            this._finished = true;
          }
        };
        this._nextChunk = function() {
          this._checkIsFinished();
          if (queue.length) {
            this.parseChunk(queue.shift());
          } else {
            parseOnData = true;
          }
        };
        this._streamData = bindFunction(function(chunk) {
          try {
            queue.push(typeof chunk === "string" ? chunk : chunk.toString(this._config.encoding));
            if (parseOnData) {
              parseOnData = false;
              this._checkIsFinished();
              this.parseChunk(queue.shift());
            }
          } catch (error) {
            this._streamError(error);
          }
        }, this);
        this._streamError = bindFunction(function(error) {
          this._streamCleanUp();
          this._sendError(error);
        }, this);
        this._streamEnd = bindFunction(function() {
          this._streamCleanUp();
          streamHasEnded = true;
          this._streamData("");
        }, this);
        this._streamCleanUp = bindFunction(function() {
          this._input.removeListener("data", this._streamData);
          this._input.removeListener("end", this._streamEnd);
          this._input.removeListener("error", this._streamError);
        }, this);
      }
      ReadableStreamStreamer.prototype = Object.create(ChunkStreamer.prototype);
      ReadableStreamStreamer.prototype.constructor = ReadableStreamStreamer;
      function DuplexStreamStreamer(_config) {
        var Duplex = require("stream").Duplex;
        var config = copy(_config);
        var parseOnWrite = true;
        var writeStreamHasFinished = false;
        var parseCallbackQueue = [];
        var stream = null;
        this._onCsvData = function(results) {
          var data = results.data;
          if (!stream.push(data) && !this._handle.paused()) {
            this._handle.pause();
          }
        };
        this._onCsvComplete = function() {
          stream.push(null);
        };
        config.step = bindFunction(this._onCsvData, this);
        config.complete = bindFunction(this._onCsvComplete, this);
        ChunkStreamer.call(this, config);
        this._nextChunk = function() {
          if (writeStreamHasFinished && parseCallbackQueue.length === 1) {
            this._finished = true;
          }
          if (parseCallbackQueue.length) {
            parseCallbackQueue.shift()();
          } else {
            parseOnWrite = true;
          }
        };
        this._addToParseQueue = function(chunk, callback) {
          parseCallbackQueue.push(bindFunction(function() {
            this.parseChunk(typeof chunk === "string" ? chunk : chunk.toString(config.encoding));
            if (isFunction(callback)) {
              return callback();
            }
          }, this));
          if (parseOnWrite) {
            parseOnWrite = false;
            this._nextChunk();
          }
        };
        this._onRead = function() {
          if (this._handle.paused()) {
            this._handle.resume();
          }
        };
        this._onWrite = function(chunk, encoding, callback) {
          this._addToParseQueue(chunk, callback);
        };
        this._onWriteComplete = function() {
          writeStreamHasFinished = true;
          this._addToParseQueue("");
        };
        this.getStream = function() {
          return stream;
        };
        stream = new Duplex({
          readableObjectMode: true,
          decodeStrings: false,
          read: bindFunction(this._onRead, this),
          write: bindFunction(this._onWrite, this)
        });
        stream.once("finish", bindFunction(this._onWriteComplete, this));
      }
      if (typeof PAPA_BROWSER_CONTEXT === "undefined") {
        DuplexStreamStreamer.prototype = Object.create(ChunkStreamer.prototype);
        DuplexStreamStreamer.prototype.constructor = DuplexStreamStreamer;
      }
      function ParserHandle(_config) {
        var MAX_FLOAT = Math.pow(2, 53);
        var MIN_FLOAT = -MAX_FLOAT;
        var FLOAT = /^\s*-?(\d+\.?|\.\d+|\d+\.\d+)([eE][-+]?\d+)?\s*$/;
        var ISO_DATE = /^((\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z)))$/;
        var self2 = this;
        var _stepCounter = 0;
        var _rowCounter = 0;
        var _input;
        var _parser;
        var _paused = false;
        var _aborted = false;
        var _delimiterError;
        var _fields = [];
        var _results = {
          // The last results returned from the parser
          data: [],
          errors: [],
          meta: {}
        };
        if (isFunction(_config.step)) {
          var userStep = _config.step;
          _config.step = function(results) {
            _results = results;
            if (needsHeaderRow())
              processResults();
            else {
              processResults();
              if (_results.data.length === 0)
                return;
              _stepCounter += results.data.length;
              if (_config.preview && _stepCounter > _config.preview)
                _parser.abort();
              else {
                _results.data = _results.data[0];
                userStep(_results, self2);
              }
            }
          };
        }
        this.parse = function(input, baseIndex, ignoreLastRow) {
          var quoteChar = _config.quoteChar || '"';
          if (!_config.newline)
            _config.newline = this.guessLineEndings(input, quoteChar);
          _delimiterError = false;
          if (!_config.delimiter) {
            var delimGuess = guessDelimiter(input, _config.newline, _config.skipEmptyLines, _config.comments, _config.delimitersToGuess);
            if (delimGuess.successful)
              _config.delimiter = delimGuess.bestDelimiter;
            else {
              _delimiterError = true;
              _config.delimiter = Papa3.DefaultDelimiter;
            }
            _results.meta.delimiter = _config.delimiter;
          } else if (isFunction(_config.delimiter)) {
            _config.delimiter = _config.delimiter(input);
            _results.meta.delimiter = _config.delimiter;
          }
          var parserConfig = copy(_config);
          if (_config.preview && _config.header)
            parserConfig.preview++;
          _input = input;
          _parser = new Parser(parserConfig);
          _results = _parser.parse(_input, baseIndex, ignoreLastRow);
          processResults();
          return _paused ? { meta: { paused: true } } : _results || { meta: { paused: false } };
        };
        this.paused = function() {
          return _paused;
        };
        this.pause = function() {
          _paused = true;
          _parser.abort();
          _input = isFunction(_config.chunk) ? "" : _input.substring(_parser.getCharIndex());
        };
        this.resume = function() {
          if (self2.streamer._halted) {
            _paused = false;
            self2.streamer.parseChunk(_input, true);
          } else {
            setTimeout(self2.resume, 3);
          }
        };
        this.aborted = function() {
          return _aborted;
        };
        this.abort = function() {
          _aborted = true;
          _parser.abort();
          _results.meta.aborted = true;
          if (isFunction(_config.complete))
            _config.complete(_results);
          _input = "";
        };
        this.guessLineEndings = function(input, quoteChar) {
          input = input.substring(0, 1024 * 1024);
          var re = new RegExp(escapeRegExp(quoteChar) + "([^]*?)" + escapeRegExp(quoteChar), "gm");
          input = input.replace(re, "");
          var r = input.split("\r");
          var n = input.split("\n");
          var nAppearsFirst = n.length > 1 && n[0].length < r[0].length;
          if (r.length === 1 || nAppearsFirst)
            return "\n";
          var numWithN = 0;
          for (var i = 0; i < r.length; i++) {
            if (r[i][0] === "\n")
              numWithN++;
          }
          return numWithN >= r.length / 2 ? "\r\n" : "\r";
        };
        function testEmptyLine(s) {
          return _config.skipEmptyLines === "greedy" ? s.join("").trim() === "" : s.length === 1 && s[0].length === 0;
        }
        function testFloat(s) {
          if (FLOAT.test(s)) {
            var floatValue = parseFloat(s);
            if (floatValue > MIN_FLOAT && floatValue < MAX_FLOAT) {
              return true;
            }
          }
          return false;
        }
        function processResults() {
          if (_results && _delimiterError) {
            addError("Delimiter", "UndetectableDelimiter", "Unable to auto-detect delimiting character; defaulted to '" + Papa3.DefaultDelimiter + "'");
            _delimiterError = false;
          }
          if (_config.skipEmptyLines) {
            _results.data = _results.data.filter(function(d) {
              return !testEmptyLine(d);
            });
          }
          if (needsHeaderRow())
            fillHeaderFields();
          return applyHeaderAndDynamicTypingAndTransformation();
        }
        function needsHeaderRow() {
          return _config.header && _fields.length === 0;
        }
        function fillHeaderFields() {
          if (!_results)
            return;
          function addHeader(header, i2) {
            if (isFunction(_config.transformHeader))
              header = _config.transformHeader(header, i2);
            _fields.push(header);
          }
          if (Array.isArray(_results.data[0])) {
            for (var i = 0; needsHeaderRow() && i < _results.data.length; i++)
              _results.data[i].forEach(addHeader);
            _results.data.splice(0, 1);
          } else
            _results.data.forEach(addHeader);
        }
        function shouldApplyDynamicTyping(field) {
          if (_config.dynamicTypingFunction && _config.dynamicTyping[field] === void 0) {
            _config.dynamicTyping[field] = _config.dynamicTypingFunction(field);
          }
          return (_config.dynamicTyping[field] || _config.dynamicTyping) === true;
        }
        function parseDynamic(field, value) {
          if (shouldApplyDynamicTyping(field)) {
            if (value === "true" || value === "TRUE")
              return true;
            else if (value === "false" || value === "FALSE")
              return false;
            else if (testFloat(value))
              return parseFloat(value);
            else if (ISO_DATE.test(value))
              return new Date(value);
            else
              return value === "" ? null : value;
          }
          return value;
        }
        function applyHeaderAndDynamicTypingAndTransformation() {
          if (!_results || !_config.header && !_config.dynamicTyping && !_config.transform)
            return _results;
          function processRow(rowSource, i) {
            var row = _config.header ? {} : [];
            var j;
            for (j = 0; j < rowSource.length; j++) {
              var field = j;
              var value = rowSource[j];
              if (_config.header)
                field = j >= _fields.length ? "__parsed_extra" : _fields[j];
              if (_config.transform)
                value = _config.transform(value, field);
              value = parseDynamic(field, value);
              if (field === "__parsed_extra") {
                row[field] = row[field] || [];
                row[field].push(value);
              } else
                row[field] = value;
            }
            if (_config.header) {
              if (j > _fields.length)
                addError("FieldMismatch", "TooManyFields", "Too many fields: expected " + _fields.length + " fields but parsed " + j, _rowCounter + i);
              else if (j < _fields.length)
                addError("FieldMismatch", "TooFewFields", "Too few fields: expected " + _fields.length + " fields but parsed " + j, _rowCounter + i);
            }
            return row;
          }
          var incrementBy = 1;
          if (!_results.data.length || Array.isArray(_results.data[0])) {
            _results.data = _results.data.map(processRow);
            incrementBy = _results.data.length;
          } else
            _results.data = processRow(_results.data, 0);
          if (_config.header && _results.meta)
            _results.meta.fields = _fields;
          _rowCounter += incrementBy;
          return _results;
        }
        function guessDelimiter(input, newline, skipEmptyLines, comments, delimitersToGuess) {
          var bestDelim, bestDelta, fieldCountPrevRow, maxFieldCount;
          delimitersToGuess = delimitersToGuess || [",", "	", "|", ";", Papa3.RECORD_SEP, Papa3.UNIT_SEP];
          for (var i = 0; i < delimitersToGuess.length; i++) {
            var delim = delimitersToGuess[i];
            var delta = 0, avgFieldCount = 0, emptyLinesCount = 0;
            fieldCountPrevRow = void 0;
            var preview = new Parser({
              comments,
              delimiter: delim,
              newline,
              preview: 10
            }).parse(input);
            for (var j = 0; j < preview.data.length; j++) {
              if (skipEmptyLines && testEmptyLine(preview.data[j])) {
                emptyLinesCount++;
                continue;
              }
              var fieldCount = preview.data[j].length;
              avgFieldCount += fieldCount;
              if (typeof fieldCountPrevRow === "undefined") {
                fieldCountPrevRow = fieldCount;
                continue;
              } else if (fieldCount > 0) {
                delta += Math.abs(fieldCount - fieldCountPrevRow);
                fieldCountPrevRow = fieldCount;
              }
            }
            if (preview.data.length > 0)
              avgFieldCount /= preview.data.length - emptyLinesCount;
            if ((typeof bestDelta === "undefined" || delta <= bestDelta) && (typeof maxFieldCount === "undefined" || avgFieldCount > maxFieldCount) && avgFieldCount > 1.99) {
              bestDelta = delta;
              bestDelim = delim;
              maxFieldCount = avgFieldCount;
            }
          }
          _config.delimiter = bestDelim;
          return {
            successful: !!bestDelim,
            bestDelimiter: bestDelim
          };
        }
        function addError(type, code, msg, row) {
          var error = {
            type,
            code,
            message: msg
          };
          if (row !== void 0) {
            error.row = row;
          }
          _results.errors.push(error);
        }
      }
      function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      function Parser(config) {
        config = config || {};
        var delim = config.delimiter;
        var newline = config.newline;
        var comments = config.comments;
        var step = config.step;
        var preview = config.preview;
        var fastMode = config.fastMode;
        var quoteChar;
        var renamedHeaders = null;
        var headerParsed = false;
        if (config.quoteChar === void 0 || config.quoteChar === null) {
          quoteChar = '"';
        } else {
          quoteChar = config.quoteChar;
        }
        var escapeChar = quoteChar;
        if (config.escapeChar !== void 0) {
          escapeChar = config.escapeChar;
        }
        if (typeof delim !== "string" || Papa3.BAD_DELIMITERS.indexOf(delim) > -1)
          delim = ",";
        if (comments === delim)
          throw new Error("Comment character same as delimiter");
        else if (comments === true)
          comments = "#";
        else if (typeof comments !== "string" || Papa3.BAD_DELIMITERS.indexOf(comments) > -1)
          comments = false;
        if (newline !== "\n" && newline !== "\r" && newline !== "\r\n")
          newline = "\n";
        var cursor = 0;
        var aborted = false;
        this.parse = function(input, baseIndex, ignoreLastRow) {
          if (typeof input !== "string")
            throw new Error("Input must be a string");
          var inputLen = input.length, delimLen = delim.length, newlineLen = newline.length, commentsLen = comments.length;
          var stepIsFunction = isFunction(step);
          cursor = 0;
          var data = [], errors = [], row = [], lastCursor = 0;
          if (!input)
            return returnable();
          if (fastMode || fastMode !== false && input.indexOf(quoteChar) === -1) {
            var rows = input.split(newline);
            for (var i = 0; i < rows.length; i++) {
              row = rows[i];
              cursor += row.length;
              if (i !== rows.length - 1)
                cursor += newline.length;
              else if (ignoreLastRow)
                return returnable();
              if (comments && row.substring(0, commentsLen) === comments)
                continue;
              if (stepIsFunction) {
                data = [];
                pushRow(row.split(delim));
                doStep();
                if (aborted)
                  return returnable();
              } else
                pushRow(row.split(delim));
              if (preview && i >= preview) {
                data = data.slice(0, preview);
                return returnable(true);
              }
            }
            return returnable();
          }
          var nextDelim = input.indexOf(delim, cursor);
          var nextNewline = input.indexOf(newline, cursor);
          var quoteCharRegex = new RegExp(escapeRegExp(escapeChar) + escapeRegExp(quoteChar), "g");
          var quoteSearch = input.indexOf(quoteChar, cursor);
          for (; ; ) {
            if (input[cursor] === quoteChar) {
              quoteSearch = cursor;
              cursor++;
              for (; ; ) {
                quoteSearch = input.indexOf(quoteChar, quoteSearch + 1);
                if (quoteSearch === -1) {
                  if (!ignoreLastRow) {
                    errors.push({
                      type: "Quotes",
                      code: "MissingQuotes",
                      message: "Quoted field unterminated",
                      row: data.length,
                      // row has yet to be inserted
                      index: cursor
                    });
                  }
                  return finish();
                }
                if (quoteSearch === inputLen - 1) {
                  var value = input.substring(cursor, quoteSearch).replace(quoteCharRegex, quoteChar);
                  return finish(value);
                }
                if (quoteChar === escapeChar && input[quoteSearch + 1] === escapeChar) {
                  quoteSearch++;
                  continue;
                }
                if (quoteChar !== escapeChar && quoteSearch !== 0 && input[quoteSearch - 1] === escapeChar) {
                  continue;
                }
                if (nextDelim !== -1 && nextDelim < quoteSearch + 1) {
                  nextDelim = input.indexOf(delim, quoteSearch + 1);
                }
                if (nextNewline !== -1 && nextNewline < quoteSearch + 1) {
                  nextNewline = input.indexOf(newline, quoteSearch + 1);
                }
                var checkUpTo = nextNewline === -1 ? nextDelim : Math.min(nextDelim, nextNewline);
                var spacesBetweenQuoteAndDelimiter = extraSpaces(checkUpTo);
                if (input.substr(quoteSearch + 1 + spacesBetweenQuoteAndDelimiter, delimLen) === delim) {
                  row.push(input.substring(cursor, quoteSearch).replace(quoteCharRegex, quoteChar));
                  cursor = quoteSearch + 1 + spacesBetweenQuoteAndDelimiter + delimLen;
                  if (input[quoteSearch + 1 + spacesBetweenQuoteAndDelimiter + delimLen] !== quoteChar) {
                    quoteSearch = input.indexOf(quoteChar, cursor);
                  }
                  nextDelim = input.indexOf(delim, cursor);
                  nextNewline = input.indexOf(newline, cursor);
                  break;
                }
                var spacesBetweenQuoteAndNewLine = extraSpaces(nextNewline);
                if (input.substring(quoteSearch + 1 + spacesBetweenQuoteAndNewLine, quoteSearch + 1 + spacesBetweenQuoteAndNewLine + newlineLen) === newline) {
                  row.push(input.substring(cursor, quoteSearch).replace(quoteCharRegex, quoteChar));
                  saveRow(quoteSearch + 1 + spacesBetweenQuoteAndNewLine + newlineLen);
                  nextDelim = input.indexOf(delim, cursor);
                  quoteSearch = input.indexOf(quoteChar, cursor);
                  if (stepIsFunction) {
                    doStep();
                    if (aborted)
                      return returnable();
                  }
                  if (preview && data.length >= preview)
                    return returnable(true);
                  break;
                }
                errors.push({
                  type: "Quotes",
                  code: "InvalidQuotes",
                  message: "Trailing quote on quoted field is malformed",
                  row: data.length,
                  // row has yet to be inserted
                  index: cursor
                });
                quoteSearch++;
                continue;
              }
              continue;
            }
            if (comments && row.length === 0 && input.substring(cursor, cursor + commentsLen) === comments) {
              if (nextNewline === -1)
                return returnable();
              cursor = nextNewline + newlineLen;
              nextNewline = input.indexOf(newline, cursor);
              nextDelim = input.indexOf(delim, cursor);
              continue;
            }
            if (nextDelim !== -1 && (nextDelim < nextNewline || nextNewline === -1)) {
              row.push(input.substring(cursor, nextDelim));
              cursor = nextDelim + delimLen;
              nextDelim = input.indexOf(delim, cursor);
              continue;
            }
            if (nextNewline !== -1) {
              row.push(input.substring(cursor, nextNewline));
              saveRow(nextNewline + newlineLen);
              if (stepIsFunction) {
                doStep();
                if (aborted)
                  return returnable();
              }
              if (preview && data.length >= preview)
                return returnable(true);
              continue;
            }
            break;
          }
          return finish();
          function pushRow(row2) {
            data.push(row2);
            lastCursor = cursor;
          }
          function extraSpaces(index) {
            var spaceLength = 0;
            if (index !== -1) {
              var textBetweenClosingQuoteAndIndex = input.substring(quoteSearch + 1, index);
              if (textBetweenClosingQuoteAndIndex && textBetweenClosingQuoteAndIndex.trim() === "") {
                spaceLength = textBetweenClosingQuoteAndIndex.length;
              }
            }
            return spaceLength;
          }
          function finish(value2) {
            if (ignoreLastRow)
              return returnable();
            if (typeof value2 === "undefined")
              value2 = input.substring(cursor);
            row.push(value2);
            cursor = inputLen;
            pushRow(row);
            if (stepIsFunction)
              doStep();
            return returnable();
          }
          function saveRow(newCursor) {
            cursor = newCursor;
            pushRow(row);
            row = [];
            nextNewline = input.indexOf(newline, cursor);
          }
          function returnable(stopped) {
            if (config.header && !baseIndex && data.length && !headerParsed) {
              const result = data[0];
              const headerCount = /* @__PURE__ */ Object.create(null);
              const usedHeaders = new Set(result);
              let duplicateHeaders = false;
              for (let i2 = 0; i2 < result.length; i2++) {
                let header = result[i2];
                if (isFunction(config.transformHeader))
                  header = config.transformHeader(header, i2);
                if (!headerCount[header]) {
                  headerCount[header] = 1;
                  result[i2] = header;
                } else {
                  let newHeader;
                  let suffixCount = headerCount[header];
                  do {
                    newHeader = `${header}_${suffixCount}`;
                    suffixCount++;
                  } while (usedHeaders.has(newHeader));
                  usedHeaders.add(newHeader);
                  result[i2] = newHeader;
                  headerCount[header]++;
                  duplicateHeaders = true;
                  if (renamedHeaders === null) {
                    renamedHeaders = {};
                  }
                  renamedHeaders[newHeader] = header;
                }
                usedHeaders.add(header);
              }
              if (duplicateHeaders) {
                console.warn("Duplicate headers found and renamed.");
              }
              headerParsed = true;
            }
            return {
              data,
              errors,
              meta: {
                delimiter: delim,
                linebreak: newline,
                aborted,
                truncated: !!stopped,
                cursor: lastCursor + (baseIndex || 0),
                renamedHeaders
              }
            };
          }
          function doStep() {
            step(returnable());
            data = [];
            errors = [];
          }
        };
        this.abort = function() {
          aborted = true;
        };
        this.getCharIndex = function() {
          return cursor;
        };
      }
      function newWorker() {
        if (!Papa3.WORKERS_SUPPORTED)
          return false;
        var workerUrl = getWorkerBlob();
        var w = new global.Worker(workerUrl);
        w.onmessage = mainThreadReceivedMessage;
        w.id = workerIdCounter++;
        workers[w.id] = w;
        return w;
      }
      function mainThreadReceivedMessage(e) {
        var msg = e.data;
        var worker = workers[msg.workerId];
        var aborted = false;
        if (msg.error)
          worker.userError(msg.error, msg.file);
        else if (msg.results && msg.results.data) {
          var abort = function() {
            aborted = true;
            completeWorker(msg.workerId, { data: [], errors: [], meta: { aborted: true } });
          };
          var handle = {
            abort,
            pause: notImplemented,
            resume: notImplemented
          };
          if (isFunction(worker.userStep)) {
            for (var i = 0; i < msg.results.data.length; i++) {
              worker.userStep({
                data: msg.results.data[i],
                errors: msg.results.errors,
                meta: msg.results.meta
              }, handle);
              if (aborted)
                break;
            }
            delete msg.results;
          } else if (isFunction(worker.userChunk)) {
            worker.userChunk(msg.results, handle, msg.file);
            delete msg.results;
          }
        }
        if (msg.finished && !aborted)
          completeWorker(msg.workerId, msg.results);
      }
      function completeWorker(workerId, results) {
        var worker = workers[workerId];
        if (isFunction(worker.userComplete))
          worker.userComplete(results);
        worker.terminate();
        delete workers[workerId];
      }
      function notImplemented() {
        throw new Error("Not implemented.");
      }
      function workerThreadReceivedMessage(e) {
        var msg = e.data;
        if (typeof Papa3.WORKER_ID === "undefined" && msg)
          Papa3.WORKER_ID = msg.workerId;
        if (typeof msg.input === "string") {
          global.postMessage({
            workerId: Papa3.WORKER_ID,
            results: Papa3.parse(msg.input, msg.config),
            finished: true
          });
        } else if (global.File && msg.input instanceof File || msg.input instanceof Object) {
          var results = Papa3.parse(msg.input, msg.config);
          if (results)
            global.postMessage({
              workerId: Papa3.WORKER_ID,
              results,
              finished: true
            });
        }
      }
      function copy(obj) {
        if (typeof obj !== "object" || obj === null)
          return obj;
        var cpy = Array.isArray(obj) ? [] : {};
        for (var key in obj)
          cpy[key] = copy(obj[key]);
        return cpy;
      }
      function bindFunction(f, self2) {
        return function() {
          f.apply(self2, arguments);
        };
      }
      function isFunction(func) {
        return typeof func === "function";
      }
      return Papa3;
    });
  }
});

// .tmp/admin-wpp-stickers-entry.ts
var admin_wpp_stickers_entry_exports = {};
__export(admin_wpp_stickers_entry_exports, {
  buildFlightDisplayInfo: () => buildFlightDisplayInfo2,
  buildFlightShareStickers: () => buildFlightShareStickers,
  buildRouteMap: () => buildRouteMap,
  chartDurationSec: () => chartDurationSec2,
  decodeFlightRecord: () => decodeFlightRecord2,
  formatDuration: () => formatDuration2,
  parseGarminCsv: () => parseGarminCsv2,
  summarizeFlight: () => summarizeFlight2
});
module.exports = __toCommonJS(admin_wpp_stickers_entry_exports);

// src/lib/flightStats.ts
function haversineM(a, b) {
  const R = 6371e3;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function summarizeFlight2(points) {
  if (points.length === 0) {
    return {
      durationSec: null,
      distanceM: 0,
      altMinM: null,
      altMaxM: null,
      speedAvgMs: null,
      speedMaxMs: null,
      pointCount: 0
    };
  }
  let distanceM = 0;
  for (let i = 1; i < points.length; i++) {
    distanceM += haversineM(points[i - 1], points[i]);
  }
  const withAlt = points.filter((p) => p.altM !== null).map((p) => p.altM);
  const altMinM = withAlt.length ? Math.min(...withAlt) : null;
  const altMaxM = withAlt.length ? Math.max(...withAlt) : null;
  const withSpd = points.filter((p) => p.speedMs !== null).map((p) => p.speedMs);
  const speedAvgMs = withSpd.length > 0 ? withSpd.reduce((a, b) => a + b, 0) / withSpd.length : null;
  const speedMaxMs = withSpd.length > 0 ? Math.max(...withSpd) : null;
  let durationSec = null;
  const t0 = points[0]?.t;
  const t1 = points[points.length - 1]?.t;
  if (t0 !== null && t1 !== null && t0 !== void 0 && t1 !== void 0 && t1 > t0) {
    durationSec = (t1 - t0) / 1e3;
  }
  return {
    durationSec,
    distanceM,
    altMinM,
    altMaxM,
    speedAvgMs,
    speedMaxMs,
    pointCount: points.length
  };
}
function formatDuration2(sec) {
  if (sec === null || !Number.isFinite(sec)) return "\u2014";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const rs = s % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${rs}s`;
  return `${rs}s`;
}
function formatSpeedKt(ms) {
  if (ms === null || !Number.isFinite(ms)) return "\u2014";
  const kt = ms / 0.514444;
  return `${kt.toFixed(0)} kt`;
}
function formatAltFt(m) {
  if (m === null || !Number.isFinite(m)) return "\u2014";
  const ft = m / 0.3048;
  return `${Math.round(ft).toLocaleString("pt-BR")} ft`;
}
function chartDurationSec2(chartData, hasTime) {
  if (!hasTime || chartData.length < 2) return null;
  const xs = chartData.map((r) => r.x);
  const span = Math.max(...xs) - Math.min(...xs);
  if (span < 500) return null;
  return span / 1e3;
}

// .tmp/flightShareStickers.visual-only.ts
var STICKER_WIDTH = 1080;
var STICKER_HEIGHT = 1920;
var BRAND_LOG_PREFIX = "[gfv:brand]";
function summarizeBrand(brand) {
  return {
    schoolName: brand.schoolName,
    hasLogoUrl: Boolean(brand.logoUrl.trim()),
    logoUrl: brand.logoUrl,
    hasLogoDataUrl: Boolean(brand.logoDataUrl?.startsWith("data:image/")),
    logoDataUrlLength: brand.logoDataUrl?.length ?? 0
  };
}
function warnBrandDebug(message, details) {
  console.warn(BRAND_LOG_PREFIX, message, details ?? {});
}
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function fitText(value, x, y, options) {
  const safe = escapeXml(value);
  const estimatedWidth = value.length * options.fontSize * 0.56;
  const fontSize = estimatedWidth > options.maxWidth ? Math.max(10, Math.floor(options.fontSize * (options.maxWidth / estimatedWidth))) : options.fontSize;
  const anchor = options.anchor ? ` text-anchor="${options.anchor}"` : "";
  const weight = options.fontWeight ? ` font-weight="${options.fontWeight}"` : "";
  const letterSpacing = options.letterSpacing !== void 0 ? ` letter-spacing="${options.letterSpacing}"` : "";
  const opacity = options.opacity !== void 0 ? ` opacity="${options.opacity}"` : "";
  return `<text x="${x}" y="${y}" fill="${options.color ?? "#f8fafc"}" font-size="${fontSize}"${weight}${anchor}${letterSpacing}${opacity}>${safe}</text>`;
}
function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "voo";
}
function clampText(value, fallback = "-") {
  const trimmed = value?.trim();
  return trimmed || fallback;
}
function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function formatDistanceNmKm(meters, fallbackNm) {
  if (meters > 0) {
    const nm = meters / 1852;
    const km = meters / 1e3;
    return `${nm.toFixed(1)} NM \xB7 ${km.toFixed(1)} km`;
  }
  const parsedFallback = Number((fallbackNm ?? "").replace(",", "."));
  if (Number.isFinite(parsedFallback) && parsedFallback > 0) return `${parsedFallback.toFixed(1)} NM`;
  return "-";
}
function formatDistanceShort(meters, fallbackNm) {
  if (meters > 0) return `${(meters / 1852).toFixed(1)} NM`;
  const parsedFallback = Number((fallbackNm ?? "").replace(",", "."));
  if (Number.isFinite(parsedFallback) && parsedFallback > 0) return `${parsedFallback.toFixed(1)} NM`;
  return "-";
}
function formatKt(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)} kt` : "-";
}
function formatFt(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value).toLocaleString("pt-BR")} ft` : "-";
}
function formatMetricAlt(summary, chartData) {
  if (summary.altMaxM !== null) return formatAltFt(summary.altMaxM);
  const maxAlt = maxSeriesValue(chartData, ["gpsAltFt", "baroAltFt", "pressAltFt"]);
  return formatFt(maxAlt);
}
function formatMetricSpeed(summary, chartData) {
  if (summary.speedMaxMs !== null) return formatSpeedKt(summary.speedMaxMs);
  return formatKt(maxSeriesValue(chartData, ["iasKt", "gsKt", "tasKt"]));
}
function logoHref(data) {
  const href = data.brand.logoDataUrl || null;
  if (!href) {
    warnBrandDebug("sticker has no embedded logo data URL", {
      flightId: data.flightId,
      brand: summarizeBrand(data.brand)
    });
  }
  return href;
}
function baseDefs(data) {
  const primary = escapeXml(data.brand.primaryColor);
  const accent = escapeXml(data.brand.accentColor);
  return `
    <defs>
      <linearGradient id="gfvAccent" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="${primary}" />
        <stop offset="100%" stop-color="${accent}" />
      </linearGradient>
      <linearGradient id="gfvSoft" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="${primary}" stop-opacity="0.32" />
        <stop offset="100%" stop-color="${accent}" stop-opacity="0.18" />
      </linearGradient>
      <filter id="gfvShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="26" stdDeviation="22" flood-color="#020617" flood-opacity="0.48" />
      </filter>
      <filter id="gfvGlow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="0" stdDeviation="16" flood-color="${primary}" flood-opacity="0.65" />
      </filter>
      <clipPath id="gfvStickerSafe">
        <rect x="86" y="120" width="908" height="1680" rx="41.6" />
      </clipPath>
      <style>
        text { font-family: "Segoe UI", Arial, sans-serif; }
      </style>
    </defs>
  `;
}
function svgShell(data, body, width = STICKER_WIDTH, height = STICKER_HEIGHT) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${baseDefs(data)}
    ${body}
  </svg>`;
}
function fullBleedBg(showBackground, width, height, color = "#020617") {
  if (!showBackground) return "";
  return `<rect x="0" y="0" width="${width}" height="${height}" fill="${color}" />`;
}
function smallBrand(data, x, y) {
  const href = logoHref(data);
  if (href) {
    return `<image href="${escapeXml(href)}" x="${x}" y="${y}" width="260" height="82" preserveAspectRatio="xMinYMid meet" />`;
  }
  return "";
}
function metricBlock(label, value, x, y, width = 395, height = 120) {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18.2" fill="#0f172a" fill-opacity="0.76" stroke="#ffffff" stroke-opacity="0.12" />
      ${fitText(label, x + 28, y + 42, { color: "#94a3b8", fontSize: 24, fontWeight: 700, maxWidth: width - 56, letterSpacing: 1 })}
      ${fitText(value, x + 28, y + 86, { fontSize: 36, fontWeight: 900, maxWidth: width - 56 })}
    </g>
  `;
}
function flightTitle(data) {
  const aircraft = clampText(data.displayInfo.aircraft, "Voo");
  const route = data.displayInfo.fromTo !== "-" ? ` \xB7 ${data.displayInfo.fromTo}` : "";
  return `${aircraft}${route}`;
}
function samplePoints(points, limit) {
  if (points.length <= limit) return points;
  const step = Math.ceil(points.length / limit);
  return points.filter((_, index) => index % step === 0 || index === points.length - 1);
}
function routePath(points, box) {
  if (points.length < 2) return "";
  const sampled = samplePoints(points, 320);
  const lats = sampled.map((point) => point.lat);
  const lons = sampled.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = maxLat - minLat || 1e-4;
  const lonSpan = maxLon - minLon || 1e-4;
  return sampled.map((point, index) => {
    const x = box.x + (point.lon - minLon) / lonSpan * box.w;
    const y = box.y + box.h - (point.lat - minLat) / latSpan * box.h;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}
function projectOsm(lat, lon, zoom) {
  const scale = 256 * 2 ** zoom;
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sinLat = Math.sin(safeLat * Math.PI / 180);
  return {
    x: (lon + 180) / 360 * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  };
}
function chooseOsmZoom(points, targetWidth, targetHeight) {
  for (let zoom = 18; zoom >= 3; zoom--) {
    const projected = points.map((point) => projectOsm(point.lat, point.lon, zoom));
    const width = Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x));
    const height = Math.max(...projected.map((point) => point.y)) - Math.min(...projected.map((point) => point.y));
    if (width <= targetWidth && height <= targetHeight) return zoom;
  }
  return 3;
}
async function imageUrlToDataUrl(url) {
  try {
    const headers = typeof window === "undefined" ? {
      "accept": "image/avif,image/webp,image/png,image/*;q=0.8",
      "referer": "https://app.epeac.com.br/",
      "user-agent": "EPEAC Flight Review Bot/1.0 (https://app.epeac.com.br)"
    } : void 0;
    const response = await fetch(url, { mode: "cors", headers });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) return null;
    const blob = await response.blob();
    if (blob.size < 200 || blob.size > 75e4) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
async function buildRouteMap(points) {
  if (points.length < 2) return null;
  const width = 1080;
  const height = 720;
  const padding = 40;
  const sampled = samplePoints(points, 900);
  const zoom = chooseOsmZoom(sampled, width - padding * 2, height - padding * 2);
  const projected = sampled.map((point) => projectOsm(point.lat, point.lon, zoom));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const routeW = Math.max(maxX - minX, 1);
  const routeH = Math.max(maxY - minY, 1);
  const scale = Math.min(
    (width - padding * 2) / routeW,
    (height - padding * 2) / routeH
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const leftWorld = centerX - width / (2 * scale);
  const topWorld = centerY - height / (2 * scale);
  const tileSize = 256 * scale;
  const maxTile = 2 ** zoom;
  const tileMinX = Math.floor(leftWorld / 256);
  const tileMaxX = Math.floor((leftWorld + width / scale) / 256);
  const tileMinY = Math.max(0, Math.floor(topWorld / 256));
  const tileMaxY = Math.min(maxTile - 1, Math.floor((topWorld + height / scale) / 256));
  const tiles = [];
  for (let tileX = tileMinX; tileX <= tileMaxX; tileX++) {
    for (let tileY = tileMinY; tileY <= tileMaxY; tileY++) {
      const wrappedX = (tileX % maxTile + maxTile) % maxTile;
      const subdomain = ["a", "b", "c"][Math.abs(tileX + tileY) % 3] ?? "a";
      const tileUrl = `https://${subdomain}.tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`;
      const href = await imageUrlToDataUrl(tileUrl);
      if (!href) continue;
      tiles.push({
        href,
        x: tileX * 256 * scale - leftWorld * scale,
        y: tileY * 256 * scale - topWorld * scale
      });
    }
  }
  return {
    width,
    height,
    tileSize,
    tiles,
    routePoints: projected.map((point) => ({
      x: (point.x - leftWorld) * scale,
      y: (point.y - topWorld) * scale
    }))
  };
}
function routePointsInBox(data, box) {
  const map = data.routeMap;
  if (map && map.routePoints.length >= 2) {
    const scaleX = box.w / map.width;
    const scaleY = box.h / map.height;
    return map.routePoints.map((point) => ({
      x: box.x + point.x * scaleX,
      y: box.y + point.y * scaleY
    }));
  }
  if (data.points.length < 2) return [];
  const sampled = samplePoints(data.points, 320);
  const lats = sampled.map((point) => point.lat);
  const lons = sampled.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = maxLat - minLat || 1e-4;
  const lonSpan = maxLon - minLon || 1e-4;
  return sampled.map((point) => ({
    x: box.x + (point.lon - minLon) / lonSpan * box.w,
    y: box.y + box.h - (point.lat - minLat) / latSpan * box.h
  }));
}
function routePathFromMap(map, box) {
  if (!map || map.routePoints.length < 2) return "";
  const scaleX = box.w / map.width;
  const scaleY = box.h / map.height;
  return map.routePoints.map((point, index) => `${index === 0 ? "M" : "L"} ${(box.x + point.x * scaleX).toFixed(1)} ${(box.y + point.y * scaleY).toFixed(1)}`).join(" ");
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function routeProgressColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const stops = [
    { t: 0, r: 34, g: 197, b: 94 },
    { t: 0.5, r: 59, g: 130, b: 246 },
    { t: 1, r: 239, g: 68, b: 68 }
  ];
  const endIndex = stops.findIndex((stop) => stop.t >= clamped);
  const next = stops[endIndex < 0 ? stops.length - 1 : endIndex];
  const prev = stops[Math.max(0, (endIndex < 0 ? stops.length - 1 : endIndex) - 1)];
  const span = next.t - prev.t || 1;
  const local = (clamped - prev.t) / span;
  const r = Math.round(lerp(prev.r, next.r, local));
  const g = Math.round(lerp(prev.g, next.g, local));
  const b = Math.round(lerp(prev.b, next.b, local));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
function routeGradientStroke(data, box, strokeWidth = 14) {
  const points = routePointsInBox(data, box);
  if (points.length < 2) return "";
  const maxSegments = 120;
  const step = Math.max(1, Math.ceil((points.length - 1) / maxSegments));
  const parts = [];
  for (let i = 0; i < points.length - 1; i += step) {
    const nextIndex = Math.min(points.length - 1, i + step);
    const a = points[i];
    const b = points[nextIndex];
    const t = i / (points.length - 1);
    const color = routeProgressColor(t);
    parts.push(
      `<path d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`
    );
  }
  return parts.join("\n");
}
function routeAirportCodes(data) {
  const legs = data.meta?.legs.filter((leg) => leg.dep || leg.arr) ?? [];
  const dep = legs.find((leg) => leg.dep)?.dep;
  const arr = [...legs].reverse().find((leg) => leg.arr)?.arr;
  if (dep || arr) return [clampText(dep, "DEP").toUpperCase(), clampText(arr, "ARR").toUpperCase()];
  const parts = data.displayInfo.fromTo.split(/\s*(?:->|→|\/| - | – )\s*/).map((part) => part.trim().toUpperCase()).filter(Boolean);
  return [parts[0] || "DEP", parts[parts.length - 1] || "ARR"];
}
function routeEndpointPositions(data, box) {
  const map = data.routeMap;
  if (map && map.routePoints.length >= 2) {
    const scaleX = box.w / map.width;
    const scaleY = box.h / map.height;
    const first = map.routePoints[0];
    const last = map.routePoints[map.routePoints.length - 1];
    return [
      { x: box.x + first.x * scaleX, y: box.y + first.y * scaleY },
      { x: box.x + last.x * scaleX, y: box.y + last.y * scaleY }
    ];
  }
  if (data.points.length < 2) return [];
  const sampled = samplePoints(data.points, 320);
  const lats = sampled.map((point) => point.lat);
  const lons = sampled.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = maxLat - minLat || 1e-4;
  const lonSpan = maxLon - minLon || 1e-4;
  const positionFor = (point) => ({
    x: box.x + (point.lon - minLon) / lonSpan * box.w,
    y: box.y + box.h - (point.lat - minLat) / latSpan * box.h
  });
  return [positionFor(sampled[0]), positionFor(sampled[sampled.length - 1])];
}
function routeEndpointMarkers(data, box) {
  const positions = routeEndpointPositions(data, box);
  if (positions.length < 2) return "";
  const [depCode, arrCode] = routeAirportCodes(data);
  return positions.map((position, index) => {
    const code = index === 0 ? depCode : arrCode;
    const labelWidth = Math.max(74, code.length * 23 + 34);
    const labelX = clampNumber(position.x, box.x + labelWidth / 2 + 14, box.x + box.w - labelWidth / 2 - 14);
    const labelY = clampNumber(position.y - 44, box.y + 30, box.y + box.h - 38);
    const markerX = clampNumber(position.x, box.x + 18, box.x + box.w - 18);
    const markerY = clampNumber(position.y, box.y + 18, box.y + box.h - 18);
    return `
      <g>
        <circle cx="${markerX.toFixed(1)}" cy="${markerY.toFixed(1)}" r="18" fill="#020617" fill-opacity="0.82" stroke="#ffffff" stroke-width="5" />
        <circle cx="${markerX.toFixed(1)}" cy="${markerY.toFixed(1)}" r="8" fill="url(#gfvAccent)" />
        <rect x="${(labelX - labelWidth / 2).toFixed(1)}" y="${(labelY - 28).toFixed(1)}" width="${labelWidth}" height="42" rx="13.65" fill="#020617" fill-opacity="0.86" stroke="#ffffff" stroke-opacity="0.28" />
        ${fitText(code, labelX, labelY + 2, { fontSize: 25, fontWeight: 900, maxWidth: labelWidth - 22, anchor: "middle" })}
      </g>
    `;
  }).join("");
}
function routeMapLayer(data, box, includeTiles, options = {}) {
  const showEndpoints = options.showEndpoints ?? true;
  const showFrame = options.showFrame ?? true;
  const radius = options.radius ?? 33.8;
  const map = data.routeMap;
  const route = routePathFromMap(map, box) || routePath(data.points, box);
  const track = routeGradientStroke(data, box, 14);
  const clipId = `gfvMapClip${Math.round(box.x)}${Math.round(box.y)}${Math.round(box.w)}${Math.round(box.h)}`;
  const tiles = includeTiles && map?.tiles.length ? map.tiles.map((tile) => {
    const scaleX = box.w / map.width;
    const scaleY = box.h / map.height;
    const tileSize = map.tileSize ?? 256;
    return `<image href="${escapeXml(tile.href)}" x="${(box.x + tile.x * scaleX).toFixed(1)}" y="${(box.y + tile.y * scaleY).toFixed(1)}" width="${(tileSize * scaleX).toFixed(1)}" height="${(tileSize * scaleY).toFixed(1)}" preserveAspectRatio="none" />`;
  }).join("") : "";
  const clipRect = radius > 0 ? `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${radius}" />` : `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" />`;
  return `
    <defs>
      <clipPath id="${clipId}">
        ${clipRect}
      </clipPath>
    </defs>
    <g clip-path="url(#${clipId})">
      <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" ${radius > 0 ? `rx="${radius}"` : ""} fill="${includeTiles ? "#e5e7eb" : "#0f172a"}" fill-opacity="${includeTiles ? "0.96" : "0.32"}" />
      ${tiles}
      ${!includeTiles || !tiles ? Array.from({ length: 8 }, (_, index) => `<line x1="${box.x + index * (box.w / 7)}" y1="${box.y}" x2="${box.x + index * (box.w / 7)}" y2="${box.y + box.h}" stroke="#ffffff" stroke-opacity="0.12" />`).join("") : ""}
      ${!includeTiles || !tiles ? Array.from({ length: 7 }, (_, index) => `<line x1="${box.x}" y1="${box.y + index * (box.h / 6)}" x2="${box.x + box.w}" y2="${box.y + index * (box.h / 6)}" stroke="#ffffff" stroke-opacity="0.12" />`).join("") : ""}
      ${track || (route ? `<path d="${route}" fill="none" stroke="#3b82f6" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />` : "")}
      ${route && showEndpoints ? routeEndpointMarkers(data, box) : ""}
      ${route ? "" : `<text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" fill="#cbd5e1" font-size="34" font-weight="700" text-anchor="middle">Rota indispon\xEDvel</text>`}
      ${showFrame ? `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" ${radius > 0 ? `rx="${radius}"` : ""} fill="none" stroke="#ffffff" stroke-opacity="0.26" stroke-width="2" />` : ""}
    </g>
  `;
}
function samplesFromChart(chartData, keys) {
  const samples = [];
  for (const row of chartData) {
    const y = keys.map((key) => row[key]).find((value) => typeof value === "number" && Number.isFinite(value));
    if (typeof y === "number") samples.push({ x: row.x, y });
  }
  return samples;
}
function samplesFromPoints(points, key) {
  return points.map((point, index) => {
    if (key === "altitudeFt" && point.altM !== null) return { x: point.t ?? index, y: point.altM / 0.3048 };
    if (key === "speedKt" && point.speedMs !== null) return { x: point.t ?? index, y: point.speedMs / 0.514444 };
    return null;
  }).filter((sample) => sample !== null);
}
function chartPath(samples, box) {
  if (samples.length < 2) return "";
  const sampled = samples.length > 260 ? samples.filter((_, index) => index % Math.ceil(samples.length / 260) === 0) : samples;
  const xs = sampled.map((sample) => sample.x);
  const ys = sampled.map((sample) => sample.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xSpan = maxX - minX || 1;
  const ySpan = maxY - minY || 1;
  return sampled.map((sample, index) => {
    const x = box.x + (sample.x - minX) / xSpan * box.w;
    const y = box.y + box.h - (sample.y - minY) / ySpan * box.h;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}
function chartAreaPath(samples, box) {
  const line = chartPath(samples, box);
  if (!line) return "";
  return `${line} L ${box.x + box.w} ${box.y + box.h} L ${box.x} ${box.y + box.h} Z`;
}
function maxSeriesValue(chartData, keys) {
  const values = [];
  for (const row of chartData) {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "number" && Number.isFinite(value)) values.push(value);
    }
  }
  return values.length > 0 ? Math.max(...values) : null;
}
function summarySticker(data, options = {}) {
  const showBackground = options.showBackground ?? true;
  const title = flightTitle(data);
  const distance = formatDistanceNmKm(data.summary.distanceM, data.displayInfo.totalMiles);
  const altMax = formatMetricAlt(data.summary, data.chartData);
  const speedMax = formatMetricSpeed(data.summary, data.chartData);
  const width = 1080;
  const height = 560;
  const pad = 48;
  const body = `
    <g>
      ${fullBleedBg(showBackground, width, height)}
      ${fitText(title, pad, 88, { fontSize: 44, fontWeight: 900, maxWidth: 680 })}
      ${smallBrand(data, width - 300, 36)}
      <rect x="${pad}" y="118" width="${width - pad * 2}" height="3" rx="1.3" fill="url(#gfvAccent)" />
      ${metricBlock("Tempo", data.durationDisplay, pad, 160, 460, 130)}
      ${metricBlock("Dist\xE2ncia", distance, pad + 492, 160, 460, 130)}
      ${metricBlock("Alt. m\xE1xima", altMax, pad, 320, 460, 130)}
      ${metricBlock("Vel. m\xE1xima", speedMax, pad + 492, 320, 460, 130)}
    </g>
  `;
  return createSticker("summary", "Resumo do voo", "M\xE9tricas principais do voo.", data, body, width, height);
}
function routeSticker(data, options = {}) {
  const showBackground = options.showBackground ?? true;
  const width = 1080;
  const height = 780;
  const pad = 40;
  const box = { x: pad, y: 120, w: width - pad * 2, h: 480 };
  const body = `
    <g>
      ${fullBleedBg(showBackground, width, height)}
      ${fitText("Rota do voo", pad, 58, { fontSize: 40, fontWeight: 900, maxWidth: 560 })}
      ${fitText(flightTitle(data), pad, 96, { color: "#cbd5e1", fontSize: 24, fontWeight: 700, maxWidth: 560 })}
      ${smallBrand(data, width - 300, 28)}
      ${routeMapLayer(data, box, true, { radius: 20.8 })}
      ${metricMini("Dist\xE2ncia", formatDistanceShort(data.summary.distanceM, data.displayInfo.totalMiles), pad + 20, 660)}
      ${metricMini("Tempo", data.durationDisplay, 380, 660)}
      ${metricMini("Pousos", String(data.displayInfo.landings || "-"), 720, 660)}
    </g>
  `;
  return createSticker("route", "Rota + m\xE9tricas", "Trilha GPS com tempo, dist\xE2ncia e pousos.", data, body, width, height);
}
function cleanMapLogoOverlay(data, box) {
  const href = logoHref(data);
  if (!href) return "";
  const logoW = 220;
  const logoH = 72;
  const pad = 28;
  return `<image href="${escapeXml(href)}" x="${box.x + box.w - logoW - pad}" y="${box.y + pad}" width="${logoW}" height="${logoH}" preserveAspectRatio="xMaxYMid meet" />`;
}
function mapOverlayMetricCard(label, value, x, y, width, height) {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18.2" fill="#0f172a" fill-opacity="0.8" stroke="#ffffff" stroke-opacity="0.16" />
      ${fitText(label, x + width / 2, y + 44, { color: "#94a3b8", fontSize: 24, fontWeight: 800, maxWidth: width - 40, anchor: "middle", letterSpacing: 1 })}
      ${fitText(value, x + width / 2, y + 96, { fontSize: 40, fontWeight: 900, maxWidth: width - 40, anchor: "middle" })}
    </g>
  `;
}
function mapSticker(data, _options = {}) {
  const width = 1080;
  const height = 720;
  const box = { x: 0, y: 0, w: width, h: height };
  const body = `
    <g>
      ${routeMapLayer(data, box, true, { showEndpoints: true, showFrame: false, radius: 0 })}
      ${cleanMapLogoOverlay(data, box)}
    </g>
  `;
  return createSticker("map", "Mapa", "S\xF3 o mapa e o tra\xE7ado do voo.", data, body, width, height);
}
function mapStatsSticker(data, _options = {}) {
  const width = 1080;
  const height = 720;
  const box = { x: 0, y: 0, w: width, h: height };
  const cardW = 460;
  const cardH = 140;
  const gap = 28;
  const totalW = cardW * 2 + gap;
  const startX = (width - totalW) / 2;
  const cardY = height - cardH - 36;
  const body = `
    <g>
      ${routeMapLayer(data, box, true, { showEndpoints: true, showFrame: false, radius: 0 })}
      ${cleanMapLogoOverlay(data, box)}
      ${mapOverlayMetricCard("Tempo", data.durationDisplay, startX, cardY, cardW, cardH)}
      ${mapOverlayMetricCard(
    "Dist\xE2ncia",
    formatDistanceShort(data.summary.distanceM, data.displayInfo.totalMiles),
    startX + cardW + gap,
    cardY,
    cardW,
    cardH
  )}
    </g>
  `;
  return createSticker("mapStats", "Mapa + m\xE9tricas", "Mapa limpo com tempo e dist\xE2ncia.", data, body, width, height);
}
function legDistance(value) {
  const clean = value.trim();
  if (!clean) return "-";
  const n = Number(clean.replace(",", ".").replace(/[^\d.-]/g, ""));
  if (Number.isFinite(n) && n > 0) return `${n.toFixed(1)} NM`;
  return clean;
}
function legTime(value) {
  return value.trim() || "-";
}
function legRows(data, x, y, width) {
  const legs = data.meta?.legs.filter((leg) => leg.dep || leg.arr) ?? [];
  if (legs.length === 0) {
    return `<text x="${x + width / 2}" y="${y + 80}" fill="#cbd5e1" font-size="28" font-weight="700" text-anchor="middle">Pernas n\xE3o informadas na ficha.</text>`;
  }
  return legs.slice(0, 6).map((leg, index) => {
    const rowY = y + index * 92;
    const lineY = rowY + 52;
    const dep = clampText(leg.dep, "DEP").toUpperCase();
    const arr = clampText(leg.arr, "ARR").toUpperCase();
    const detail = `${legTime(leg.flightTime)} \xB7 ${legDistance(leg.distance)}`;
    return `
      <g>
        ${fitText(detail, x + width / 2, rowY + 28, { color: "#f8fafc", fontSize: 28, fontWeight: 900, maxWidth: width - 200, anchor: "middle" })}
        <rect x="${x + 110}" y="${lineY - 5}" width="${width - 220}" height="10" rx="3.9" fill="url(#gfvAccent)" />
        <circle cx="${x + 110}" cy="${lineY}" r="8" fill="#f8fafc" />
        <circle cx="${x + width - 110}" cy="${lineY}" r="8" fill="#f8fafc" />
        ${fitText(dep, x, lineY + 36, { fontSize: 30, fontWeight: 900, maxWidth: 220 })}
        ${fitText(arr, x + width, lineY + 36, { fontSize: 30, fontWeight: 900, maxWidth: 220, anchor: "end" })}
      </g>
    `;
  }).join("");
}
function legsContentMetrics(data) {
  const legs = data.meta?.legs.filter((leg) => leg.dep || leg.arr) ?? [];
  const visibleLegs = Math.max(1, Math.min(legs.length || 1, 6));
  const rowsHeight = visibleLegs * 92;
  const rowsBoxHeight = Math.max(180, rowsHeight + 48);
  const height = 120 + rowsBoxHeight + 48;
  return { rowsBoxHeight, height };
}
function legsSticker(data, options = {}) {
  const showBackground = options.showBackground ?? true;
  const layout = legsContentMetrics(data);
  const width = 1080;
  const height = layout.height;
  const pad = 48;
  const body = `
    <g>
      ${fullBleedBg(showBackground, width, height)}
      ${fitText("Pernas do voo", pad, 64, { fontSize: 40, fontWeight: 900, maxWidth: 560 })}
      ${smallBrand(data, width - 300, 28)}
      ${legRows(data, pad + 24, 120, width - pad * 2 - 48)}
    </g>
  `;
  return createSticker("legs", "Pernas do voo", "Uma linha para cada perna com tempo e dist\xE2ncia.", data, body, width, height);
}
function altitudeSticker(data, options = {}) {
  const showBackground = options.showBackground ?? true;
  const samples = samplesFromChart(data.chartData, ["gpsAltFt", "baroAltFt", "pressAltFt"]);
  const fallbackSamples = samples.length >= 2 ? samples : samplesFromPoints(data.points, "altitudeFt");
  const width = 1080;
  const height = 700;
  const pad = 48;
  const box = { x: pad, y: 200, w: width - pad * 2, h: 300 };
  const linePath = chartPath(fallbackSamples, box);
  const areaPath = chartAreaPath(fallbackSamples, box);
  const altMax = formatMetricAlt(data.summary, data.chartData);
  const body = `
    <g>
      ${fullBleedBg(showBackground, width, height)}
      ${fitText("ALTIMETRIA", pad, 56, { color: "#94a3b8", fontSize: 24, fontWeight: 900, maxWidth: 420, letterSpacing: 3 })}
      ${fitText(altMax, pad, 118, { fontSize: 60, fontWeight: 900, maxWidth: 520 })}
      ${fitText("Altitude m\xE1xima", pad, 158, { color: "#cbd5e1", fontSize: 24, fontWeight: 700, maxWidth: 520 })}
      ${smallBrand(data, width - 300, 28)}
      <path d="${areaPath}" fill="url(#gfvSoft)" />
      <path d="${linePath}" fill="none" stroke="url(#gfvAccent)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" filter="url(#gfvGlow)" />
      ${linePath ? "" : `<text x="${width / 2}" y="360" fill="#cbd5e1" font-size="30" font-weight="700" text-anchor="middle">Altimetria indispon\xEDvel</text>`}
      <line x1="${pad}" y1="${box.y + box.h}" x2="${width - pad}" y2="${box.y + box.h}" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2" />
      ${metricBlock("Tempo de voo", data.durationDisplay, pad, height - 160, 460, 110)}
      ${metricBlock("Dist\xE2ncia", formatDistanceShort(data.summary.distanceM, data.displayInfo.totalMiles), pad + 492, height - 160, 460, 110)}
    </g>
  `;
  return createSticker("altitude", "Altitude", "Gr\xE1fico de altimetria em fundo transparente.", data, body, width, height);
}
function speedSticker(data, options = {}) {
  const showBackground = options.showBackground ?? true;
  const samples = samplesFromChart(data.chartData, ["iasKt", "gsKt", "tasKt"]);
  const fallbackSamples = samples.length >= 2 ? samples : samplesFromPoints(data.points, "speedKt");
  const width = 1080;
  const height = 700;
  const pad = 48;
  const box = { x: pad, y: 200, w: width - pad * 2, h: 300 };
  const linePath = chartPath(fallbackSamples, box);
  const areaPath = chartAreaPath(fallbackSamples, box);
  const maxSpeed = formatMetricSpeed(data.summary, data.chartData);
  const avgSpeed = data.summary.speedAvgMs !== null ? formatSpeedKt(data.summary.speedAvgMs) : formatKt(maxSeriesValue(data.chartData, ["iasKt", "gsKt"]));
  const body = `
    <g>
      ${fullBleedBg(showBackground, width, height)}
      ${fitText("VELOCIDADE", pad, 56, { color: "#94a3b8", fontSize: 24, fontWeight: 900, maxWidth: 420, letterSpacing: 3 })}
      ${fitText(maxSpeed, pad, 118, { fontSize: 60, fontWeight: 900, maxWidth: 520 })}
      ${fitText("m\xE1xima registrada", pad, 158, { color: "#cbd5e1", fontSize: 24, fontWeight: 700, maxWidth: 520 })}
      ${smallBrand(data, width - 300, 28)}
      <path d="${areaPath}" fill="url(#gfvSoft)" />
      <path d="${linePath}" fill="none" stroke="url(#gfvAccent)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" filter="url(#gfvGlow)" />
      ${linePath ? "" : `<text x="${width / 2}" y="360" fill="#cbd5e1" font-size="30" font-weight="700" text-anchor="middle">Velocidade indispon\xEDvel</text>`}
      ${metricBlock("Vel. m\xE9dia", avgSpeed, pad, height - 160, 460, 110)}
      ${metricBlock("Tempo", data.durationDisplay, pad + 492, height - 160, 460, 110)}
    </g>
  `;
  return createSticker("speed", "Velocidade", "Gr\xE1fico de velocidade e destaques.", data, body, width, height);
}
function metricMini(label, value, x, y) {
  return `
    <g>
      ${fitText(label, x, y, { color: "#94a3b8", fontSize: 22, fontWeight: 800, maxWidth: 220, letterSpacing: 1 })}
      ${fitText(value, x, y + 48, { fontSize: 36, fontWeight: 900, maxWidth: 220 })}
    </g>
  `;
}
function createSticker(id, title, description, data, body, width = STICKER_WIDTH, height = STICKER_HEIGHT) {
  const fileBase = slugify(`${data.displayInfo.aircraft}-${id}-${data.displayInfo.flightDateIso ?? data.flightId}`);
  return {
    id,
    title,
    description,
    fileName: `${fileBase}.png`,
    width,
    height,
    svg: svgShell(data, body, width, height)
  };
}
function buildFlightShareStickers(data, options = {}) {
  return [
    summarySticker(data, options),
    routeSticker(data, options),
    mapSticker(data, options),
    mapStatsSticker(data, options),
    legsSticker(data, options),
    altitudeSticker(data, options),
    speedSticker(data, options)
  ];
}

// src/lib/telemetryCsvMerge.ts
var import_papaparse = __toESM(require_papaparse(), 1);
var MAX_TELEMETRY_CSV_FILES = 4;
function normHeader(raw) {
  return raw.trim().toLowerCase().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
}
function findColumn(headers, patterns) {
  const byNorm = headers.map((h) => ({ raw: h, n: normHeader(h) }));
  for (const { raw, n } of byNorm) {
    for (const re of patterns) {
      if (re.test(n)) return raw;
    }
  }
  return void 0;
}
function findLocalTimeColumn(headers) {
  for (const h of headers) {
    const n = normHeader(h);
    if (/^utc/.test(n)) continue;
    if (/^time\s*\(/.test(n) || n === "time") return h;
  }
  return findColumn(headers, [/^lcl\s*time$/i, /^local\s*time$/i]);
}
function findUtcTimeColumn(headers) {
  for (const h of headers) {
    if (/^utc\s*time/.test(normHeader(h))) return h;
  }
  return void 0;
}
function findDateColumn(headers) {
  return findColumn(headers, [/^date\s*\(yyyy/i, /^lcl\s*date\b/i, /^local\s*date\b/i, /^utc\s*date\b/i]) ?? findColumn(headers, [/^date$/i]);
}
function parseNumberCell(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim();
  if (!s) return null;
  const cleaned = s.replace(/"/g, "").replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function parseTimeToMs(value, colName) {
  const n = normHeader(colName);
  const s = String(value ?? "").trim();
  if (!s) return null;
  const num = parseNumberCell(value);
  if (num !== null && !s.includes(":") && !s.includes("-") && !s.includes("/")) {
    if (/sec|elapsed|time\s*\(s\)/.test(n)) return num * 1e3;
    if (num > 1e12) return num;
    if (num > 1e9 && num < 1e12) return num * 1e3;
    if (num > 1e5 && num < 1e9) return num * 1e3;
  }
  const d = Date.parse(s);
  if (!Number.isNaN(d)) return d;
  const m = s.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3]);
    if ([h, min, sec].every((x) => Number.isFinite(x))) {
      return ((h * 60 + min) * 60 + sec) * 1e3;
    }
  }
  return null;
}
function parseLocalDateAndTime(dateVal, timeVal) {
  const dateStr = String(dateVal ?? "").trim();
  const timeStr = String(timeVal ?? "").trim();
  if (!dateStr || !timeStr) return null;
  const iso = `${dateStr}T${timeStr}`;
  let ms = Date.parse(iso);
  if (!Number.isNaN(ms)) return ms;
  ms = Date.parse(`${dateStr} ${timeStr}`);
  if (!Number.isNaN(ms)) return ms;
  const tm = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!tm) return null;
  const dayMs = Date.parse(`${dateStr}T00:00:00`);
  if (Number.isNaN(dayMs)) return null;
  const h = Number(tm[1]);
  const mi = Number(tm[2]);
  const s = Number(tm[3]);
  const frac = tm[4] ? Number(`0.${tm[4]}`) : 0;
  if (![h, mi, s].every((x) => Number.isFinite(x))) return null;
  return dayMs + ((h * 60 + mi) * 60 + s + frac) * 1e3;
}
function clipToDataHeader(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const tryLine = (i, strict) => {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(",")) return false;
    if (trimmed.startsWith("#")) return false;
    const cells = import_papaparse.default.parse(line, { delimiter: ",", quoteChar: '"', header: false });
    const row = cells.data[0] ?? [];
    const joined = row.join(",").toLowerCase();
    if (strict) {
      return /lcl\s*date/i.test(joined) || /date/i.test(joined) && /latitude/i.test(joined) && /longitude/i.test(joined) || /latitude/i.test(joined) && /longitude/i.test(joined) || /utc\s*date/i.test(joined) && /utc\s*time/i.test(joined);
    }
    return true;
  };
  for (let i = 0; i < lines.length; i++) {
    if (tryLine(i, true)) return { csv: lines.slice(i).join("\n"), headerLineIndex: i };
  }
  for (let i = 0; i < lines.length; i++) {
    if (tryLine(i, false)) return { csv: lines.slice(i).join("\n"), headerLineIndex: i };
  }
  return { csv: text.replace(/^\uFEFF/, ""), headerLineIndex: 0 };
}
function parseRowInstant(row, headers) {
  const colDate = findDateColumn(headers);
  const colLocalTime = findLocalTimeColumn(headers);
  const colUtcTime = findUtcTimeColumn(headers);
  const colLclDate = findColumn(headers, [/^lcl\s*date\b/i, /^local\s*date\b/i]) ?? findColumn(headers, [/^utc\s*date\b/i]);
  const colLclTime = findColumn(headers, [/^lcl\s*time\b/i, /^local\s*time\b/i]) ?? findColumn(headers, [/^utc\s*time\b/i]);
  const colTime = findColumn(headers, [/^timestamp$/, /^time$/, /date\s*&\s*time/, /^datetime$/, /^elapsed/]);
  const dateForInstant = colDate ?? colLclDate;
  const timeForInstant = colLocalTime ?? colLclTime ?? colUtcTime;
  if (dateForInstant && timeForInstant) return parseLocalDateAndTime(row[dateForInstant], row[timeForInstant]);
  if (colLclDate && colLclTime) return parseLocalDateAndTime(row[colLclDate], row[colLclTime]);
  if (colTime) return parseTimeToMs(row[colTime], colTime);
  return null;
}
function parseCsvFile(source, fileIndex) {
  const { csv } = clipToDataHeader(source.text);
  const parsed = import_papaparse.default.parse(csv, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (h) => h.trim()
  });
  const rows = parsed.data.filter((r) => Object.keys(r).some((k) => String(r[k] ?? "").trim() !== ""));
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const timedRows = rows.map((row, rowIndex) => ({
    row,
    instantMs: parseRowInstant(row, headers),
    fileIndex,
    rowIndex
  }));
  const instants = timedRows.map((row) => row.instantMs).filter((ms) => ms !== null);
  return {
    source,
    headers,
    rows,
    timedRows,
    startMs: instants.length ? Math.min(...instants) : null,
    endMs: instants.length ? Math.max(...instants) : null
  };
}
function buildSourceFileName(files) {
  if (files.length === 0) return "telemetria.csv";
  if (files.length === 1) return files[0].name || "telemetria.csv";
  const firstName = files[0].name || "telemetria.csv";
  const baseName = firstName.replace(/\.[^.\\/]+$/, "").trim() || "telemetria";
  return `${baseName}-merge-${files.length}-csvs.csv`;
}
function mergeTelemetryCsvFiles(sources) {
  const files = sources.filter((source) => source.text.trim());
  if (files.length === 0) {
    return { csv: "", files: [], gaps: [], totalGapSec: 0, sourceFileName: "telemetria.csv" };
  }
  if (files.length > MAX_TELEMETRY_CSV_FILES) {
    throw new Error(`Selecione no m\xE1ximo ${MAX_TELEMETRY_CSV_FILES} CSVs por voo.`);
  }
  const parsedFiles = files.map(parseCsvFile);
  if (parsedFiles.some((file) => file.rows.length === 0)) {
    throw new Error("Um dos CSVs selecionados n\xE3o tem linhas de dados ap\xF3s o cabe\xE7alho.");
  }
  if (parsedFiles.length > 1 && parsedFiles.some((file) => file.startMs === null || file.endMs === null)) {
    throw new Error("Para juntar m\xFAltiplos CSVs, todos precisam ter data/hora v\xE1lida nas linhas.");
  }
  const orderedFiles = [...parsedFiles].sort((a, b) => {
    const aStart = a.startMs ?? Number.MAX_SAFE_INTEGER;
    const bStart = b.startMs ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  });
  const fields = [];
  for (const file of orderedFiles) {
    for (const header of file.headers) {
      if (!fields.includes(header)) fields.push(header);
    }
  }
  const sortedRows = parsedFiles.flatMap((file) => file.timedRows).sort((a, b) => {
    const aInstant = a.instantMs ?? (parsedFiles[a.fileIndex]?.startMs ?? 0) + a.rowIndex;
    const bInstant = b.instantMs ?? (parsedFiles[b.fileIndex]?.startMs ?? 0) + b.rowIndex;
    if (aInstant !== bInstant) return aInstant - bInstant;
    if (a.fileIndex !== b.fileIndex) return a.fileIndex - b.fileIndex;
    return a.rowIndex - b.rowIndex;
  }).map(({ row }) => row);
  const gaps = [];
  for (let i = 1; i < orderedFiles.length; i++) {
    const previous = orderedFiles[i - 1];
    const current = orderedFiles[i];
    if (previous.endMs === null || current.startMs === null) continue;
    const durationSec = Math.max(0, (current.startMs - previous.endMs) / 1e3);
    gaps.push({
      afterName: previous.source.name,
      beforeName: current.source.name,
      startMs: previous.endMs,
      endMs: current.startMs,
      durationSec
    });
  }
  const csv = import_papaparse.default.unparse({ fields, data: sortedRows }, { newline: "\n" });
  return {
    csv,
    files: orderedFiles.map((file) => ({
      name: file.source.name,
      charCount: file.source.text.length,
      rowCount: file.rows.length,
      startMs: file.startMs,
      endMs: file.endMs
    })),
    gaps,
    totalGapSec: gaps.reduce((acc, gap) => acc + gap.durationSec, 0),
    sourceFileName: buildSourceFileName(orderedFiles.map((file) => file.source))
  };
}

// src/lib/flightRecordCodec.ts
var META_PREFIX = "#GFV_META_V1:";
var TELEMETRY_FILES_PREFIX = "#GFV_TELEMETRY_FILES_V1:";
function fromBase64(encoded) {
  return decodeURIComponent(escape(atob(encoded)));
}
function decodeFlightRecord2(recordText) {
  const normalized = (recordText ?? "").replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  const first = (lines[0] ?? "").trim();
  if (!first.startsWith(META_PREFIX)) {
    return { meta: null, telemetryCsv: normalized };
  }
  const encoded = first.slice(META_PREFIX.length).trim();
  let meta = null;
  try {
    const raw = fromBase64(encoded);
    meta = JSON.parse(raw);
  } catch {
    meta = null;
  }
  const second = (lines[1] ?? "").trim();
  if (second.startsWith(TELEMETRY_FILES_PREFIX)) {
    const fallbackCsv = lines.slice(2).join("\n");
    try {
      const raw = fromBase64(second.slice(TELEMETRY_FILES_PREFIX.length).trim());
      const parsed = JSON.parse(raw);
      const telemetryFiles = parsed.files?.filter((file) => typeof file.name === "string" && typeof file.text === "string") ?? [];
      if (telemetryFiles.length > 0) {
        const merged = mergeTelemetryCsvFiles(telemetryFiles);
        return {
          meta,
          telemetryCsv: merged.csv,
          telemetryFiles,
          telemetryFileMetadata: merged.files,
          telemetryGaps: merged.gaps,
          telemetryGapSec: merged.totalGapSec
        };
      }
    } catch {
    }
    return { meta, telemetryCsv: fallbackCsv };
  }
  return { meta, telemetryCsv: lines.slice(1).join("\n") };
}

// src/lib/flightHours.ts
function parseClockMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
function clockDiffMinutes(start, end) {
  const startMinutes = parseClockMinutes(start);
  const endMinutes = parseClockMinutes(end);
  if (startMinutes === null || endMinutes === null) return null;
  const diff = endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
  return diff > 0 ? diff : null;
}
function flightLegBlockMinutesFromMeta(meta) {
  const legs = Array.isArray(meta?.legs) ? meta.legs : [];
  let total = 0;
  let found = false;
  for (const leg of legs) {
    const minutes = clockDiffMinutes(leg.engineStart, leg.engineCut);
    if (minutes === null) continue;
    total += minutes;
    found = true;
  }
  return found && total > 0 ? total : null;
}
function flightBlockMinutesFromMeta(meta) {
  return flightLegBlockMinutesFromMeta(meta) ?? clockDiffMinutes(meta?.header.departureTimeUtc, meta?.header.engineCutoffTimeUtc);
}

// src/lib/flightDisplay.ts
function parseDurationToMinutes(value) {
  const raw = (value ?? "").trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (hhmm) return Number(hhmm[1] ?? "0") * 60 + Number(hhmm[2] ?? "0");
  const asDecimal = Number(raw.replace(",", "."));
  return Number.isFinite(asDecimal) && asDecimal > 0 ? Math.round(asDecimal * 60) : 0;
}
function formatMinutes(min) {
  const safe = Math.max(0, Math.round(min));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function addMinutesToTime(startTime, minutes) {
  const match = startTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || minutes <= 0) return "";
  const h = Number(match[1] ?? "0");
  const m = Number(match[2] ?? "0");
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const total = (h * 60 + m + Math.round(minutes)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function firstLegEngineStart(meta) {
  return meta?.legs.find((leg) => leg.engineStart?.trim())?.engineStart?.trim() || "";
}
function lastLegEngineCut(meta) {
  return [...meta?.legs ?? []].reverse().find((leg) => leg.engineCut?.trim())?.engineCut?.trim() || "";
}
function parseMiles(value) {
  const raw = (value ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function missionLabelFromSnapshotJson(snapshotJsonRaw) {
  if (!snapshotJsonRaw) return "";
  try {
    const parsed = JSON.parse(snapshotJsonRaw);
    const missionNames = Array.from(
      new Set([
        ...Array.isArray(parsed?.snapshots) ? parsed.snapshots.map((snapshot) => String(snapshot?.missionName ?? "").trim()) : [],
        String(parsed?.missionName ?? "").trim()
      ].filter(Boolean))
    );
    return missionNames.join(", ");
  } catch {
    return "";
  }
}
function missionLabelFromMeta(meta) {
  const names = Array.from(
    new Set([
      ...(meta?.training?.snapshots ?? []).map((snapshot) => String(snapshot?.missionName ?? "").trim()),
      String(meta?.training?.snapshot?.missionName ?? "").trim()
    ].filter(Boolean))
  );
  return names.join(", ");
}
function instructorNameFromMeta(meta) {
  const direct = String(meta?.header?.instructorName ?? "").trim();
  if (direct) return direct;
  const label = String(meta?.header?.instructorUserId ?? "").trim();
  return label;
}
function buildFlightDisplayInfo2(item, csvText, fallback) {
  const blockMinutesMat = typeof item.block_time_minutes === "number" && item.block_time_minutes > 0 ? item.block_time_minutes : null;
  const materializedMinutes = blockMinutesMat ?? (typeof item.total_flight_minutes === "number" && item.total_flight_minutes > 0 ? item.total_flight_minutes : null);
  const fallbackMinutes = materializedMinutes ?? (typeof item.duration_sec === "number" && item.duration_sec > 0 ? Math.round(item.duration_sec / 60) : 0);
  const defaultInfo = {
    flightDateIso: item.flight_date ?? (item.created_at ?? "").slice(0, 10) ?? null,
    startTime: item.start_time ?? "",
    endTime: addMinutesToTime(item.start_time ?? "", fallbackMinutes),
    studentName: fallback?.studentName || "\u2014",
    studentAnac: fallback?.studentAnac || "\u2014",
    instructorName: fallback?.instructorName || "",
    instructorAnac: fallback?.instructorAnac || "",
    aircraft: item.aircraft_ident ?? "\u2014",
    fromTo: item.from_to || "\u2014",
    landings: item.landings ?? 0,
    totalFlight: formatMinutes(fallbackMinutes),
    totalFlightMinutes: fallbackMinutes,
    totalMiles: typeof item.total_miles === "number" ? item.total_miles.toFixed(1) : "0.0",
    telemetryOk: item.telemetry_present ?? false,
    instructorSuggestionMd: item.instructor_suggestion_md ?? "",
    studentSuggestionMd: item.student_suggestion_md ?? "",
    weightBalanceFilled: item.weight_balance_complete ?? false,
    trainingMissionName: missionLabelFromSnapshotJson(item.training_snapshot_json) || "\u2014"
  };
  if (!csvText) return defaultInfo;
  const decoded = decodeFlightRecord2(csvText);
  const meta = decoded.meta;
  if (!meta) {
    return { ...defaultInfo, telemetryOk: decoded.telemetryCsv.trim().length > 0 };
  }
  const airports = [];
  for (const leg of meta.legs) {
    const dep = (leg.dep ?? "").trim().toUpperCase();
    const arr = (leg.arr ?? "").trim().toUpperCase();
    if (dep && airports[airports.length - 1] !== dep) airports.push(dep);
    if (arr && airports[airports.length - 1] !== arr) airports.push(arr);
  }
  const landings = meta.legs.reduce((acc, leg) => acc + Math.max(0, Math.round(leg.landings || 0)), 0);
  const legsSumMinutes = meta.legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime), 0);
  const blockMinutes = flightBlockMinutesFromMeta(meta);
  const totalFlightMinutes = blockMinutes ?? legsSumMinutes;
  const durationMin = typeof item.duration_sec === "number" && item.duration_sec > 0 ? Math.round(item.duration_sec / 60) : totalFlightMinutes;
  const totalMiles = meta.legs.reduce((acc, leg) => acc + parseMiles(leg.distance), 0);
  return {
    flightDateIso: meta.header.date || defaultInfo.flightDateIso,
    startTime: firstLegEngineStart(meta) || meta.header.startTime || meta.header.departureTimeUtc || "",
    endTime: lastLegEngineCut(meta) || addMinutesToTime(meta.header.startTime || meta.header.departureTimeUtc || "", durationMin),
    // Prefer profile-resolved names (nickname-first) over denormalized meta snapshots.
    studentName: fallback?.studentName || meta.header.studentName || meta.header.studentLabel || "\u2014",
    studentAnac: fallback?.studentAnac || meta.header.studentAnac || "\u2014",
    instructorName: fallback?.instructorName || instructorNameFromMeta(meta) || "",
    instructorAnac: fallback?.instructorAnac || meta.header.instructorAnac || "",
    aircraft: meta.header.aircraft || item.aircraft_ident || "\u2014",
    fromTo: airports.length > 0 ? airports.join(" -> ") : "\u2014",
    landings,
    totalFlight: formatMinutes(totalFlightMinutes),
    totalFlightMinutes,
    totalMiles: totalMiles.toFixed(1),
    telemetryOk: decoded.telemetryCsv.trim().length > 0,
    instructorSuggestionMd: meta.preFlight.instructorSuggestionMd ?? "",
    studentSuggestionMd: meta.preFlight.studentSuggestionMd ?? "",
    weightBalanceFilled: Boolean(
      meta.weightBalance && meta.weightBalance.inputs.occupantsWeightKg !== null && meta.weightBalance.inputs.baggageWeightKg !== null && meta.weightBalance.inputs.rampFuel.value !== null && meta.weightBalance.inputs.taxiFuel.value !== null && meta.weightBalance.inputs.tripFuel.value !== null && meta.weightBalance.results.isComplete
    ),
    trainingMissionName: missionLabelFromMeta(meta) || defaultInfo.trainingMissionName || "\u2014"
  };
}

// src/lib/parseGarminCsv.ts
var import_papaparse2 = __toESM(require_papaparse(), 1);

// src/lib/telemetryCharts.ts
var TELEMETRY_SERIES = [
  { key: "gpsAltFt", label: "GPS Alt", patterns: [/^gps\s*altitude/i], color: "#22d3ee" },
  { key: "pressAltFt", label: "Press\xE3o", patterns: [/^pressure\s*altitude/i], color: "#fbbf24" },
  { key: "baroAltFt", label: "Baro", patterns: [/^baro\s*altitude/i], color: "#34d399" },
  { key: "selectedAltFt", label: "Alt sel.", patterns: [/^selected\s*altitude/i], color: "#a78bfa" },
  { key: "vnavAltFt", label: "VNAV alt", patterns: [/^vnav\s*altitude/i], color: "#f472b6" },
  { key: "densityAltFt", label: "Densidade", patterns: [/^density\s*altitude/i], color: "#94a3b8" },
  { key: "heightAglFt", label: "AGL", patterns: [/^height\s*above\s*ground/i], color: "#fb923c" },
  { key: "gsKt", label: "GS GPS", patterns: [/^gps\s*ground\s*speed/i], color: "#a78bfa" },
  { key: "iasKt", label: "IAS", patterns: [/^indicated\s*airspeed/i], color: "#22d3ee" },
  { key: "tasKt", label: "TAS", patterns: [/^true\s*airspeed/i], color: "#34d399" },
  { key: "selectedAsKt", label: "IAS sel.", patterns: [/^selected\s*airspeed/i], color: "#f472b6" },
  { key: "windKt", label: "Vento", patterns: [/^wind\s*speed/i], color: "#64748b" },
  { key: "vertSpeedFpm", label: "VS", patterns: [/^vertical\s*speed/i], color: "#38bdf8" },
  { key: "selectedVsFpm", label: "VS sel.", patterns: [/^selected\s*vertical\s*speed/i], color: "#c084fc" },
  { key: "apVsFpm", label: "AP VS", patterns: [/^ap\s*vs\s*command/i], color: "#fbbf24" },
  { key: "pitchDeg", label: "Pitch", patterns: [/^pitch\s*\(/i, /^pitch$/i], color: "#22d3ee" },
  { key: "rollDeg", label: "Roll", patterns: [/^roll\s*\(/i, /^roll$/i], color: "#a78bfa" },
  { key: "pitchDeltaDeg", label: "\u0394 pitch", patterns: [/^pitch\s*delta/i], color: "#94a3b8" },
  { key: "rollDeltaDeg", label: "\u0394 roll", patterns: [/^roll\s*delta/i], color: "#64748b" },
  { key: "latG", label: "Lat G", patterns: [/^lateral\s*acceleration/i], color: "#f87171" },
  { key: "normG", label: "Normal G", patterns: [/^normal\s*acceleration/i], color: "#fbbf24" },
  { key: "hdgMag", label: "Hdg mag", patterns: [/^magnetic\s*heading/i], color: "#22d3ee" },
  { key: "hdgSelDeg", label: "Hdg sel.", patterns: [/^selected\s*heading/i], color: "#a78bfa" },
  { key: "trackDeg", label: "Track GPS", patterns: [/^gps\s*ground\s*track/i], color: "#34d399" },
  { key: "windDirDeg", label: "Vento \xB0", patterns: [/^wind\s*direction/i], color: "#64748b" },
  { key: "navDistNm", label: "Nav DME", patterns: [/^nav\s*distance/i], color: "#22d3ee" },
  { key: "navBrgDeg", label: "Nav QDM", patterns: [/^nav\s*bearing/i], color: "#a78bfa" },
  { key: "navCrsDeg", label: "Nav curso", patterns: [/^nav\s*course/i], color: "#34d399" },
  { key: "navXtkNm", label: "XTK", patterns: [/^nav\s*cross\s*track/i], color: "#f87171" },
  { key: "rpm", label: "RPM", patterns: [/^rpm$/i], color: "#22d3ee" },
  { key: "mapInHg", label: "MAP", patterns: [/^manifold\s*press/i], color: "#fbbf24" },
  { key: "oilPsi", label: "\xD3leo PSI", patterns: [/^oil\s*press/i], color: "#34d399" },
  { key: "oilTempF", label: "\xD3leo \xB0F", patterns: [/^oil\s*temp/i], color: "#fb923c" },
  { key: "fuelFlowGph", label: "FF", patterns: [/^fuel\s*flow/i], color: "#a78bfa" },
  { key: "fuelPressPsi", label: "Comb. PSI", patterns: [/^fuel\s*press/i], color: "#f472b6" },
  { key: "fuelL", label: "Comb. L", patterns: [/^fuel\s*qty\s*l/i], color: "#64748b" },
  { key: "fuelR", label: "Comb. R", patterns: [/^fuel\s*qty\s*r/i], color: "#94a3b8" },
  { key: "cht1F", label: "CHT1", patterns: [/^cht1/i], color: "#ef4444" },
  { key: "cht2F", label: "CHT2", patterns: [/^cht2/i], color: "#f97316" },
  { key: "egt1F", label: "EGT1", patterns: [/^egt1/i], color: "#dc2626" },
  { key: "egt2F", label: "EGT2", patterns: [/^egt2/i], color: "#ea580c" },
  { key: "oatC", label: "OAT", patterns: [/^outside\s*air\s*temp/i], color: "#38bdf8" },
  { key: "velEMps", label: "Vel E", patterns: [/^gps\s*velocity\s*e/i], color: "#64748b" },
  { key: "velNMps", label: "Vel N", patterns: [/^gps\s*velocity\s*n/i], color: "#94a3b8" },
  { key: "velUMps", label: "Vel U", patterns: [/^gps\s*velocity\s*u/i], color: "#cbd5e1" },
  { key: "flapsPos", label: "Flaps", patterns: [/^flap\s*(position)?$/i], color: "#f59e0b" },
  { key: "aoa", label: "AOA", patterns: [/^aoa$/i], color: "#22d3ee" },
  { key: "aoaCp", label: "AOA Cp", patterns: [/^aoa\s*cp/i], color: "#0ea5e9" },
  { key: "fdPitchCmd", label: "FD pitch", patterns: [/^fd\s*pitch\s*command/i], color: "#fbbf24" },
  { key: "fdRollCmd", label: "FD roll", patterns: [/^fd\s*roll\s*command/i], color: "#a78bfa" },
  { key: "apPitchCmd", label: "AP pitch", patterns: [/^ap\s*pitch\s*command/i], color: "#34d399" },
  { key: "apRollCmd", label: "AP roll", patterns: [/^ap\s*roll\s*command/i], color: "#f472b6" }
];
var TELEMETRY_PANELS = [
  { id: "alt", title: "Altitude", yUnit: "ft", seriesKeys: ["gpsAltFt", "pressAltFt", "baroAltFt", "selectedAltFt", "vnavAltFt", "densityAltFt", "heightAglFt"] },
  { id: "spd", title: "Velocidade", yUnit: "kt", seriesKeys: ["gsKt", "iasKt", "tasKt", "selectedAsKt"] },
  { id: "vs", title: "Velocidade vertical", yUnit: "ft/min", seriesKeys: ["vertSpeedFpm", "selectedVsFpm", "apVsFpm"] },
  { id: "att", title: "Atitude", yUnit: "\xB0", seriesKeys: ["pitchDeg", "rollDeg", "pitchDeltaDeg", "rollDeltaDeg"] },
  { id: "g", title: "Acelera\xE7\xE3o", yUnit: "G", seriesKeys: ["latG", "normG"] },
  { id: "hdg", title: "Rumo e track", yUnit: "\xB0", seriesKeys: ["hdgMag", "hdgSelDeg", "trackDeg"] },
  { id: "wind", title: "Vento", yUnit: "\xB0 / kt", seriesKeys: ["windDirDeg", "windKt"] },
  { id: "navDist", title: "Navega\xE7\xE3o \u2014 dist\xE2ncia", yUnit: "nm", seriesKeys: ["navDistNm", "navXtkNm"] },
  { id: "navAng", title: "Navega\xE7\xE3o \u2014 \xE2ngulos", yUnit: "\xB0", seriesKeys: ["navBrgDeg", "navCrsDeg"] },
  { id: "eng", title: "Motor \u2014 pot\xEAncia / fluxo", yUnit: "rpm \xB7 inHg \xB7 gph", seriesKeys: ["rpm", "mapInHg", "fuelFlowGph"] },
  { id: "engPress", title: "Motor \u2014 \xF3leo / combust\xEDvel", yUnit: "PSI \xB7 \xB0F", seriesKeys: ["oilPsi", "oilTempF", "fuelPressPsi"] },
  { id: "engFuelQty", title: "Combust\xEDvel (tanques)", yUnit: "gal", seriesKeys: ["fuelL", "fuelR"] },
  { id: "cht", title: "CHT / EGT", yUnit: "\xB0F", seriesKeys: ["cht1F", "cht2F", "egt1F", "egt2F"] },
  { id: "gpsv", title: "Velocidade GPS (E/N/U)", yUnit: "m/s", seriesKeys: ["velEMps", "velNMps", "velUMps"] },
  { id: "fdap", title: "FD / AP (comandos)", yUnit: "\xB0", seriesKeys: ["fdPitchCmd", "fdRollCmd", "apPitchCmd", "apRollCmd"] },
  { id: "misc", title: "Temperatura / AOA", yUnit: "\xB0C", seriesKeys: ["oatC", "aoa", "aoaCp"] },
  { id: "flaps", title: "Flaps", yUnit: "pos", seriesKeys: ["flapsPos"] }
];
function panelHasData(panel, data, resolved) {
  const keys = panel.seriesKeys.filter((k) => resolved.has(k));
  if (keys.length === 0) return false;
  return data.some((row) => keys.some((k) => row[k] !== null && row[k] !== void 0));
}

// src/lib/parseGarminCsv.ts
function normHeader2(raw) {
  return raw.trim().toLowerCase().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
}
function findColumn2(headers, patterns) {
  const byNorm = headers.map((h) => ({ raw: h, n: normHeader2(h) }));
  for (const { raw, n } of byNorm) {
    for (const re of patterns) {
      if (re.test(n)) return raw;
    }
  }
  return void 0;
}
function findLocalTimeColumn2(headers) {
  for (const h of headers) {
    const n = normHeader2(h);
    if (/^utc/.test(n)) continue;
    if (/^time\s*\(/.test(n) || n === "time") return h;
  }
  return findColumn2(headers, [/^lcl\s*time$/i, /^local\s*time$/i]);
}
function findUtcTimeColumn2(headers) {
  for (const h of headers) {
    const n = normHeader2(h);
    if (/^utc\s*time/.test(n)) return h;
  }
  return void 0;
}
function findDateColumn2(headers) {
  return findColumn2(headers, [/^date\s*\(yyyy/i, /^lcl\s*date\b/i, /^local\s*date\b/i, /^utc\s*date\b/i]) ?? findColumn2(headers, [/^date$/i]);
}
function resolveTelemetryColumns(headers) {
  const used = /* @__PURE__ */ new Set();
  const map = /* @__PURE__ */ new Map();
  const byNorm = headers.map((h) => ({ raw: h, n: normHeader2(h) }));
  for (const def of TELEMETRY_SERIES) {
    for (const { raw, n } of byNorm) {
      if (used.has(raw)) continue;
      if (def.patterns.some((re) => re.test(n))) {
        map.set(def.key, raw);
        used.add(raw);
        break;
      }
    }
  }
  return map;
}
function parseNumberCell2(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim();
  if (!s) return null;
  const cleaned = s.replace(/"/g, "").replace(/\s/g, "").replace(/^\+\-(?=\d)/, "-").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function guessAltIsFeet(colName, samples) {
  const n = normHeader2(colName);
  if (/ft|feet|pés|pés?/.test(n)) return true;
  if (/m|meter|metros?/.test(n) && !/min|max|tim/.test(n)) return false;
  if (samples.length >= 5) {
    const max = Math.max(...samples.map(Math.abs));
    if (max > 800 && max < 6e4) return true;
  }
  return false;
}
function parseSpeedToMs(value, colName) {
  const n = normHeader2(colName);
  if (/kt|kts|knot/.test(n)) return value * 0.514444;
  if (/mph/.test(n)) return value * 0.44704;
  if (/km\/h|kmph|kmh/.test(n)) return value / 3.6;
  if (/m\/s|mps/.test(n)) return value;
  if (value > 60 && value < 500) return value * 0.514444;
  return value;
}
function normalizeHeading(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = (value % 360 + 360) % 360;
  return Number.isFinite(normalized) ? normalized : null;
}
function parseTimeToMs2(value, colName) {
  const n = normHeader2(colName);
  const s = String(value ?? "").trim();
  if (!s) return null;
  const num = parseNumberCell2(value);
  if (num !== null && !s.includes(":") && !s.includes("-") && !s.includes("/")) {
    if (/sec|elapsed|time\s*\(s\)/.test(n)) return num * 1e3;
    if (num > 1e12) return num;
    if (num > 1e9 && num < 1e12) return num * 1e3;
    if (num > 1e5 && num < 1e9) return num * 1e3;
  }
  const d = Date.parse(s);
  if (!Number.isNaN(d)) return d;
  const m = s.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3]);
    if ([h, min, sec].every((x) => Number.isFinite(x))) {
      return ((h * 60 + min) * 60 + sec) * 1e3;
    }
  }
  return null;
}
function parseLocalDateAndTime2(dateVal, timeVal) {
  const dateStr = String(dateVal ?? "").trim();
  const timeStr = String(timeVal ?? "").trim();
  if (!dateStr || !timeStr) return null;
  const iso = `${dateStr}T${timeStr}`;
  let ms = Date.parse(iso);
  if (!Number.isNaN(ms)) return ms;
  ms = Date.parse(`${dateStr} ${timeStr}`);
  if (!Number.isNaN(ms)) return ms;
  const tm = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!tm) return null;
  const dayMs = Date.parse(`${dateStr}T00:00:00`);
  if (Number.isNaN(dayMs)) return null;
  const h = Number(tm[1]);
  const mi = Number(tm[2]);
  const s = Number(tm[3]);
  const frac = tm[4] ? Number(`0.${tm[4]}`) : 0;
  if (![h, mi, s].every((x) => Number.isFinite(x))) return null;
  return dayMs + ((h * 60 + mi) * 60 + s + frac) * 1e3;
}
function fillMissingInstants(instants) {
  const n = instants.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    if (instants[i] != null) {
      out[i] = instants[i];
      continue;
    }
    let p = i - 1;
    while (p >= 0 && instants[p] == null) p--;
    let q = i + 1;
    while (q < n && instants[q] == null) q++;
    if (p >= 0 && q < n) {
      const frac = (i - p) / (q - p);
      out[i] = instants[p] + (instants[q] - instants[p]) * frac;
    } else if (p >= 0) {
      out[i] = instants[p] + (i - p) * 1e3;
    } else if (q < n) {
      out[i] = instants[q] - (q - i) * 1e3;
    } else {
      out[i] = i * 1e3;
    }
  }
  return out;
}
function parseRowInstant2(row, dateForInstant, timeForInstant, colLclDate, colLclTime, colTime) {
  if (dateForInstant && timeForInstant) {
    return parseLocalDateAndTime2(row[dateForInstant], row[timeForInstant]);
  }
  if (colLclDate && colLclTime) {
    return parseLocalDateAndTime2(row[colLclDate], row[colLclTime]);
  }
  if (colTime) {
    return parseTimeToMs2(row[colTime], colTime);
  }
  return null;
}
function isRepeatedHeaderRow(row, cols) {
  const norm = (v) => normHeader2(String(v ?? ""));
  const lat = cols.colLat ? norm(row[cols.colLat]) : "";
  const lon = cols.colLon ? norm(row[cols.colLon]) : "";
  const d = cols.dateForInstant ? norm(row[cols.dateForInstant]) : "";
  const t = cols.timeForInstant ? norm(row[cols.timeForInstant]) : "";
  const latLike = /^(lat|latitude)\b/.test(lat);
  const lonLike = /^(lon|lng|longitude)\b/.test(lon);
  const dateLike = /\bdate\b/.test(d);
  const timeLike = /\btime\b/.test(t);
  return latLike && lonLike && (dateLike || timeLike);
}
function buildChartTimeAxis(instants, metaLines) {
  const n = instants.length;
  if (n === 0) return { xs: [], hasChartTime: false, chartTimeBaseMs: null, wallClockMs: null };
  const validN = instants.filter((t) => t != null).length;
  if (validN === 0) {
    metaLines.push("Gr\xE1ficos: eixo X = amostra # (nenhuma data/hora v\xE1lida nas linhas).");
    return {
      xs: Array.from({ length: n }, (_, i) => i),
      hasChartTime: false,
      chartTimeBaseMs: null,
      wallClockMs: null
    };
  }
  let filled;
  if (validN < n) {
    filled = fillMissingInstants(instants);
    metaLines.push(
      "Gr\xE1ficos: algumas linhas sem data/hora completa \u2014 instantes interpolados para manter o eixo do tempo cont\xEDnuo."
    );
  } else {
    filled = instants.map((t) => t);
  }
  const t0 = Math.min(...filled);
  const xs = filled.map((t) => t - t0);
  const u = new Set(xs).size;
  const span = Math.max(...xs) - Math.min(...xs);
  if (u < 2 || span === 0) {
    metaLines.push(
      "Gr\xE1ficos: eixo X = amostra # (todos os instantes coincidem ou o arquivo n\xE3o varia o rel\xF3gio entre linhas)."
    );
    return {
      xs: Array.from({ length: n }, (_, i) => i),
      hasChartTime: false,
      chartTimeBaseMs: null,
      wallClockMs: null
    };
  }
  return { xs, hasChartTime: true, chartTimeBaseMs: t0, wallClockMs: filled };
}
function clipToDataHeader2(text) {
  const lines = text.split(/\r?\n/);
  const tryLine = (i, strict) => {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(",")) return false;
    if (trimmed.startsWith("#")) return false;
    const cells = import_papaparse2.default.parse(line, { delimiter: ",", quoteChar: '"', header: false });
    const row = cells.data[0] ?? [];
    const joined = row.join(",").toLowerCase();
    if (strict) {
      return /lcl\s*date/i.test(joined) || /date/i.test(joined) && /latitude/i.test(joined) && /longitude/i.test(joined) || /latitude/i.test(joined) && /longitude/i.test(joined) || /utc\s*date/i.test(joined) && /utc\s*time/i.test(joined);
    }
    return true;
  };
  for (let i = 0; i < lines.length; i++) {
    if (tryLine(i, true)) {
      return { csv: lines.slice(i).join("\n"), headerLineIndex: i };
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (tryLine(i, false)) {
      return { csv: lines.slice(i).join("\n"), headerLineIndex: i };
    }
  }
  return { csv: text.replace(/^\uFEFF/, ""), headerLineIndex: 0 };
}
function extractAircraftIdent(text) {
  const lines = text.split(/\r?\n/).slice(0, 30);
  for (const line of lines) {
    const m = line.match(/aircraft[_\s]ident[^,=]*[,=]\s*([A-Z0-9\-]+)/i) ?? line.match(/acft[_\s]?id[^,=]*[,=]\s*([A-Z0-9\-]+)/i);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}
function parseGarminCsv2(text) {
  const warnings = [];
  const metaLines = [];
  const aircraftIdent = extractAircraftIdent(text);
  const normalized = text.replace(/^\uFEFF/, "");
  const { csv: clipped } = clipToDataHeader2(normalized);
  const parsed = import_papaparse2.default.parse(clipped, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (h) => h.trim()
  });
  if (parsed.errors.length) {
    const msg = parsed.errors.slice(0, 3).map((e) => e.message).join("; ");
    warnings.push(`Avisos do parser CSV: ${msg}`);
  }
  const rawRows = parsed.data.filter((r) => Object.keys(r).some((k) => String(r[k] ?? "").trim() !== ""));
  if (rawRows.length === 0) {
    warnings.push("Nenhuma linha de dados encontrada ap\xF3s o cabe\xE7alho.");
    return {
      points: [],
      chartData: [],
      hasChartTime: false,
      chartTimeBaseMs: null,
      telemetryColumns: {},
      warnings,
      metaLines,
      aircraftIdent
    };
  }
  const headers = Object.keys(rawRows[0]);
  const colLat = findColumn2(headers, [/^latitude/i, /^lat\s*\(/i]) ?? findColumn2(headers, [/^lat(itude)?$/, /^position\s*lat/, /^gps\s*lat/, /^(nm|deg)\s*lat/, /^lat$/i]);
  const colLon = findColumn2(headers, [/^longitude/i, /^lon\s*\(/i]) ?? findColumn2(headers, [/^lon(g(itude)?)?$/, /^position\s*(lon|long)/, /^gps\s*(lon|long)/, /^(nm|deg)\s*(lon|long)/, /^lon$/i, /lng$/i]);
  const colGpsAlt = findColumn2(headers, [/^gps\s*altitude/i]);
  const colBaroAlt = findColumn2(headers, [/^baro\s*altitude/i]);
  const colPressAlt = findColumn2(headers, [/^pressure\s*altitude/i]);
  const colAlt = colGpsAlt ?? colBaroAlt ?? colPressAlt ?? findColumn2(headers, [/alt(itude)?/, /^elev(ation)?$/, /^height$/]);
  const colGpsSpd = findColumn2(headers, [/^gps\s*ground\s*speed/i]);
  const colSpd = colGpsSpd ?? findColumn2(headers, [/ground\s*speed/, /grnd\s*spd/, /gnd\s*spd/, /^speed$/, /velocity/]);
  const colDate = findDateColumn2(headers);
  const colLocalTime = findLocalTimeColumn2(headers);
  const colUtcTime = findUtcTimeColumn2(headers);
  const colLclDate = findColumn2(headers, [/^lcl\s*date\b/i, /^local\s*date\b/i]) ?? findColumn2(headers, [/^utc\s*date\b/i]);
  const colLclTime = findColumn2(headers, [/^lcl\s*time\b/i, /^local\s*time\b/i]) ?? findColumn2(headers, [/^utc\s*time\b/i]);
  const colTime = findColumn2(headers, [/^timestamp$/, /^time$/, /date\s*&\s*time/, /^datetime$/, /^elapsed/]);
  const dateForInstant = colDate ?? colLclDate;
  const timeForInstant = colLocalTime ?? colLclTime ?? colUtcTime;
  const rows = rawRows.filter(
    (row) => !isRepeatedHeaderRow(row, {
      colLat,
      colLon,
      dateForInstant,
      timeForInstant
    })
  );
  const telemetryResolved = resolveTelemetryColumns(headers);
  const telemetryColumns = Object.fromEntries(telemetryResolved);
  if (colLat) metaLines.push(`Latitude: \u201C${colLat}\u201D`);
  if (colLon) metaLines.push(`Longitude: \u201C${colLon}\u201D`);
  if (colAlt) metaLines.push(`Altitude (mapa/resumo): \u201C${colAlt}\u201D`);
  if (colSpd) metaLines.push(`Velocidade solo: \u201C${colSpd}\u201D`);
  if (dateForInstant && timeForInstant) {
    metaLines.push(`Instante: \u201C${dateForInstant}\u201D + \u201C${timeForInstant}\u201D`);
  } else if (colTime) {
    metaLines.push(`Tempo: \u201C${colTime}\u201D`);
  }
  const seriesCount = telemetryResolved.size;
  if (seriesCount > 0) {
    metaLines.push(`Telemetria: ${seriesCount} s\xE9rie(s) mapeada(s) a partir das colunas do arquivo.`);
  }
  if (!colLat || !colLon) {
    warnings.push(
      "N\xE3o encontrei colunas claras de latitude/longitude. Confira se o CSV tem cabe\xE7alhos (linha 1) com nomes como Latitude/Longitude."
    );
    return {
      points: [],
      chartData: [],
      hasChartTime: false,
      chartTimeBaseMs: null,
      telemetryColumns,
      warnings,
      metaLines,
      aircraftIdent
    };
  }
  const altSamples = [];
  if (colAlt) {
    for (let i = 0; i < Math.min(40, rows.length); i++) {
      const v = parseNumberCell2(rows[i][colAlt]);
      if (v !== null) altSamples.push(v);
    }
  }
  const altFeet = colAlt ? guessAltIsFeet(colAlt, altSamples) : false;
  const instants = rows.map(
    (row) => parseRowInstant2(row, dateForInstant, timeForInstant, colLclDate, colLclTime, colTime)
  );
  const { xs, hasChartTime, chartTimeBaseMs, wallClockMs } = buildChartTimeAxis(instants, metaLines);
  const points = [];
  const chartData = [];
  rows.forEach((row, idx) => {
    const rowChart = { x: xs[idx] ?? idx };
    for (const [key, csvCol] of telemetryResolved) {
      rowChart[key] = parseNumberCell2(row[csvCol]);
    }
    chartData.push(rowChart);
    const lat = parseNumberCell2(row[colLat]);
    const lon = parseNumberCell2(row[colLon]);
    if (lat === null || lon === null) return;
    if (lat === 0 && lon === 0) return;
    let altM = null;
    if (colAlt) {
      const a = parseNumberCell2(row[colAlt]);
      if (a !== null) altM = altFeet ? a * 0.3048 : a;
    }
    let speedMs = null;
    if (colSpd) {
      const s = parseNumberCell2(row[colSpd]);
      if (s !== null) speedMs = parseSpeedToMs(s, colSpd);
    }
    const tRaw = instants[idx] ?? null;
    const t = tRaw ?? wallClockMs?.[idx] ?? null;
    const trackDeg = normalizeHeading(rowChart.trackDeg);
    const hdgMag = normalizeHeading(rowChart.hdgMag);
    points.push({ lat, lon, headingDeg: trackDeg ?? hdgMag, altM, speedMs, t });
  });
  if (points.length < 2) {
    warnings.push("Poucos pontos GPS v\xE1lidos. Verifique separadores (; vs ,) e formato num\xE9rico.");
  }
  if (telemetryResolved.size > 0) {
    const activePanels = TELEMETRY_PANELS.filter((p) => panelHasData(p, chartData, telemetryResolved));
    if (activePanels.length === 0) {
      warnings.push("H\xE1 colunas de telemetria reconhecidas, mas os valores parecem vazios ou inv\xE1lidos.");
    }
  }
  if (colAlt && altFeet) metaLines.push("Altitude interpretada como p\xE9s \u2192 convertida para metros nas estat\xEDsticas.");
  else if (colAlt) metaLines.push("Altitude interpretada em metros (ajuste manual se estiver incorreto).");
  return { points, chartData, hasChartTime, chartTimeBaseMs, telemetryColumns, warnings, metaLines, aircraftIdent };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildFlightDisplayInfo,
  buildFlightShareStickers,
  buildRouteMap,
  chartDurationSec,
  decodeFlightRecord,
  formatDuration,
  parseGarminCsv,
  summarizeFlight
});
