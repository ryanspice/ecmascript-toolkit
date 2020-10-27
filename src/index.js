/* requestNextAnimationFrame */
// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
// http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating
// requestAnimationFrame polyfill by Erik Möller
// fixes from Paul Irish and Tino Zijdel
(function () {
  var lastTime = 0;
  var vendors = ["ms", "moz", "webkit", "o"];
  for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x] + "RequestAnimationFrame"];
    window.cancelAnimationFrame =
      window[vendors[x] + "CancelAnimationFrame"] ||
      window[vendors[x] + "CancelRequestAnimationFrame"];
  }

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function (callback, element) {
      var currTime = new Date().getTime();
      var timeToCall = Math.max(0, 16 - (currTime - lastTime));
      var id = window.setTimeout(function () {
        callback(currTime + timeToCall);
      }, timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    };
  }

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function (id) {
      clearTimeout(id);
    };
  }
})();
(function () {
  var ids = {};

  function requestId() {
    var id;
    do {
      id = Math.floor(Math.random() * 1e9);
    } while (id in ids);
    return id;
  }

  if (!window.requestNextAnimationFrame) {
    window.requestNextAnimationFrame = function (callback, element) {
      var id = requestId();

      ids[id] = requestAnimationFrame(function () {
        ids[id] = requestAnimationFrame(function (ts) {
          delete ids[id];
          callback(ts);
        }, element);
      }, element);

      return id;
    };
  }

  if (!window.cancelNextAnimationFrame) {
    window.cancelNextAnimationFrame = function (id) {
      if (ids[id]) {
        cancelAnimationFrame(ids[id]);
        delete ids[id];
      }
    };
  }
})();
/* WeakSet */
(function () {
  window.WeakSet = b;
  var c = Date.now() % 1e9;
  function b(a) {
    this.name = "__st" + ((1e9 * Math.random()) >>> 0) + (c++ + "__");
    a && a.forEach && a.forEach(this.add, this);
  }
  var e = b.prototype;
  e.add = function (a) {
    var d = this.name;
    a[d] || Object.defineProperty(a, d, { value: !0, writable: !0 });
    return this;
  };
  e["delete"] = function (a) {
    if (!a[this.name]) return !1;
    a[this.name] = void 0;
    return !0;
  };
  e.has = function (a) {
    return !!a[this.name];
  };
})();

/**
 * EcmaToolkit - designed to be an entry point for webpack configs
 */

//import css from "./index.scss";
const _package_ = pkg;
const _default_font_ = "https://fonts.googleapis.com/css?family=Niramit";
class etk {
  static package = _package_;
  //static css = css;

  static version: number = etk.package.version;
  static title: number = "E c m a T o o l K i t";

  static #time: number = Date.now();
  static #event: Event = new Event("ETKContentLoaded");

  static #clients: Map = new Map();
  static #timestamps = new Map();
  static #debug: boolean = true;
  static #demo: boolean = true;
  static #demo_template: string = `
      <style>
            @import url(${_default_font_});
            html, body {
            font-family:Niramit;
            }
            body{color:honeydew;background:darkslategrey;text-align:center; }
            h1 {margin-bottom:0px;}
            h2 {max-width:320px; margin:0px auto;text-align:center;}
            h5 {margin-top:0px;}
            section {max-width:320px; margin:0px auto;text-align:center;}
            li{list-style: none;}
            ul {padding-inline-start: 0px;}
        </style>

        <main>
            <h1>${etk.title}</h1>
            <h5>release notes</h5>
            <h3>v${etk.version}</h3>
            <p>
              <ul>
                <li>webpack 5</li>
                <li>latest babel</li>
                <li>eslint + prettier</li>
              </ul>
            </p>
            <section>
            <h4>v1.0.0-alpha.3</h4>
            <p>
              <ul>
                <li>hooks</li>
                <li>timestamps</li>
                <li>private scope</li>
              </ul>
            </p>
            </section>
            <section>
            <h4>v1.0.0-alpha.2</h4>
            <p>
              <ul>
                <li>analytics</li>
                <li>exports</li>
                <li>server</li>
              </ul>
            </p>
            </section>
            <section>
            <h4>v1.0.0-alpha.1</h4>
            <p>
              <ul>
                <li>initial release</li>
              </ul>
            </p>
            </section>
        </main>`;

  static get time() {
    return (Date.now() - etk.#time) / 1000;
  }

  static get info() {
    return {
      timestamps: etk.#timestamps,
    };
  }

  static onPreLoad(): Function<any> {}
  static onLoad(): Function<any> {}
  static onLibraryLoad(): Function<any> {}
  static onPostLoad(): Function<any> {}

  static async initalize(TimeStamp: number): Function<void> {
    //if (document.readyState==="complete") {
    //k.#DOMContentLoaded();
    //etk.#readystatechange();
    //etk.#load();
    //} else {
    document.addEventListener("readystatechange", etk.#readystatechange);
    document.addEventListener("DOMContentLoaded", etk.#DOMContentLoaded);
    //window.addEventListener('load',etk.load);
    //}
    window.addEventListener("load", etk.load);

    etk.#timestamps.set("initalize", etk.time);

    (await etk.#debug)
      ? console.log("[Etk] initalize ", window?.etk?.default === etk, window.etk)
      : null;

    const engine = await etk.#implement(TimeStamp);
    (await etk.#debug) ? console.log("[Etk] runtime " + etk.time + "ms") : null;

    document.dispatchEvent(await etk.#event, engine);
  }

  static #implement: Function<etk> = (TimeStamp: number) => {
    if (!window?.etk?.default) {
      window.etk = {
        default: etk,
        __esModule: false,
      };

      etk.#debug
        ? console.info(
            "[Etk]",
            "Injected into Webpack-Dev-Server at " + TimeStamp + "ms",
            window.etk,
          )
        : null;

      return window.etk;
    }

    etk.#debug ? console.info("[Etk]", "Running on Server at " + TimeStamp + "ms") : null;

    return etk;
  };

  static #readystatechange(): Function<void> {
    console.log(
      "[Etk] readyState:" + document.readyState,
      window?.etk?.default === etk,
      window.etk,
    );
    etk.#timestamps.set("readystatechange", new Date().getTime());
  }

  static #DOMContentLoaded(): Function<void> {
    console.log("[Etk] DOMContentLoaded", window.etk);
    etk.#timestamps.set("DOMContentLoaded", new Date().getTime());
  }

  static #load(): Function<void> {
    etk.#timestamps.set("load", etk.time);
    if (etk.#debug) {
      console.log("[Etk] Works!", window?.etk?.default === etk, window.etk);
      if (etk.#demo) {
        document.body.insertAdjacentHTML(`afterbegin`, etk.#demo_template);
      }
    }

    etk.onLibraryLoad(...arguments);
    etk.onLoad(...arguments);
    etk.#timestamps.set("DOMContentLoaded", etk.time);
  }

  #preload(): Function<any> {}
  #postload(): Function<any> {}
  #libraryload(): Function<any> {
    etk.onLibraryLoad(...arguments);
  }

  id: number = etk.time;

  constructor() {
    etk.#load();
    etk.#clients.set(this.id, this);
  }
}

etk.initalize();

export default etk;
