
/*

	Below are potential polyfills for IE
	Add to array to enable additional polyfills

*/

module.exports = [

	// Cause of Boilerplate /

	'String.prototype.startsWith',
	'Array.prototype.fill',
	'Object.entries',
	'Symbol',

	// Not included with Babel :: Some DOM, GLOBAL and stuff /

	'Element.prototype.remove',
	'Array.prototype.find',
	'Object.assign',
	'Array.from',
	'Promise',
	'fetch'
]

/* Polyfill service v3.27.1
 * For detailed credits and licence information see https://github.com/financial-times/polyfill-service.
 *
 * Features requested: default
 *
 * - _ESAbstract.IsCallable, License: CC0 (required by "Array.from", "default", "Map", "Set", "_ESAbstract.GetMethod", "Array.prototype.forEach", "URL", "Symbol", "Symbol.iterator", "Function.prototype.bind", "_ESAbstract.Construct", "Array.of", "Object.getOwnPropertyDescriptor", "Object.assign", "Array.prototype.filter", "Array.prototype.map", "_ESAbstract.OrdinaryToPrimitive", "_ESAbstract.ToPrimitive", "_ESAbstract.ToString", "Array.prototype.fill", "String.prototype.endsWith", "String.prototype.includes", "String.prototype.startsWith")
 * - _ESAbstract.CreateMethodProperty, License: CC0 (required by "Array.from", "default", "Array.of", "Array.prototype.fill", "Map", "Number.isNaN", "Object.assign", "Set", "String.prototype.endsWith", "String.prototype.includes", "String.prototype.startsWith", "Array.prototype.indexOf", "Element.prototype.after", "Element.prototype.before", "Array.isArray", "URL", "Object.create", "_ESAbstract.GetIterator", "_ESAbstract.OrdinaryCreateFromConstructor", "_ESAbstract.Construct", "Symbol", "Symbol.iterator", "Object.getOwnPropertyDescriptor", "Object.defineProperties", "Array.prototype.forEach", "Function.prototype.bind", "Object.getPrototypeOf", "Array.prototype.filter", "Array.prototype.map", "Object.getOwnPropertyNames", "Object.freeze")
 * - _ESAbstract.ToObject, License: CC0 (required by "Array.from", "default", "Array.prototype.fill", "Object.assign", "Array.prototype.indexOf", "Element.prototype.after", "Element.prototype.before", "Object.defineProperties", "URL", "Object.create", "Map", "Set", "_ESAbstract.GetIterator", "_ESAbstract.OrdinaryCreateFromConstructor", "_ESAbstract.Construct", "Array.of", "Symbol", "Symbol.iterator", "Array.prototype.forEach", "_ESAbstract.GetV", "_ESAbstract.GetMethod", "Array.prototype.filter", "Array.prototype.map")
 * - _ESAbstract.GetV, License: CC0 (required by "_ESAbstract.GetMethod", "Array.from", "default", "Map", "Set", "_ESAbstract.GetIterator")
 * - _ESAbstract.GetMethod, License: CC0 (required by "Array.from", "default", "Map", "Set", "_ESAbstract.IsConstructor", "Array.of", "_ESAbstract.GetIterator", "_ESAbstract.IteratorClose", "_ESAbstract.ToPrimitive", "_ESAbstract.ToString", "Array.prototype.fill", "String.prototype.endsWith", "String.prototype.includes", "String.prototype.startsWith")
 * - Symbol, License: MIT (required by "Map", "default", "Array.from", "Set", "Symbol.iterator", "Symbol.species")
 * - Symbol.iterator, License: MIT (required by "Array.from", "default", "Map", "Set")
 * - _ESAbstract.Type, License: CC0 (required by "Map", "default", "Array.from", "Number.isNaN", "_ESAbstract.IsConstructor", "Array.of", "_ESAbstract.GetIterator", "Set", "_ESAbstract.IteratorClose", "_ESAbstract.ToString", "Array.prototype.fill", "String.prototype.endsWith", "String.prototype.includes", "String.prototype.startsWith", "_ESAbstract.IteratorValue", "_ESAbstract.CreateIterResultObject", "_ESAbstract.IteratorComplete", "_ESAbstract.IteratorStep", "_ESAbstract.IteratorNext", "_ESAbstract.SameValueZero", "Object.create", "_ESAbstract.OrdinaryCreateFromConstructor", "_ESAbstract.Construct", "Symbol", "Symbol.iterator", "_ESAbstract.IsRegExp", "Object.defineProperties", "URL", "_ESAbstract.ToPrimitive", "_ESAbstract.GetPrototypeFromConstructor", "_ESAbstract.OrdinaryToPrimitive", "_ESAbstract.ArraySpeciesCreate", "Array.prototype.filter", "Array.prototype.map")
 * - _ESAbstract.IsConstructor, License: CC0 (required by "Array.from", "default", "Array.of", "_ESAbstract.Construct", "_ESAbstract.ArraySpeciesCreate", "Array.prototype.filter", "Symbol", "Map", "Set", "Symbol.iterator", "Array.prototype.map")
 * - _ESAbstract.Get, License: CC0 (required by "Array.from", "default", "Array.prototype.fill", "Object.assign", "_ESAbstract.IteratorValue", "Map", "Set", "Array.prototype.indexOf", "Element.prototype.after", "Element.prototype.before", "_ESAbstract.IteratorComplete", "_ESAbstract.IteratorStep", "_ESAbstract.IsRegExp", "String.prototype.endsWith", "String.prototype.includes", "String.prototype.startsWith", "Object.defineProperties", "URL", "Object.create", "_ESAbstract.GetIterator", "_ESAbstract.OrdinaryCreateFromConstructor", "_ESAbstract.Construct", "Array.of", "Symbol", "Symbol.iterator", "Array.prototype.forEach", "_ESAbstract.GetPrototypeFromConstructor", "Array.prototype.filter", "Array.prototype.map", "_ESAbstract.OrdinaryToPrimitive", "_ESAbstract.ToPrimitive", "_ESAbstract.ToString", "_ESAbstract.ArraySpeciesCreate")
 * - _ESAbstract.GetPrototypeFromConstructor, License: CC0 (required by "_ESAbstract.OrdinaryCreateFromConstructor", "Map", "default", "Array.from", "Set", "_ESAbstract.Construct", "Array.of")
 * - _ESAbstract.OrdinaryCreateFromConstructor, License: CC0 (required by "Map", "default", "Array.from", "Set", "_ESAbstract.Construct", "Array.of")
 * - _ESAbstract.Construct, License: CC0 (required by "Array.from", "default", "Array.of", "_ESAbstract.ArraySpeciesCreate", "Array.prototype.filter", "Symbol", "Map", "Set", "Symbol.iterator", "Array.prototype.map")
 * - _ESAbstract.ArrayCreate, License: CC0 (required by "Array.from", "default", "Array.of", "_ESAbstract.ArraySpeciesCreate", "Array.prototype.filter", "Symbol", "Map", "Set", "Symbol.iterator", "Array.prototype.map")
 * - _ESAbstract.Call, License: CC0 (required by "Array.from", "default", "_ESAbstract.GetIterator", "Map", "Set", "_ESAbstract.IteratorClose", "_ESAbstract.IteratorNext", "_ESAbstract.IteratorStep", "Array.prototype.forEach", "URL", "Symbol", "Symbol.iterator", "_ESAbstract.ToPrimitive", "_ESAbstract.ToString", "Array.of", "Array.prototype.fill", "String.prototype.endsWith", "String.prototype.includes", "String.prototype.startsWith", "Array.prototype.filter", "Array.prototype.map", "_ESAbstract.OrdinaryToPrimitive")
 * - _ESAbstract.GetIterator, License: CC0 (required by "Array.from", "default", "Map", "Set")
 * - _ESAbstract.IteratorClose, License: CC0 (required by "Array.from", "default", "Map", "Set")
 * - _ESAbstract.OrdinaryToPrimitive, License: CC0 (required by "_ESAbstract.ToPrimitive", "_ESAbstract.ToString", "Array.from", "default", "Array.of", "Array.prototype.fill", "String.prototype.endsWith", "String.prototype.includes", "String.prototype.startsWith")
 * - _ESAbstract.ToPrimitive, License: CC0 (required by "_ESAbstract.ToString", "Array.from", "default", "Array.of", "Array.prototype.fill", "String.prototype.endsWith", "String.prototype.includes", "String.prototype.startsWith")
 * - _ESAbstract.ToString, License: CC0 (required by "Array.from", "default", "Array.of", "Array.prototype.fill", "String.prototype.endsWith", "String.prototype.includes", "String.prototype.startsWith", "Array.prototype.indexOf", "Element.prototype.after", "Element.prototype.before", "Array.prototype.forEach", "URL", "Symbol", "Map", "Set", "Symbol.iterator", "Array.prototype.filter", "Array.prototype.map")
 * - _ESAbstract.IteratorNext, License: CC0 (required by "Map", "default", "Array.from", "Set", "_ESAbstract.IteratorStep")
 * - _ESAbstract.ToBoolean, License: CC0 (required by "_ESAbstract.IteratorComplete", "Map", "default", "Array.from", "Set", "_ESAbstract.IteratorStep", "_ESAbstract.IsRegExp", "String.prototype.endsWith", "String.prototype.includes", "String.prototype.startsWith", "Array.prototype.filter", "Symbol", "Symbol.iterator")
 * - _ESAbstract.IteratorComplete, License: CC0 (required by "Map", "default", "Array.from", "Set", "_ESAbstract.IteratorStep")
 * - _ESAbstract.IteratorStep, License: CC0 (required by "Array.from", "default", "Map", "Set")
 * - _ESAbstract.IteratorValue, License: CC0 (required by "Array.from", "default", "Map", "Set")
 * - _ESAbstract.CreateDataProperty, License: CC0 (required by "_ESAbstract.CreateDataPropertyOrThrow", "Array.from", "default", "Array.of", "_ESAbstract.CreateIterResultObject", "Map", "Set")
 * - _ESAbstract.CreateDataPropertyOrThrow, License: CC0 (required by "Array.from", "default", "Array.of", "Array.prototype.filter", "Symbol", "Map", "Set", "Symbol.iterator", "Array.prototype.map")
 * - _ESAbstract.ToInteger, License: CC0 (required by "Array.prototype.fill", "default", "String.prototype.endsWith", "String.prototype.includes", "String.prototype.startsWith", "_ESAbstract.ToLength", "Array.from", "Array.prototype.indexOf", "Element.prototype.after", "Element.prototype.before")
 * - _ESAbstract.ToLength, License: CC0 (required by "Array.from", "default", "Array.prototype.fill", "Array.prototype.indexOf", "Element.prototype.after", "Element.prototype.before", "Array.prototype.forEach", "URL", "Symbol", "Map", "Set", "Symbol.iterator", "Array.prototype.filter", "Array.prototype.map")
 * - _ESAbstract.CreateIterResultObject, License: CC0 (required by "Map", "default", "Array.from", "Set")
 * - _ESAbstract.SameValueNonNumber, License: CC0 (required by "_ESAbstract.SameValueZero", "Map", "default", "Array.from", "Set")
 * - _ESAbstract.SameValueZero, License: CC0 (required by "Map", "default", "Array.from", "Set")
 * - Symbol.species, License: MIT (required by "Map", "default", "Array.from", "Set")
 * - Map, License: CC0 (required by "default", "Array.from")
 * - Set, License: CC0 (required by "default", "Array.from")
 * - Array.from, License: CC0 (required by "default")
 * - Array.of, License: CC0 (required by "default")
 * - Event, License: CC0 (required by "default", "CustomEvent")
 * - CustomEvent, License: CC0 (required by "default")
 * - Array.prototype.fill, License: CC0 (required by "default")
 * - _mutation, License: CC0 (required by "DocumentFragment.prototype.append", "default", "DocumentFragment.prototype.prepend", "Element.prototype.after", "Element.prototype.append", "Element.prototype.before", "Element.prototype.prepend", "Element.prototype.remove", "Element.prototype.replaceWith")
 * - DocumentFragment.prototype.append, License: CC0 (required by "default")
 * - DocumentFragment.prototype.prepend, License: CC0 (required by "default")
 * - _DOMTokenList, License: ISC (required by "DOMTokenList", "default")
 * - DOMTokenList, License: CC0 (required by "default", "Element.prototype.classList")
 * - Element.prototype.append, License: CC0 (required by "default")
 * - Element.prototype.after, License: CC0 (required by "default")
 * - Element.prototype.before, License: CC0 (required by "default")
 * - Element.prototype.classList, License: ISC (required by "default")
 * - Element.prototype.matches, License: CC0 (required by "default", "Element.prototype.closest")
 * - Element.prototype.closest, License: CC0 (required by "default")
 * - Element.prototype.prepend, License: CC0 (required by "default")
 * - Element.prototype.remove, License: CC0 (required by "default")
 * - Element.prototype.replaceWith, License: CC0 (required by "default")
 * - Node.prototype.contains, License: CC0 (required by "default")
 * - Object.assign, License: CC0 (required by "default")
 * - Promise, License: MIT (required by "default")
 * - Number.isNaN, License: MIT (required by "default")
 * - _ESAbstract.RequireObjectCoercible, License: CC0 (required by "String.prototype.endsWith", "default", "String.prototype.includes", "String.prototype.startsWith")
 * - _ESAbstract.IsRegExp, License: CC0 (required by "String.prototype.endsWith", "default", "String.prototype.includes", "String.prototype.startsWith")
 * - String.prototype.endsWith, License: CC0 (required by "default")
 * - String.prototype.includes, License: CC0 (required by "default")
 * - String.prototype.startsWith, License: CC0 (required by "default")
 * - URL, License: CC0 (required by "default") */
