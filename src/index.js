/**
 *
 */

class etk {
    static info:string = 'created by ryan spice';
    static factory = e => new etk();
    static ready = (DOMHighResTimeStamp) => {

        if (window.etk)
        if (!window.etk.default){
            window.etk = etk.factory();

            console.info("[Etk]","Running on Webpack-Dev-Server at "+DOMHighResTimeStamp+"ms");

            return window.etk;
        }

        console.info("[Etk]","Running");

        return window.etk;
    };
    date = new Date().getTime();
}

//

requestAnimationFrame(etk.ready);

export default etk.factory();
