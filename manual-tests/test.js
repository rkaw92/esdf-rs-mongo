'use strict';

var MongoReportingStore = require('../lib/MongoReportingStore');
var MongoDB = require('mongodb');
var buildProjection = require('../lib/buildProjection');

var clientPromise = MongoDB.MongoClient.connect('mongodb://localhost/test');

clientPromise.then(function(database) {
	return Promise.all([ database.collection('Widgets'), database.collection('_staging') ]);
}).then(function(collections) {
	var store = new MongoReportingStore('Widgets', collections[0], collections[1]);
	return buildProjection(store, [{ sequenceID: '123', sequenceSlot: 10 }], function() {
		return new Promise(function(fulfill, reject) {
			console.log('* Pretending to take 5s to generate model update');
			setTimeout(function() {
				fulfill({
					name: 'Widget One',
					updated: new Date()
				});
			}, 5000);
		});
	});
}).then(function() {
	console.log('Saved!');
}).catch(function(error) {
	console.error(error.stack);
});
