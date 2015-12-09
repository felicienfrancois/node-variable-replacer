'use strict';

var variableReplacer = require("../lib/variable-replacer.js");

process.chdir(__dirname);

variableReplacer({
    source: 'input.txt',
    logLevel: 'debug',
    dest: 'output.txt',
    dataSource: 'data.json',
    inlineData: {
        var2 : {
        	key1: 'val2'
        }
    }
});