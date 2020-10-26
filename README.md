er# [ecmascript-toolkit](https://github.com/ryanspice/ecmascript-toolkit)

ecmascript-toolkit is a JavaScript library for using the latest webpack configs / plugins with babel 7, esdocs and analytics.

[Learn ecmascript-toolkit today](https://ryanspice.com/etk/).

## Installation

ecmascript-toolkit is designed to be used with a rendering library.

**Simply install the library and start creating UI**!

* [Add ecmascript-toolkit to a Website](https://github.com/ryanspice/ecmascript-toolkit) as a `<script>` tag in one minute.
* [Import ecmascript-toolkit module](https://www.npmjs.com/package/async.2018) (soon) if you're looking to incorporate in a more powerful toolchain.

You can use ecmascript-toolkit as a `<script>` tag locally, or as a `ecmascript-toolkit` package on [npm](https://www.npmjs.com/).


## Usage & Webpack Support

Using **ecmascript-toolkit** as a centralized point for your microforontend can help increase interoperability and decrease overall management of critical systems throughout your 'microfrontend' system.


```javascript
const master = require('ecmascript-toolkit/webpack.config.babel.js');
const merge = require('webpack-merge');

module.exports = merge(
    master,
    yourConfig
);
```

This repo, in conjunction with 'feature' based repos should be setup in a CI environment with tagging allowing devs to easily switch between new updates and old minimizing friction when developing the application. 

## Legacy Support

With **ecmascript-toolkit**, your bundles are already optimized and will export both an ES6 and ES5 bundle: **etk**, and **etk.legacy** respectively.

```html
<!-- Browsers know *not* to load this file -->
<script async type="module" src="etk.js"></script>

<!-- Older browsers load this file -->
<script nomodule src="etk.legacy.js"></script>

<!-- executed after HTML is parsed -->
<script type="module">
  console.info('js module');
</script>

<!-- executed immediately -->
<script>
  console.info('standard module');
</script>
```

ES6 bundle provides an optimized webpack output which will support modern browsers with features like **classes** and **async/await**.

## Example

Vanilla ES6

*only need to import to access libraries* 


```javascript
coming soon
```

## Documentation

N/A


### License

ecmascript-toolkit is [MIT licensed](./LICENSE).
