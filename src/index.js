
class etk {
    static info:string = 'created by ryanspice';
    date = new Date().getTime();

}

requestAnimationFrame(e=>{console.info("[Etk]",window.etk);});

export default new etk();
