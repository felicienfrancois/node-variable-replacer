'use strict';

var fs = require("fs");
var path = require("path");
var glob = require("glob");
var async = require("async");
var mkdirp = require("mkdirp");
var istextorbinary = require("istextorbinary");

var LOG_LEVELS = ["none", "error", "warn", "info", "debug"];

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
	if (typeof(options.variablePattern) === "string") {
		options.variablePattern = new RegExp(options.variablePattern, "g");
	} else if (typeof(options.variablePattern) === "undefined" || !options.variablePattern) {
		options.variablePattern = /%([\w._-]+)%/g;
	}
	
	var logLevel = LOG_LEVELS.indexOf("info");
	options.logLevel = options.logLevel || options.loglevel;
	if (typeof(options.logLevel) === "string") {
		logLevel = Math.max(0, LOG_LEVELS.indexOf(options.logLevel.toLowerCase()));
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
	
	function log(level, message) {
		if (LOG_LEVELS.indexOf(level) <= logLevel) {
			if (console[level]) {
				console[level]((level.toUpperCase() + "  ").substring(0, 6) + message);
			} else {
				console.log((level.toUpperCase() + "  ").substring(0, 6) + message);
			}
		}
	}
	
	function loadData(callback) {
		if (options.dataSource) {
			var data = {};
			async.eachSeries(options.dataSource, function(ds, cb) {
				log("debug", "Loading data from "+ds+" ...");
				try {
					var d = JSON.parse(fs.readFileSync(ds, "utf8"));
			        for (var prop in d) {
			            data[prop] = d[prop];
			        }
			        cb();
				} catch(err) {
					log("error", "Failed to load data source "+ds);
					cb(err);
				}
			}, function(err) {
				if (err) {
					end(err);
				} else {
					if (options.inlineData) {
						log("debug", "Merging inlineData ...");
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
			log("debug", "Resolving files "+source+" ...");
			glob(source, function (err, files) {
				if (!files || files.length === 0) {
					log("error", "no files found matching "+source);
					end(err);
				} else {
					log("debug", "Found "+files.length+" files matching "+source);
					async.eachSeries(files, function(file, cb) {
						log("debug", "  Looking for "+file+" ...");
						fs.stat(file, function(err, stats) {
							if (err || !stats.isFile()) {
								if (err) {
									log("error", "Failed to read file infos "+file);
								}
								cb(err);
							} else {
								readFile(file, function(err, content, isbinary) {
									if (err) {
										log("error", "Failed to read " + file);
										cb(err);
									} else {
										var processedContent;
										if (isbinary) {
											processedContent = content;
											log("debug", "    "+file+" detected as binary, will be copied without processing")
										} else {
											var replacedCount = 0;
											var notReplacedCount = 0;
											processedContent = content.replace(options.variablePattern, function(match, key) {
												var splittedKey = key.split(".");
												var val = data;
												while (val !== undefined && splittedKey.length > 0) {
													val = val[splittedKey.shift()];
												}
												if (val) {
													replacedCount++;
													return val;
												} else {
													notReplacedCount++;
													return match;
												}
											});
											log(notReplacedCount ? "warn" : "debug", "    "+file+" processed - "+replacedCount+" variables replaced - "+notReplacedCount+" values not found")
										}
										writeDestFile(source, file, isbinary, processedContent, function(err, destFile) {
											if (err) {
												log("error", "Failed to write " + destFile);
											} else {
												log("info", "  Successfully "+(isbinary ? "copied" : "processed")+ " "+ file + " to "+ destFile);
											}
											cb(err);
										});
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
						callback(err, data.toString("utf8"), false);
					} else {
						callback(err, data, true);
					}
				});
			}
		});
	}
	
	function writeDestFile(sourcePattern, sourceFile, isbinary, processedContent, callback) {
		resolveDestFile(sourcePattern, sourceFile, function(destFile) {
			log("debug", "    Writing " + (isbinary ? "" : " processed ") + sourceFile + " to " + destFile);
			mkdirp(path.dirname(destFile), function (err) {
				if (err) {
					callback(err, destFile);
				} else if (isbinary) {
					fs.writeFile(destFile, processedContent, function(err) {
						callback(err, destFile);
					});
				} else {
					fs.writeFile(destFile, processedContent, "utf8", function(err) {
						callback(err, destFile);
					});
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
				while (basePath && (glob.hasMagic(basePath) || fs.statSync(basePath).isFile())) {
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
