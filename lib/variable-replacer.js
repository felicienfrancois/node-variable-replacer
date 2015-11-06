'use strict';

var glob = require("glob");
var async = require("async");
var path = require("path");
var fs = require("fs");

module.exports = function(options, callback) {
	if (!options || !options.source || !options.dest || !(options.dataSource || options.inlineData)) {
		throw new Error("Usage: require('variable-replacer')({ source: 'source/path', dest: 'dest/path', dataSource: 'data.json', inlineData: {var1 : 'val1', var2 : 'val2' } })");
	}
	
	if (typeof(options.source) === "string") {
		options.source = [options.source];
	}
	if (typeof(options.dataSource) === "string") {
		options.dataSource = [options.dataSource];
	}
	
	function end(err) {
		if (callback) {
			callback(err);
		} else if (err) {
			throw err;
		}
	}
	
	function loadData(callback) {
		if (options.dataSource) {
			var data = {};
			async.eachSeries(options.dataSource, function(ds, cb) {
				try {
					var d = JSON.parse(fs.readFileSync(ds, "utf8"));
			        for (var prop in d) {
			            data[prop] = d[prop];
			        }
			        cb();
				} catch(err) {
					cb(err);
				}
			}, function(err) {
				if (err) {
					end(err);
				} else {
					if (options.inlineData) {
						for (var prop in options.inlineData) {
				            data[prop] = options.inlineData[prop];
				        }
					}
					callback(data);
				}
			});
		} else {
			callback(options.inlineData);
		}
	}
	
	function processFiles(data) {
		async.eachSeries(options.source, function(source, callback) {
			glob(source, function (err, files) {
				if (!files) {
					end(new Error("bad source path "+source, err));
				} else if (files.length === 0){
					end(new Error("no input files found for source path "+source));
				} else {
					async.eachSeries(files, function(file, cb) {
						fs.stat(file, function(err, stats) {
							if (err || !stats.isFile()) {
								cb(err);
							} else {
								fs.readFile(file, "utf8", function(err, content) {
									if (err) {
										cb(err);
									} else {
										var processedContent = content.replace(/%package\.([\w._-]+)%/g, function(match, key) {
											var splittedKey = key.split(".");
											var val = data;
											while (val !== undefined && splittedKey.length > 0) {
												val = val[splittedKey.shift()];
											}
											return val;
										});
										writeDestFile(file, processedContent, cb);
									}
								});
							}
						});
					}, callback);
				}
			});
		}, end);
	}
	
	function writeDestFile(sourceFile, processedContent, callback) {
		resolveDestFile(sourceFile, function(destFile) {
			fs.writeFile(destFile, processedContent, "utf8", callback);
		});
	}
	
	function resolveDestFile(sourceFile, callback) {
		fs.stat(options.dest, function(err, stats) {
			if (!err && stats.isFile()) {
				callback(options.dest);
			} else if((!err && stats.isDirectory()) || options.source.length > 1 || glob.hasMagic(options.source) || /^.*[\\\/]$/.test(options.dest)) {
				// options.dest is a directory
				callback(path.resolve(options.dest, path.basename(sourceFile)));
			} else {
				callback(options.dest);
			}
		});
	}
	
	loadData(processFiles);
};



