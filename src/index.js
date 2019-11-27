/**
 *
 */

class etk {
    static factory = e => new etk();
    static requestAnimationFrame(DOMHighResTimeStamp){

        console.log("[Etk] requestAnimationFrame ", window.etk);
        if (window.etk)
        if (!window.etk.default){
            //console.log(window.etk)
            window.etk = {
                default:etk,
                __esModule: false
            };// etk.factory();

            console.info("[Etk]","Injected into Webpack-Dev-Server at "+DOMHighResTimeStamp+"ms");

            return window.etk;
        }

        console.info("[Etk]","Running on Webpack-Dev-Server at "+DOMHighResTimeStamp+"ms");

        return window.etk;
    };
}

requestAnimationFrame(etk.requestAnimationFrame);

export default etk;
