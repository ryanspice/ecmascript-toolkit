/**
 * EcmaToolkit - designed to be an entry point for webpack configs
 */

class etk {

    static package = require('../package');
    static version:number = etk.package.version;
    static title:number = 'E c m a T o o l K i t';

    static #time:number = Date.now();
    static #clients:Map = new Map();
    static #timestamps = new Map();
    static #debug:boolean = true;
    static #demo:boolean = true;
    static #demo_template:string = `
      <style>
            @import url("https://fonts.googleapis.com/css?family=Niramit");
            html, body {
            font-family:Niramit;
            }
            body{color:honeydew;background:darkslategrey;text-align:center; } li{list-style: none;} article {max-width:320px; margin:0px auto;text-align:left;}
        </style>
        <main>
          <h1>${etk.title}</h1>
          <h2>v${etk.version}</h2>
          <h3>release notes</h3>
          <article>
            <p>
              <ul>
                <li>- hooks</li>
                <li>- timestamps</li>
                <li>- private scope</li>
                <li>- exports</li>
              </ul>
            </p>
          </article>
      </main>`;

    static get time(){
        return ((Date.now()-etk.#time)/1000);
    }

    static get info(){
        return {
            "timestamps": etk.#timestamps
        };
    }

    static onPreLoad():Function<any>{};
    static onLoad():Function<any>{};
    static onLibraryLoad():Function<any>{};
    static onPostLoad():Function<any>{};

    // To avoid interfering with the browser, init during 'requestAnimationFrame'
    static async requestAnimationFrame(DOMHighResTimeStamp:number):Function<void> {

        etk.#timestamps.set('requestAnimationFrame', etk.time);
        //if (document.readyState==="complete") {
        //k.#DOMContentLoaded();
        //etk.#readystatechange();
        //etk.#load();
        //} else {
        document.addEventListener('readystatechange', etk.#readystatechange);
        document.addEventListener('DOMContentLoaded',etk.#DOMContentLoaded);
        //window.addEventListener('load',etk.load);
        //}
        window.addEventListener('load',etk.load);

        await etk.#debug?console.log("[Etk] requestAnimationFrame ",window?.etk?.default === etk,  window.etk):null;

        const engine = await etk.#implement(DOMHighResTimeStamp);
        await etk.#debug?console.log("[Etk] runtime "+etk.time+"ms"):null;
    };

    static #implement:Function<etk> = (DOMHighResTimeStamp:number) => {

        if (!window?.etk?.default){

            window.etk = {
                default:etk,
                __esModule: false
            };


            etk.#debug?console.info("[Etk]","Injected into Webpack-Dev-Server at "+DOMHighResTimeStamp+"ms", window.etk):null;

            return window.etk;
        }


        etk.#debug?console.info("[Etk]","Running on Server at "+DOMHighResTimeStamp+"ms"):null;

        return etk;
    };

    static #readystatechange():Function<void> {
        console.log('[Etk] readyState:' + document.readyState, window?.etk?.default === etk, window.etk);
        etk.#timestamps.set('readystatechange', new Date().getTime());
    };

    static #DOMContentLoaded():Function<void> {
       console.log('[Etk] DOMContentLoaded',window.etk);
        etk.#timestamps.set('DOMContentLoaded', new Date().getTime());
    };

    static #load():Function<void>{

        etk.#timestamps.set('load', etk.time);
        if (etk.#debug){
            console.log("[Etk] Works!", window?.etk?.default === etk, window.etk);
            if (etk.#demo) {
                document.body.insertAdjacentHTML(`afterbegin`, etk.#demo_template)
            }
        }

        etk.onLibraryLoad(...arguments);
        etk.onLoad(...arguments);
        etk.#timestamps.set('DOMContentLoaded', etk.time);
    }

    #preload():Function<any>{};
    #postload():Function<any>{};
    #libraryload():Function<any>{
        etk.onLibraryLoad(...arguments);
    };

    id:number = etk.time;

    constructor(){
        etk.#load();
        etk.#clients.set(this.id, this);
    }

}

requestAnimationFrame(etk.requestAnimationFrame);

export default etk;
