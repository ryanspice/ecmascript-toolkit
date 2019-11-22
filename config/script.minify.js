
const fs = require('fs');

const path = require('path');

const exec = require('child_process').exec;

const package = require(path.resolve(process.argv[2] || ("./package.json")));

exec('mkdir lib');

const scripts = [];

const scriptsForManifest = [];

const filters = [/js/, /legacy/];

const name = package.short_name;

const files = [
	`${name}`,
	`${name}.legacy`,
	`polyfill`
];

/**
 * reads ./dist/ and generates the ./lib/ with .min files
 */
let a =async ()=>{


	const os = require('os');
	const isWin = (os.platform() === 'win32');

	if (isWin)
		exec(`yarn copyfiles -u 1 -a ./dist/**/*.* out ./lib/`);
	else
		exec(`yarn copyfiles -u 1 -a './dist/**/*.*' out './lib/'`);

	await fs.readdirSync('./dist/').filter(file => filters.some(rx => rx.test(file))).forEach(file => {

		const isLegacy = (file.split('legacy').length> 1);
		const isPollyfill = (file.split('polyfill').length > 1);
		const isManifest = (file.split('manifest').length > 1);
		const isCss = (file.split('css').length > 1);
		const isMap = (file.split('map').length > 1);
		const isJson = (file.split('json').length > 1);

		scriptsForManifest[file.replace('.', '').replace('.', '').replace('.', '')] = file;

		if (
			(isPollyfill) ||
			(isManifest) ||
			(isCss) ||
			(isJson) ||
			(isMap)
		){
			return;
		}

		const _in = `./dist/${file}`;
		const _out = `./lib/${file.split('.js')[0]}.min.js`;
		//const _out = `./lib/${file}`;

		exec(`yarn minify ${_in} --outFile ${_out}`, // --builtIns false
		  function(err, stdout, stderr) {
			if (err) throw err;
			else console.log("[minify] " + stdout);
		});

	});

};
a();
