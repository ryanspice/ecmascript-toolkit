
/**
 * EcmaToolkit - designed to be an entry point for webpack configs
 */

class etk {

    static #time:number = Date.now();

    static get time(){
        return ((Date.now()-etk.#time)/1000);
    }

    static get info(){
        return {
            "timestamps": etk.#timestamps
        };
    }

    static #clients:Map = new Map();
    static #timestamps = new Map();
    static #debug:boolean = true;
    static #demo:boolean = true;

    static #implement:Function<etk> = (DOMHighResTimeStamp:number) => {

        if (!window?.etk?.default){

            window.etk = {
                default:etk,
                __esModule: false,
                ...etk
            };


            etk.#debug?console.info("[Etk]","Injected into Webpack-Dev-Server at "+DOMHighResTimeStamp+"ms", window.etk):null;

            return window.etk;
        }


        etk.#debug?console.info("[Etk]","Running on Server at "+DOMHighResTimeStamp+"ms"):null;

        return etk;
    };

    static #readystatechange():Function<void> {
        console.log('[Etk] readyState:' + document.readyState, window.etk.default === etk, window.etk);
        etk.#timestamps.set('readystatechange', new Date().getTime());
    };

    static #DOMContentLoaded():Function<void> {
       console.log('[Etk] DOMContentLoaded',window.etk);
        etk.#timestamps.set('DOMContentLoaded', new Date().getTime());
    };

    static #load():Function<void>{

        etk.#timestamps.set('load', etk.time);
        if (etk.#debug){
            console.log("[Etk] Works!", window.etk.default === etk, window.etk);
            document.body.insertAdjacentHTML(`afterbegin`,`<style>body{color:honeydew;background:darkslategrey;text-align:center; }</style><main><h1>E c m a T o o l K i t</h1></main>`)
        }

        etk.onLibraryLoad(...arguments);
        etk.onLoad(...arguments);
        etk.#timestamps.set('DOMContentLoaded', etk.time);
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

        await etk.#debug?console.log("[Etk] requestAnimationFrame ",window.etk.default === etk,  window.etk):null;

        const engine = await etk.#implement(DOMHighResTimeStamp);
        await etk.#debug?console.log("[Etk] runtime "+etk.time+"ms"):null;
    };

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
