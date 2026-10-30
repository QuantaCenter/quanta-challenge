/** 预览控制台 postMessage 信道 */
export const PREVIEW_CONSOLE_CHANNEL = '__qc_preview_console__';

export type PreviewConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

/** 经结构化克隆传递的控制台值 */
export type PreviewConsoleValue =
   | { t: 'undefined' | 'null' | 'circular' }
   | {
        t:
           | 'string'
           | 'number'
           | 'boolean'
           | 'bigint'
           | 'symbol'
           | 'date'
           | 'regexp'
           | 'node';
        v: string;
     }
   | { t: 'function'; name: string; v: string }
   | { t: 'error'; name: string; message: string; stack: string }
   | {
        t: 'object' | 'array' | 'map' | 'set';
        name: string;
        size?: number;
        /** 达最大深度时为 null */
        entries: [string, PreviewConsoleValue][] | null;
        more: boolean;
     };

export type PreviewConsoleOutgoing =
   | { type: 'ready'; href: string }
   | { type: 'clear' }
   | {
        type: 'log';
        level: PreviewConsoleLevel;
        args: PreviewConsoleValue[];
        stack?: string;
     }
   | { type: 'result'; id: number; error: boolean; value: PreviewConsoleValue };

export type PreviewConsoleIncoming = { type: 'eval'; id: number; code: string };

export interface IPreviewConsoleEnvelope<T> {
   channel: typeof PREVIEW_CONSOLE_CHANNEL;
   payload: T;
}

/** `setPreviewScript` 注入的 ES5 桥接脚本 */
export const buildPreviewConsoleScript = (parentOrigin: string) => `
(function () {
   if (window.parent === window || window.__QC_PREVIEW_CONSOLE__) return;
   window.__QC_PREVIEW_CONSOLE__ = true;

   var CHANNEL = ${JSON.stringify(PREVIEW_CONSOLE_CHANNEL)};
   var PARENT_ORIGIN = ${JSON.stringify(parentOrigin)};
   if (PARENT_ORIGIN === '__PARENT_WINDOW__') PARENT_ORIGIN = '*';
   var MAX_DEPTH = 3;
   var MAX_ENTRIES = 100;
   var MAX_STRING = 10000;
   var nativeConsole = {};

   var post = function (payload) {
      try {
         window.parent.postMessage({ channel: CHANNEL, payload: payload }, PARENT_ORIGIN);
      } catch (e) {}
   };

   var tagOf = function (v) { return Object.prototype.toString.call(v); };
   var cut = function (s) { return s.length > MAX_STRING ? s.slice(0, MAX_STRING) + '…' : s; };
   var ctorName = function (v) {
      try {
         var proto = Object.getPrototypeOf(v);
         if (proto === null) return 'Object';
         return (proto.constructor && proto.constructor.name) || 'Object';
      } catch (e) {
         return 'Object';
      }
   };
   var describeNode = function (node) {
      if (node.nodeType === 1) {
         var html = '<' + node.tagName.toLowerCase();
         for (var i = 0; i < node.attributes.length && i < 10; i++) {
            var attr = node.attributes[i];
            html += ' ' + attr.name + '="' + attr.value + '"';
         }
         return cut(html + '>');
      }
      if (node.nodeType === 3) return '#text ' + JSON.stringify(cut(node.textContent || ''));
      if (node.nodeType === 9) return '#document';
      return node.nodeName;
   };
   var keyText = function (k) {
      if (typeof k === 'string') return JSON.stringify(k);
      if (k === null || (typeof k !== 'object' && typeof k !== 'function')) return String(k);
      return ctorName(k);
   };

   var serialize = function (value, depth, seen) {
      var type = typeof value;
      if (value === null) return { t: 'null' };
      if (type === 'undefined') return { t: 'undefined' };
      if (type === 'string') return { t: 'string', v: cut(value) };
      if (type === 'number') return { t: 'number', v: Object.is(value, -0) ? '-0' : String(value) };
      if (type === 'boolean') return { t: 'boolean', v: String(value) };
      if (type === 'bigint') return { t: 'bigint', v: String(value) + 'n' };
      if (type === 'symbol') return { t: 'symbol', v: value.toString() };
      if (type === 'function') {
         var src = '';
         try { src = Function.prototype.toString.call(value); } catch (e) {}
         return { t: 'function', name: value.name || '', v: cut(src) };
      }
      try {
         var tag = tagOf(value);
         if (tag === '[object Error]' || value instanceof Error) {
            return {
               t: 'error',
               name: String(value.name || 'Error'),
               message: String(value.message || ''),
               stack: value.stack ? String(value.stack) : ''
            };
         }
         if (typeof Node !== 'undefined' && value instanceof Node) return { t: 'node', v: describeNode(value) };
         if (tag === '[object Date]') return { t: 'date', v: isNaN(value.getTime()) ? 'Invalid Date' : value.toString() };
         if (tag === '[object RegExp]') return { t: 'regexp', v: String(value) };
         if (seen.indexOf(value) !== -1) return { t: 'circular' };

         var isMap = tag === '[object Map]';
         var isSet = tag === '[object Set]';
         var isArray = Array.isArray(value) || (ArrayBuffer.isView(value) && tag !== '[object DataView]');
         var kind = isMap ? 'map' : isSet ? 'set' : isArray ? 'array' : 'object';
         var size = isMap || isSet ? value.size : isArray ? value.length : undefined;
         var result = { t: kind, name: ctorName(value), size: size, entries: null, more: false };
         if (depth >= MAX_DEPTH) return result;

         var next = seen.concat([value]);
         var entries = [];
         var push = function (k, v) {
            if (entries.length >= MAX_ENTRIES) { result.more = true; return false; }
            entries.push([k, serialize(v, depth + 1, next)]);
            return true;
         };
         if (isMap) {
            value.forEach(function (v, k) { push(keyText(k), v); });
         } else if (isSet) {
            var i = 0;
            value.forEach(function (v) { push(String(i++), v); });
         } else {
            var keys = Object.keys(value);
            for (var j = 0; j < keys.length; j++) {
               var v;
               try { v = value[keys[j]]; } catch (e) { v = e; }
               if (!push(keys[j], v)) break;
            }
         }
         result.entries = entries;
         return result;
      } catch (e) {
         return { t: 'string', v: '[无法序列化的值]' };
      }
   };

   var briefText = function (v) {
      if (typeof v === 'string') return v;
      try {
         var json = JSON.stringify(v);
         return json === undefined ? String(v) : json;
      } catch (e) {
         return String(v);
      }
   };

   var formatArgs = function (list) {
      var args = Array.prototype.slice.call(list);
      if (typeof args[0] === 'string' && args[0].indexOf('%') !== -1 && args.length > 1) {
         var rest = args.slice(1);
         var text = args[0].replace(/%([sdifoOc%])/g, function (match, flag) {
            if (flag === '%') return '%';
            if (!rest.length) return match;
            var arg = rest.shift();
            try {
               if (flag === 's') return String(arg);
               if (flag === 'd' || flag === 'i') return String(parseInt(arg, 10));
               if (flag === 'f') return String(parseFloat(arg));
               if (flag === 'c') return '';
               return briefText(arg);
            } catch (e) {
               return match;
            }
         });
         args = [text].concat(rest);
      }
      return args.map(function (arg) { return serialize(arg, 0, []); });
   };

   var send = function (level, args, stack) {
      try {
         post({ type: 'log', level: level, args: formatArgs(args), stack: stack });
      } catch (e) {}
   };

   var wrap = function (method, handler) {
      var original = console[method];
      if (typeof original !== 'function') return;
      nativeConsole[method] = original;
      console[method] = function () {
         try { handler.apply(null, arguments); } catch (e) {}
         return original.apply(this, arguments);
      };
   };

   wrap('log', function () { send('log', arguments); });
   wrap('info', function () { send('info', arguments); });
   wrap('warn', function () { send('warn', arguments); });
   wrap('error', function () { send('error', arguments); });
   wrap('debug', function () { send('debug', arguments); });
   wrap('dir', function () { send('log', arguments); });
   wrap('dirxml', function () { send('log', arguments); });
   wrap('table', function () { send('log', arguments); });
   wrap('trace', function () {
      var stack = (new Error().stack || '').split('\\n').slice(2).join('\\n');
      send('log', arguments.length ? arguments : ['console.trace'], stack);
   });
   wrap('assert', function (condition) {
      if (condition) return;
      var rest = Array.prototype.slice.call(arguments, 1);
      send('error', ['Assertion failed:'].concat(rest.length ? rest : ['console.assert']));
   });
   wrap('clear', function () { post({ type: 'clear' }); });

   var counters = {};
   wrap('count', function (label) {
      label = label === undefined ? 'default' : String(label);
      counters[label] = (counters[label] || 0) + 1;
      send('info', [label + ': ' + counters[label]]);
   });
   wrap('countReset', function (label) {
      counters[label === undefined ? 'default' : String(label)] = 0;
   });
   var timers = {};
   var now = function () { return typeof performance !== 'undefined' ? performance.now() : Date.now(); };
   wrap('time', function (label) {
      timers[label === undefined ? 'default' : String(label)] = now();
   });
   var reportTimer = function (label, remove, extra) {
      label = label === undefined ? 'default' : String(label);
      if (!(label in timers)) {
         send('warn', ["Timer '" + label + "' does not exist"]);
         return;
      }
      var ms = now() - timers[label];
      if (remove) delete timers[label];
      send('info', [label + ': ' + ms.toFixed(3) + ' ms'].concat(extra || []));
   };
   wrap('timeEnd', function (label) { reportTimer(label, true); });
   wrap('timeLog', function (label) { reportTimer(label, false, Array.prototype.slice.call(arguments, 1)); });

   window.addEventListener('error', function (event) {
      var target = event.target;
      if (target && target !== window && target.tagName) {
         var url = target.src || target.href || target.currentSrc || '';
         send('error', ['Failed to load resource: <' + target.tagName.toLowerCase() + '> ' + url]);
         return;
      }
      var detail = event.error !== undefined && event.error !== null ? event.error : event.message;
      send('error', ['Uncaught', detail]);
   }, true);

   window.addEventListener('unhandledrejection', function (event) {
      send('error', ['Uncaught (in promise)', event.reason]);
   });

   var indirectEval = eval;
   var evaluate = function (code) {
      if (/^\\s*\\{/.test(code) && /\\}\\s*$/.test(code)) {
         try {
            return indirectEval('(' + code + '\\n)');
         } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
         }
      }
      return indirectEval(code);
   };

   window.addEventListener('message', function (event) {
      if (event.source !== window.parent) return;
      if (PARENT_ORIGIN === '*') PARENT_ORIGIN = event.origin;
      if (event.origin !== PARENT_ORIGIN) return;
      var data = event.data;
      if (!data || data.channel !== CHANNEL || !data.payload) return;
      var message = data.payload;
      if (message.type !== 'eval' || typeof message.code !== 'string') return;
      try {
         var value = evaluate(message.code);
         window.$_ = value;
         post({ type: 'result', id: message.id, error: false, value: serialize(value, 0, []) });
      } catch (error) {
         post({ type: 'result', id: message.id, error: true, value: serialize(error, 0, []) });
      }
   });

   post({ type: 'ready', href: location.href });
})();
`;
