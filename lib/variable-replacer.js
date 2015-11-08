'use strict';

var fs = require("fs");
var path = require("path");
var glob = require("glob");
var async = require("async");
var mkdirp = require("mkdirp");
var istextorbinary = require("istextorbinary");

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
	if (typeof(options.verbose) !== "boolean") {
		options.verbose = false;
	}
	
	function end(err) {
		if (callback) {
			callback(err);
		} else if (err) {
			if (err.stack) {
				throw err;
			} else {
				throw new Error(err);
			}
		}
	}
	
	function log(message)) {
		if (options.verbose) {
			console.log(message);
		}
	}
	
	function loadData(callback) {
		if (options.dataSource) {
			var data = {};
			async.eachSeries(options.dataSource, function(ds, cb) {
				log("Loading data from "+ds+" ...");
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
						log("Merging inlineData ...");
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
			log("Resolving files "+source+" ...");
			glob(source, function (err, files) {
				if (!files) {
					end(new Error("bad source path "+source, err));
				} else if (files.length === 0){
					end(new Error("no input files found for source path "+source));
				} else {
					log("Found "+files.length+" files "+matching+" "+source);
					async.eachSeries(files, function(file, cb) {
						log("  Processing input file "+file+" ...");
						fs.stat(file, function(err, stats) {
							if (err || !stats.isFile()) {
								cb(err);
							} else {
								readFile(file, function(err, content, isbinary) {
									if (err) {
										cb(err);
									} else {
										var processedContent;
										if (isbinary) {
											processedContent = content;
											log("    "+file+" detected as binary, will be copied without processing")
										} else {
											var replacedCount = 0;
											var notReplacedCount = 0;
											processedContent = content.replace(/%([\w._-]+)%/g, function(match, key) {
												var splittedKey = key.split(".");
												var val = data;
												while (val !== undefined && splittedKey.length > 0) {
													val = val[splittedKey.shift()];
												}
												replaceCount++;
												if (val) {
													replacedCount++;
													return val;
												} else {
													notReplacedCount++;
													return match;
												}
											});
											log("    "+file+" processed - "+replacedCount+" variables replaced - "+notReplacedCount+" values not found")
										}
										writeDestFile(source, file, isbinary, processedContent, cb);
									}
								});
							}
						});
					}, callback);
				}
			});
		}, end);
	}
	
	function readFile(sourceFile, callback) {
		fs.readFile(sourceFile, function(err, data) {
			if(!data || !data.toString) {
				callback(err, data, false);
			} else {
				istextorbinary.isText(sourceFile, data, function(err, isText) {
					if (isText) {
						callback(err, data.toString("utf8"), true);
					} else {
						callback(err, data, false);
					}
				});
			}
		});
	}
	
	function writeDestFile(sourcePattern, sourceFile, isbinary, processedContent, callback) {
		resolveDestFile(sourcePattern, sourceFile, function(destFile) {
			log("    Writing " + (isbinary ? "" : " processed ") + sourceFile + " to " + destFile);
			mkdirp(path.dirname(destFile), function (err) {
				if (err) {
					callback(err);
				} else if (isbinary) {
					fs.writeFile(destFile, processedContent, callback);
				} else {
					fs.writeFile(destFile, processedContent, "utf8", callback);
				}
			});
		});
	}
	
	function resolveDestFile(sourcePattern, sourceFile, callback) {
		fs.stat(options.dest, function(err, stats) {
			if (!err && stats.isFile()) {
				callback(options.dest);
			} else if((!err && stats.isDirectory()) || options.source.length > 1 || glob.hasMagic(sourcePattern) || /^.*[\\\/]$/.test(options.dest)) {
				// options.dest is a directory
				var basePath = sourcePattern;
				while (basePath && glob.hasMagic(basePath)) {
					var lio = Math.max(basePath.lastIndexOf("/"), basePath.lastIndexOf("\\"));
					basePath = lio === -1 ? "" : basePath.substring(0, lio);
				}
				callback(path.resolve(options.dest, path.relative(basePath, sourceFile)));
			} else {
				callback(options.dest);
			}
		});
	}
	
	loadData(processFiles);
};
