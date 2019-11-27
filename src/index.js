/**
 *
 */

class etk {
    static factory = e => new etk();
    static requestAnimationFrame(DOMHighResTimeStamp){

        console.log("[Etk] requestAnimationFrame ", window.etk);
        if (window.etk)
        if (!window.etk.default){
            window.etk = etk;// etk.factory();

            console.info("[Etk]","Running on Webpack-Dev-Server at "+DOMHighResTimeStamp+"ms");

            return window.etk;
        }

        console.info("[Etk]","Running");

        return window.etk;
    };
}


//

requestAnimationFrame(etk.requestAnimationFrame);

export default etk;
module.exports = etk;
